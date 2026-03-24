export type UserRole = 'admin' | 'user'
export type ThemeMode = 'light' | 'dark'
export type NewsSource = 'rss' | 'newsapi'
export type LangBucket = 'en' | 'zh' | 'ja'

export type EnglishWord = {
  id: string
  word: string
  meaningZh: string
  tags: string[]
  needsWork: boolean
  level: number
  lastReviewedAt: string | null
}

export type JapaneseVocab = {
  word: string
  meaningZh: string
}

export type JapaneseSentence = {
  id: string
  sentence: string
  romaji: string
  meaningZh: string
  tags: string[]
  vocabulary: JapaneseVocab[]
  level: number
  lastReviewedAt: string | null
}

export type SpeechSettings = {
  engine: 'browser' | 'openai'
  openAiVoice: string
  browserVoices: Record<LangBucket, string>
  rates: Record<LangBucket, number>
  pitches: Record<LangBucket, number>
  browserVolumes: Record<LangBucket, number>
  openAiVolumes: Record<LangBucket, number>
}

export type UserDataPayload = {
  englishWords: EnglishWord[]
  japaneseSentences: JapaneseSentence[]
  speechSettings: SpeechSettings
  theme: ThemeMode
  updatedAt: string
}

export type AuthUser = {
  account: string
  role: UserRole
  name: string
}

export type ProviderStatus = {
  tts: {
    browser: boolean
    openai: boolean
  }
  news: {
    rss: boolean
    newsapi: boolean
  }
}

export type AdminUserSummary = {
  account: string
  active: boolean
  role: UserRole
  name: string
  createdAt: string
  updatedAt: string
  englishCount: number
  japaneseCount: number
}

export type BackupFile = {
  fileName: string
  size: number
  mtime: string
}

export type NewsHeadline = {
  id: string
  title: string
  summary: string
  link: string
  source: string
  publishedAt: string | null
}

export type SpeakPart = {
  text: string
  lang: 'en-US' | 'zh-TW' | 'ja-JP'
  rate?: number
  pitch?: number
  volume?: number
  browserVoiceUri?: string
}

export type ReviewState<T> = {
  queue: T[]
  index: number
  running: boolean
  paused: boolean
  runId: number
}
