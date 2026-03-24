import type {
  AuthUser, EnglishWord, JapaneseSentence, SpeechSettings,
  ProviderStatus, AdminUserSummary, BackupFile, NewsHeadline,
  NewsSource, ThemeMode, ReviewState
} from './types'

export const AUTH_TOKEN_KEY = 'langtool.auth.token.v3'

export const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]

export const EN_STOPWORDS = new Set(['the', 'a', 'an', 'to', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'for', 'in', 'on', 'at', 'as', 'with', 'that', 'this', 'it', 'its', 'by', 'from', 'or', 'and', 'but', 'about', 'into', 'after', 'before', 'if', 'then', 'than', 'we', 'you', 'they', 'he', 'she', 'i', 'our', 'their', 'his', 'her', 'your', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'do', 'does', 'did', 'not'])

export const defaultSpeechSettings: SpeechSettings = {
  engine: 'browser',
  openAiVoice: 'alloy',
  browserVoices: { en: '', zh: '', ja: '' },
  rates: { en: 1.05, zh: 1.0, ja: 1.0 },
  pitches: { en: 1, zh: 1, ja: 1 },
  browserVolumes: { en: 1, zh: 1, ja: 1 },
  openAiVolumes: { en: 0.9, zh: 0.9, ja: 0.9 }
}

// Auth state
export let token = localStorage.getItem(AUTH_TOKEN_KEY) ?? ''
export let authUser: AuthUser | null = null
export let providerStatus: ProviderStatus = { tts: { browser: true, openai: false }, news: { rss: true, newsapi: false } }

// Learning data
export let englishWords: EnglishWord[] = []
export let japaneseSentences: JapaneseSentence[] = []
export let speechSettings: SpeechSettings = {
  ...defaultSpeechSettings,
  browserVoices: { ...defaultSpeechSettings.browserVoices },
  rates: { ...defaultSpeechSettings.rates },
  pitches: { ...defaultSpeechSettings.pitches },
  browserVolumes: { ...defaultSpeechSettings.browserVolumes },
  openAiVolumes: { ...defaultSpeechSettings.openAiVolumes }
}
export let themeMode: ThemeMode = 'light'

// UI state
export let activeTab: 'english' | 'japanese' | 'content' | 'speech' | 'admin' = 'english'
export let englishGroup = 'due'
export let japaneseGroup = 'due'
export let englishSearch = ''
export let japaneseSearch = ''

// Content workshop state
export let enCandidates: string[] = []
export let jaCandidates: string[] = []
export let enHeadlines: NewsHeadline[] = []
export let jaHeadlines: NewsHeadline[] = []
export let enNewsSource: NewsSource = 'rss'
export let jaNewsSource: NewsSource = 'rss'
export let enNewsQuery = ''
export let jaNewsQuery = ''
export let enCandidateLimit = 60
export let jaCandidateLimit = 60
export let enCandidateTags = 'news'
export let jaCandidateTags = 'news'

// Admin state
export let adminUsers: AdminUserSummary[] = []
export let backupFiles: BackupFile[] = []

// Audio state
export let voices: SpeechSynthesisVoice[] = []
export let activeAudio: HTMLAudioElement | null = null
export let tempPlaybackAbort: AbortController | null = null
export let englishAbort: AbortController | null = null
export let japaneseAbort: AbortController | null = null
export let persistTimer: number | null = null
export let persistInFlight = false
export let pendingPersist = false
export let lastOpenAiFailNoticeAt = 0

// Review state
export const englishReview: ReviewState<EnglishWord> = { queue: [], index: 0, running: false, paused: false, runId: 0 }
export const japaneseReview: ReviewState<JapaneseSentence> = { queue: [], index: 0, running: false, paused: false, runId: 0 }

// Setters
export function setToken(value: string): void { token = value }
export function setAuthUser(value: AuthUser | null): void { authUser = value }
export function setProviderStatus(value: ProviderStatus): void { providerStatus = value }
export function setEnglishWords(value: EnglishWord[]): void { englishWords = value }
export function setJapaneseSentences(value: JapaneseSentence[]): void { japaneseSentences = value }
export function setSpeechSettings(value: SpeechSettings): void { speechSettings = value }
export function setThemeMode(value: ThemeMode): void { themeMode = value }
export function setActiveTab(value: typeof activeTab): void { activeTab = value }
export function setEnglishGroup(value: string): void { englishGroup = value }
export function setJapaneseGroup(value: string): void { japaneseGroup = value }
export function setEnglishSearch(value: string): void { englishSearch = value }
export function setJapaneseSearch(value: string): void { japaneseSearch = value }
export function setEnCandidates(value: string[]): void { enCandidates = value }
export function setJaCandidates(value: string[]): void { jaCandidates = value }
export function setEnHeadlines(value: NewsHeadline[]): void { enHeadlines = value }
export function setJaHeadlines(value: NewsHeadline[]): void { jaHeadlines = value }
export function setEnNewsSource(value: NewsSource): void { enNewsSource = value }
export function setJaNewsSource(value: NewsSource): void { jaNewsSource = value }
export function setEnNewsQuery(value: string): void { enNewsQuery = value }
export function setJaNewsQuery(value: string): void { jaNewsQuery = value }
export function setEnCandidateLimit(value: number): void { enCandidateLimit = value }
export function setJaCandidateLimit(value: number): void { jaCandidateLimit = value }
export function setEnCandidateTags(value: string): void { enCandidateTags = value }
export function setJaCandidateTags(value: string): void { jaCandidateTags = value }
export function setAdminUsers(value: AdminUserSummary[]): void { adminUsers = value }
export function setBackupFiles(value: BackupFile[]): void { backupFiles = value }
export function setVoices(value: SpeechSynthesisVoice[]): void { voices = value }
export function setActiveAudio(value: HTMLAudioElement | null): void { activeAudio = value }
export function setTempPlaybackAbort(value: AbortController | null): void { tempPlaybackAbort = value }
export function setEnglishAbort(value: AbortController | null): void { englishAbort = value }
export function setJapaneseAbort(value: AbortController | null): void { japaneseAbort = value }
export function setPersistTimer(value: number | null): void { persistTimer = value }
export function setPersistInFlight(value: boolean): void { persistInFlight = value }
export function setPendingPersist(value: boolean): void { pendingPersist = value }
export function setLastOpenAiFailNoticeAt(value: number): void { lastOpenAiFailNoticeAt = value }

export function clearAuth(): void {
  token = ''
  authUser = null
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

export function applyTheme(): void {
  document.documentElement.dataset.theme = themeMode
}
