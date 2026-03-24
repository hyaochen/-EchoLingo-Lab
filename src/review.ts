import {
  englishReview, japaneseReview,
  englishAbort, japaneseAbort, tempPlaybackAbort,
  setEnglishAbort, setJapaneseAbort, setTempPlaybackAbort
} from './state'
import {
  speakEnglishWord, speakJapaneseSentence,
  stopActivePlayback, pauseActivePlayback, resumeActivePlayback
} from './speech'
import { markEnglishReviewed, markJapaneseReviewed, getEnglishQueueByGroup, getJapaneseQueueByGroup } from './data'
import { clampNumber, sleep, toast } from './utils'
import { triggerRender } from './renderBus'

export function startEnglishReview(group: string): Promise<void> {
  englishReview.queue = getEnglishQueueByGroup(group)

  if (englishReview.queue.length === 0) {
    toast('此群組目前沒有可播放內容')
    return Promise.resolve()
  }

  stopJapaneseReview(false)
  englishReview.running = true
  englishReview.paused = false
  englishReview.index = 0
  englishReview.runId += 1
  triggerRender()

  return runEnglishReview(englishReview.runId)
}

async function runEnglishReview(runId: number): Promise<void> {
  while (englishReview.running && englishReview.runId === runId && englishReview.index < englishReview.queue.length) {
    while (englishReview.paused && englishReview.running && englishReview.runId === runId) {
      await sleep(120)
    }

    if (!englishReview.running || englishReview.runId !== runId) return

    const current = englishReview.queue[englishReview.index]
    const controller = new AbortController()
    setEnglishAbort(controller)

    await speakEnglishWord(current, controller.signal)

    if (!englishReview.running || englishReview.runId !== runId) return

    markEnglishReviewed(current.id)
    englishReview.index += 1
    triggerRender()
  }

  stopEnglishReview(false)
}

export function toggleEnglishPause(): void {
  if (!englishReview.running) return

  englishReview.paused = !englishReview.paused
  if (englishReview.paused) pauseActivePlayback()
  else resumeActivePlayback()

  triggerRender()
}

export function stopEnglishReview(doStopPlayback: boolean): void {
  englishReview.running = false
  englishReview.paused = false
  englishReview.queue = []
  englishReview.index = 0
  englishReview.runId += 1

  if (englishAbort) {
    englishAbort.abort()
    setEnglishAbort(null)
  }

  if (doStopPlayback) stopActivePlayback()
  triggerRender()
}

export function shiftEnglishReview(step: number): Promise<void> {
  if (!englishReview.running || englishReview.queue.length === 0) return Promise.resolve()

  const nextIndex = clampNumber(englishReview.index + step, 0, englishReview.queue.length - 1)
  englishReview.index = nextIndex
  englishReview.paused = false
  englishReview.runId += 1

  if (englishAbort) englishAbort.abort()

  triggerRender()
  return runEnglishReview(englishReview.runId)
}

export function startJapaneseReview(group: string): Promise<void> {
  japaneseReview.queue = getJapaneseQueueByGroup(group)

  if (japaneseReview.queue.length === 0) {
    toast('此群組目前沒有可播放內容')
    return Promise.resolve()
  }

  stopEnglishReview(false)
  japaneseReview.running = true
  japaneseReview.paused = false
  japaneseReview.index = 0
  japaneseReview.runId += 1
  triggerRender()

  return runJapaneseReview(japaneseReview.runId)
}

async function runJapaneseReview(runId: number): Promise<void> {
  while (japaneseReview.running && japaneseReview.runId === runId && japaneseReview.index < japaneseReview.queue.length) {
    while (japaneseReview.paused && japaneseReview.running && japaneseReview.runId === runId) {
      await sleep(120)
    }

    if (!japaneseReview.running || japaneseReview.runId !== runId) return

    const current = japaneseReview.queue[japaneseReview.index]
    const controller = new AbortController()
    setJapaneseAbort(controller)

    await speakJapaneseSentence(current, controller.signal)

    if (!japaneseReview.running || japaneseReview.runId !== runId) return

    markJapaneseReviewed(current.id)
    japaneseReview.index += 1
    triggerRender()
  }

  stopJapaneseReview(false)
}

export function toggleJapanesePause(): void {
  if (!japaneseReview.running) return

  japaneseReview.paused = !japaneseReview.paused
  if (japaneseReview.paused) pauseActivePlayback()
  else resumeActivePlayback()

  triggerRender()
}

export function stopJapaneseReview(doStopPlayback: boolean): void {
  japaneseReview.running = false
  japaneseReview.paused = false
  japaneseReview.queue = []
  japaneseReview.index = 0
  japaneseReview.runId += 1

  if (japaneseAbort) {
    japaneseAbort.abort()
    setJapaneseAbort(null)
  }

  if (doStopPlayback) stopActivePlayback()
  triggerRender()
}

export function shiftJapaneseReview(step: number): Promise<void> {
  if (!japaneseReview.running || japaneseReview.queue.length === 0) return Promise.resolve()

  const nextIndex = clampNumber(japaneseReview.index + step, 0, japaneseReview.queue.length - 1)
  japaneseReview.index = nextIndex
  japaneseReview.paused = false
  japaneseReview.runId += 1

  if (japaneseAbort) japaneseAbort.abort()

  triggerRender()
  return runJapaneseReview(japaneseReview.runId)
}

export function stopAllPlayback(doStopPlayback: boolean): void {
  stopEnglishReview(false)
  stopJapaneseReview(false)

  if (tempPlaybackAbort) {
    tempPlaybackAbort.abort()
    setTempPlaybackAbort(null)
  }

  if (doStopPlayback) stopActivePlayback()
}
