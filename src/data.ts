import { toRomaji } from 'wanakana'
import { generateEnglishSeedWords, generateJapaneseSeedSentences } from './seedData'
import type { EnglishWord, JapaneseSentence, SpeechSettings, LangBucket, JapaneseVocab } from './types'
import {
  englishWords, japaneseSentences, speechSettings, themeMode,
  authUser, englishSearch, englishGroup, japaneseSearch, japaneseGroup,
  setEnglishWords, setJapaneseSentences, setSpeechSettings, setThemeMode,
  persistTimer, persistInFlight, pendingPersist,
  setPersistTimer, setPersistInFlight, setPendingPersist,
  REVIEW_INTERVAL_DAYS, EN_STOPWORDS, defaultSpeechSettings
} from './state'
import { apiFetch } from './api'
import { uid, clampNumber, toast } from './utils'
import { applyTheme } from './state'

export function parseTags(raw: string): string[] {
  return Array.from(new Set(raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
  )).slice(0, 10)
}

export function mergeUniqueStrings(current: string[], incoming: string[]): string[] {
  const merged = new Set<string>(current)
  incoming.forEach((item) => merged.add(item))
  return Array.from(merged)
}

export function inferJapaneseTags(sentence: string): string[] {
  const tags = ['news']
  if (/(経済|市場|投資)/.test(sentence)) tags.push('economy')
  if (/(天気|気温|台風)/.test(sentence)) tags.push('weather')
  if (/(観光|旅行|空港)/.test(sentence)) tags.push('travel')
  if (/(学校|授業|勉強)/.test(sentence)) tags.push('study')
  return parseTags(tags.join(','))
}

export function extractEnglishKeywords(text: string): string[] {
  const tokens = text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []
  const freq = new Map<string, number>()

  tokens.forEach((token) => {
    const normalized = token.toLowerCase()
    if (EN_STOPWORDS.has(normalized)) return
    freq.set(normalized, (freq.get(normalized) ?? 0) + 1)
  })

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([word]) => word)
}

export function extractJapaneseSentences(text: string): string[] {
  return Array.from(new Set(text.split(/(?<=[。！？])/).map((part) => part.trim()).filter((part) => part.length >= 8))).slice(0, 200)
}

export function parseVocabPairs(raw: string): JapaneseVocab[] {
  if (!raw.trim()) return []

  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair) => {
      const [word, meaningZh] = pair.split('=').map((segment) => segment.trim())
      return { word, meaningZh }
    })
    .filter((item) => item.word && item.meaningZh)
}

export function extractSpelling(word: string): string[] {
  const letters = Array.from(word.replace(/[^A-Za-z]/g, '').toUpperCase())
  if (letters.length > 0) return letters
  return Array.from(word)
}

export function isDue(level: number, lastReviewedAt: string | null): boolean {
  if (!lastReviewedAt) return true
  const reviewedAt = Date.parse(lastReviewedAt)
  if (Number.isNaN(reviewedAt)) return true

  const waitDays = REVIEW_INTERVAL_DAYS[level] ?? REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1]
  return Date.now() >= reviewedAt + waitDays * 24 * 60 * 60 * 1000
}

export function normalizeEnglishWords(input: EnglishWord[]): EnglishWord[] {
  return input.map((item, index) => ({
    id: item.id || `en-${index}-${uid()}`,
    word: item.word,
    meaningZh: item.meaningZh,
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [],
    needsWork: Boolean(item.needsWork),
    level: clampNumber(Number(item.level ?? 0), 0, REVIEW_INTERVAL_DAYS.length - 1),
    lastReviewedAt: item.lastReviewedAt ?? null
  }))
}

export function normalizeJapaneseSentences(input: JapaneseSentence[]): JapaneseSentence[] {
  return input.map((item, index) => ({
    id: item.id || `ja-${index}-${uid()}`,
    sentence: item.sentence,
    romaji: item.romaji || toRomaji(item.sentence),
    meaningZh: item.meaningZh,
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [],
    vocabulary: Array.isArray(item.vocabulary) ? item.vocabulary.map((vocab) => ({ word: vocab.word, meaningZh: vocab.meaningZh })) : [],
    level: clampNumber(Number(item.level ?? 0), 0, REVIEW_INTERVAL_DAYS.length - 1),
    lastReviewedAt: item.lastReviewedAt ?? null
  }))
}

export function sanitizeSpeechSettings(settings: Partial<SpeechSettings> | undefined): SpeechSettings {
  const legacyVolumes = (settings as unknown as { volumes?: Partial<Record<LangBucket, number>> } | undefined)?.volumes

  return {
    engine: settings?.engine === 'openai' ? 'openai' : 'browser',
    openAiVoice: settings?.openAiVoice || 'alloy',
    browserVoices: {
      en: settings?.browserVoices?.en ?? '',
      zh: settings?.browserVoices?.zh ?? '',
      ja: settings?.browserVoices?.ja ?? ''
    },
    rates: {
      en: clampNumber(Number(settings?.rates?.en ?? 0.95), 0.6, 1.3),
      zh: clampNumber(Number(settings?.rates?.zh ?? 0.95), 0.6, 1.3),
      ja: clampNumber(Number(settings?.rates?.ja ?? 0.95), 0.6, 1.3)
    },
    pitches: {
      en: clampNumber(Number(settings?.pitches?.en ?? 1), 0.7, 1.4),
      zh: clampNumber(Number(settings?.pitches?.zh ?? 1), 0.7, 1.4),
      ja: clampNumber(Number(settings?.pitches?.ja ?? 1), 0.7, 1.4)
    },
    browserVolumes: {
      en: clampNumber(Number(settings?.browserVolumes?.en ?? legacyVolumes?.en ?? 1), 0, 1),
      zh: clampNumber(Number(settings?.browserVolumes?.zh ?? legacyVolumes?.zh ?? 1), 0, 1),
      ja: clampNumber(Number(settings?.browserVolumes?.ja ?? legacyVolumes?.ja ?? 1), 0, 1)
    },
    openAiVolumes: {
      en: clampNumber(Number(settings?.openAiVolumes?.en ?? legacyVolumes?.en ?? 0.9), 0, 1),
      zh: clampNumber(Number(settings?.openAiVolumes?.zh ?? legacyVolumes?.zh ?? 0.9), 0, 1),
      ja: clampNumber(Number(settings?.openAiVolumes?.ja ?? legacyVolumes?.ja ?? 0.9), 0, 1)
    }
  }
}

export function getEnglishQueueByGroup(group: string): EnglishWord[] {
  return englishWords.filter((item) => {
    if (group === 'all') return true
    if (group === 'due') return isDue(item.level, item.lastReviewedAt)
    if (group === 'needs-work') return item.needsWork
    if (group.startsWith('tag:')) return item.tags.includes(group.slice(4))
    return true
  })
}

export function getVisibleEnglishWords(reviewRunning: boolean, reviewQueue: EnglishWord[]): EnglishWord[] {
  if (reviewRunning) return reviewQueue

  const keyword = englishSearch.trim().toLowerCase()
  return getEnglishQueueByGroup(englishGroup).filter((item) => {
    if (!keyword) return true
    return item.word.toLowerCase().includes(keyword) || item.meaningZh.toLowerCase().includes(keyword) || item.tags.some((tag) => tag.includes(keyword))
  })
}

export function getJapaneseQueueByGroup(group: string): JapaneseSentence[] {
  return japaneseSentences.filter((item) => {
    if (group === 'all') return true
    if (group === 'due') return isDue(item.level, item.lastReviewedAt)
    if (group.startsWith('tag:')) return item.tags.includes(group.slice(4))
    return true
  })
}

export function getVisibleJapaneseSentences(reviewRunning: boolean, reviewQueue: JapaneseSentence[]): JapaneseSentence[] {
  if (reviewRunning) return reviewQueue

  const keyword = japaneseSearch.trim().toLowerCase()
  return getJapaneseQueueByGroup(japaneseGroup).filter((item) => {
    if (!keyword) return true
    return item.sentence.toLowerCase().includes(keyword) || item.romaji.toLowerCase().includes(keyword) || item.meaningZh.toLowerCase().includes(keyword) || item.tags.some((tag) => tag.includes(keyword))
  })
}

export function markEnglishReviewed(id: string): void {
  const now = new Date().toISOString()
  setEnglishWords(englishWords.map((item) =>
    item.id === id
      ? { ...item, level: Math.min(item.level + 1, REVIEW_INTERVAL_DAYS.length - 1), lastReviewedAt: now }
      : item
  ))
  schedulePersist()
}

export function markJapaneseReviewed(id: string): void {
  const now = new Date().toISOString()
  setJapaneseSentences(japaneseSentences.map((item) =>
    item.id === id
      ? { ...item, level: Math.min(item.level + 1, REVIEW_INTERVAL_DAYS.length - 1), lastReviewedAt: now }
      : item
  ))
  schedulePersist()
}

export async function autoTranslate(text: string, from: string, to: string): Promise<string> {
  try {
    const response = await apiFetch(`/api/translate?text=${encodeURIComponent(text)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    if (!response.ok) return ''

    const payload = (await response.json()) as { translatedText: string }
    return payload.translatedText?.trim() || ''
  } catch {
    return ''
  }
}

export function schedulePersist(): void {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
  }

  setPersistTimer(window.setTimeout(() => {
    void persistUserData(false)
  }, 500))
}

export async function persistUserData(force: boolean): Promise<void> {
  if (!authUser) return

  if (persistInFlight && !force) {
    setPendingPersist(true)
    return
  }

  setPersistInFlight(true)
  try {
    const payload = {
      englishWords,
      japaneseSentences,
      speechSettings,
      theme: themeMode
    }

    const response = await apiFetch('/api/user/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      toast('同步資料失敗')
    }
  } catch {
    toast('同步資料失敗')
  } finally {
    setPersistInFlight(false)
    if (pendingPersist) {
      setPendingPersist(false)
      void persistUserData(false)
    }
  }
}

export function setLocalSeedFallback(): void {
  setEnglishWords(generateEnglishSeedWords(220).map((item, index) => ({
    id: `en-local-${index + 1}`,
    word: item.word,
    meaningZh: item.meaningZh,
    tags: [...item.tags],
    needsWork: false,
    level: 0,
    lastReviewedAt: null
  })))

  setJapaneseSentences(generateJapaneseSeedSentences(220).map((item, index) => ({
    id: `ja-local-${index + 1}`,
    sentence: item.sentence,
    romaji: item.romaji,
    meaningZh: item.meaningZh,
    tags: [...item.tags],
    vocabulary: item.vocabulary.map((vocab) => ({ ...vocab })),
    level: 0,
    lastReviewedAt: null
  })))

  setSpeechSettings({
    ...defaultSpeechSettings,
    browserVoices: { ...defaultSpeechSettings.browserVoices },
    rates: { ...defaultSpeechSettings.rates },
    pitches: { ...defaultSpeechSettings.pitches },
    browserVolumes: { ...defaultSpeechSettings.browserVolumes },
    openAiVolumes: { ...defaultSpeechSettings.openAiVolumes }
  })
  setThemeMode('light')
  applyTheme()
}
