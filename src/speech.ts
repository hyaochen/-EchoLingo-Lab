import type { SpeakPart, LangBucket, EnglishWord, JapaneseSentence } from './types'
import {
  speechSettings, providerStatus, voices, activeAudio, tempPlaybackAbort,
  setVoices, setActiveAudio, setTempPlaybackAbort, setLastOpenAiFailNoticeAt,
  lastOpenAiFailNoticeAt, authUser, activeTab
} from './state'
import { apiFetch, safeReadText } from './api'
import { clampNumber, toast, sleep } from './utils'
import { triggerRender } from './renderBus'
import { extractSpelling } from './data'

// Persistent Audio element — reuse across playbacks to keep mobile "user gesture" unlock.
// On mobile browsers (iOS Safari, Chrome Android), creating new Audio() loses the gesture
// chain, causing autoplay to be blocked after the first playback.
let _persistentAudio: HTMLAudioElement | null = null

function getPersistentAudio(): HTMLAudioElement {
  if (!_persistentAudio) {
    _persistentAudio = new Audio()
  }
  return _persistentAudio
}

export function toLangBucket(lang: SpeakPart['lang']): LangBucket {
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('zh')) return 'zh'
  return 'en'
}

export function resolvePartVolume(part: SpeakPart, engine: 'browser' | 'openai'): number {
  if (typeof part.volume === 'number') return clampNumber(part.volume, 0, 1)
  const bucket = toLangBucket(part.lang)
  return engine === 'openai'
    ? clampNumber(speechSettings.openAiVolumes[bucket], 0, 1)
    : clampNumber(speechSettings.browserVolumes[bucket], 0, 1)
}

export function chooseVoice(lang: SpeakPart['lang'], overrideVoiceUri?: string): SpeechSynthesisVoice | null {
  const bucket = toLangBucket(lang)
  const selectedUri = overrideVoiceUri || speechSettings.browserVoices[bucket]

  if (selectedUri) {
    const selected = voices.find((voice) => voice.voiceURI === selectedUri)
    if (selected) return selected
  }

  return voices.find((voice) => voice.lang.toLowerCase().startsWith(bucket)) ?? null
}

export function maybeNotifyOpenAiFallback(detail: string): void {
  const now = Date.now()
  if (now - lastOpenAiFailNoticeAt < 4000) return
  setLastOpenAiFailNoticeAt(now)
  toast(`OpenAI TTS 未生效，已改用瀏覽器聲音：${detail}`)
}

export function initSpeechVoices(): void {
  if (!('speechSynthesis' in window)) return

  const load = (): void => {
    setVoices(window.speechSynthesis.getVoices())
    if (authUser && activeTab === 'speech') triggerRender()
  }

  load()
  window.speechSynthesis.onvoiceschanged = load
}

export function pauseActivePlayback(): void {
  if (activeAudio) {
    activeAudio.pause()
    return
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.pause()
  }
}

export function resumeActivePlayback(): void {
  if (activeAudio) {
    void activeAudio.play().catch(() => undefined)
    return
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.resume()
  }
}

export function stopActivePlayback(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }

  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
    // Don't clear .src on persistent audio — just stop it
    setActiveAudio(null)
  }
}

export function playAudioUrl(url: string, signal: AbortSignal, volume: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }

    const audio = getPersistentAudio()
    audio.pause()
    audio.currentTime = 0
    audio.volume = clampNumber(volume, 0, 1)
    audio.src = url
    setActiveAudio(audio)

    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      audio.onended = null
      audio.onerror = null
      if (activeAudio === audio) setActiveAudio(null)
      resolve(ok)
    }

    const onAbort = (): void => {
      audio.pause()
      audio.currentTime = 0
      finish(false)
    }

    audio.onended = () => finish(true)
    audio.onerror = () => finish(false)
    signal.addEventListener('abort', onAbort, { once: true })

    void audio.play().catch(() => finish(false))
  })
}

export function speakPartWithBrowser(part: SpeakPart, signal: AbortSignal, volume: number): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve()

  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const utterance = new SpeechSynthesisUtterance(part.text)
    utterance.lang = part.lang
    utterance.rate = part.rate ?? 1
    utterance.pitch = part.pitch ?? 1
    utterance.volume = clampNumber(volume, 0, 1)

    const voice = chooseVoice(part.lang, part.browserVoiceUri)
    if (voice) utterance.voice = voice

    const finish = (): void => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }

    const onAbort = (): void => {
      window.speechSynthesis.cancel()
      finish()
    }

    utterance.onend = finish
    utterance.onerror = finish
    signal.addEventListener('abort', onAbort, { once: true })

    window.speechSynthesis.speak(utterance)
  })
}

export async function speakPartWithOpenAi(part: SpeakPart, signal: AbortSignal, volume: number): Promise<boolean> {
  if (!providerStatus.tts.openai) return false

  try {
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: part.text, lang: part.lang, voice: speechSettings.openAiVoice, speed: part.rate ?? 1 })
    })

    if (!response.ok) {
      const detail = await safeReadText(response)
      maybeNotifyOpenAiFallback(detail)
      return false
    }

    const objectUrl = URL.createObjectURL(await response.blob())
    const played = await playAudioUrl(objectUrl, signal, volume)
    URL.revokeObjectURL(objectUrl)
    if (!played) {
      maybeNotifyOpenAiFallback('OpenAI 音訊播放受限，已改用瀏覽器聲音')
      return false
    }
    return true
  } catch {
    maybeNotifyOpenAiFallback('OpenAI TTS 連線失敗，已改用瀏覽器聲音')
    return false
  }
}

export async function speakByParts(parts: SpeakPart[], signal: AbortSignal): Promise<void> {
  for (const part of parts) {
    if (signal.aborted) return

    const openAiVolume = resolvePartVolume(part, 'openai')
    const browserVolume = resolvePartVolume(part, 'browser')

    const usedOpenAi = speechSettings.engine === 'openai'
      ? await speakPartWithOpenAi(part, signal, openAiVolume)
      : false
    if (!usedOpenAi) {
      await speakPartWithBrowser(part, signal, browserVolume)
    }

    await sleep(140)
  }
}

export async function speakSingleOpenAiText(text: string, signal: AbortSignal, speed: number, volume: number): Promise<void> {
  if (!providerStatus.tts.openai) {
    toast('OpenAI TTS 尚未啟用')
    return
  }
  if (signal.aborted) return

  try {
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: speechSettings.openAiVoice,
        speed: clampNumber(speed, 0.6, 1.3)
      })
    })

    if (!response.ok) {
      const detail = await safeReadText(response)
      toast(`OpenAI TTS 失敗：${detail}`)
      return
    }

    const objectUrl = URL.createObjectURL(await response.blob())
    const played = await playAudioUrl(objectUrl, signal, clampNumber(volume, 0, 1))
    URL.revokeObjectURL(objectUrl)

    if (!played && !signal.aborted) {
      toast('OpenAI 音訊播放失敗，請再試一次')
    }
  } catch {
    if (!signal.aborted) toast('OpenAI TTS 連線失敗')
  }
}

export function speakEnglishWord(item: EnglishWord, signal: AbortSignal): Promise<void> {
  const letters = extractSpelling(item.word).join(' ')
  if (speechSettings.engine === 'openai') {
    const spellOut = extractSpelling(item.word).join(', ')
    const script = `${item.word}。${spellOut}。${item.meaningZh}。`
    const volume = clampNumber((speechSettings.openAiVolumes.en + speechSettings.openAiVolumes.zh) / 2, 0, 1)
    return speakSingleOpenAiText(script, signal, speechSettings.rates.en, volume)
  }

  return speakByParts([
    { text: item.word, lang: 'en-US', rate: speechSettings.rates.en, pitch: speechSettings.pitches.en },
    { text: letters, lang: 'en-US', rate: speechSettings.rates.en, pitch: speechSettings.pitches.en },
    { text: item.meaningZh, lang: 'zh-TW', rate: speechSettings.rates.zh, pitch: speechSettings.pitches.zh }
  ], signal)
}

export function speakJapaneseSentence(item: JapaneseSentence, signal: AbortSignal): Promise<void> {
  if (speechSettings.engine === 'openai') {
    const script = `${item.sentence}。${item.meaningZh}。`
    const volume = clampNumber((speechSettings.openAiVolumes.ja + speechSettings.openAiVolumes.zh) / 2, 0, 1)
    return speakSingleOpenAiText(script, signal, speechSettings.rates.ja, volume)
  }

  return speakByParts([
    { text: item.sentence, lang: 'ja-JP', rate: speechSettings.rates.ja, pitch: speechSettings.pitches.ja },
    { text: item.meaningZh, lang: 'zh-TW', rate: speechSettings.rates.zh, pitch: speechSettings.pitches.zh }
  ], signal)
}

export async function playSingleEnglish(item: EnglishWord): Promise<void> {
  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  setTempPlaybackAbort(controller)
  await speakEnglishWord(item, controller.signal)
  setTempPlaybackAbort(null)
}

export async function playSingleJapanese(item: JapaneseSentence): Promise<void> {
  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  setTempPlaybackAbort(controller)
  await speakJapaneseSentence(item, controller.signal)
  setTempPlaybackAbort(null)
}

export async function testSpeech(): Promise<void> {
  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  setTempPlaybackAbort(controller)

  await speakByParts([
    { text: `This is an English voice test using ${speechSettings.engine}.`, lang: 'en-US', rate: speechSettings.rates.en, pitch: speechSettings.pitches.en },
    { text: '這是中文語音測試。', lang: 'zh-TW', rate: speechSettings.rates.zh, pitch: speechSettings.pitches.zh },
    { text: 'これは日本語の音声テストです。', lang: 'ja-JP', rate: speechSettings.rates.ja, pitch: speechSettings.pitches.ja }
  ], controller.signal)

  setTempPlaybackAbort(null)
}

export async function previewBrowserVoice(bucket: LangBucket, voiceUri: string): Promise<void> {
  const sampleText = bucket === 'en'
    ? 'This is an English browser voice preview.'
    : bucket === 'zh'
      ? '這是中文瀏覽器聲音試聽。'
      : 'これは日本語ブラウザ音声の試聴です。'
  const lang = bucket === 'en' ? 'en-US' as const : bucket === 'zh' ? 'zh-TW' as const : 'ja-JP' as const

  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  setTempPlaybackAbort(controller)

  await speakPartWithBrowser(
    {
      text: sampleText,
      lang,
      rate: speechSettings.rates[bucket],
      pitch: speechSettings.pitches[bucket],
      browserVoiceUri: voiceUri
    },
    controller.signal,
    speechSettings.browserVolumes[bucket]
  )
  setTempPlaybackAbort(null)
}

export async function verifyOpenAiVoice(voice: string): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Voice test', lang: 'en-US', voice, speed: 1 })
    })
    if (!response.ok) {
      const detail = await response.text()
      return { ok: false, message: detail }
    }
    return { ok: true, message: '' }
  } catch {
    return { ok: false, message: '無法連線到 TTS 服務' }
  }
}
