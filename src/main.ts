
import './style.css'
import { toRomaji } from 'wanakana'
import { generateEnglishSeedWords, generateJapaneseSeedSentences } from './seedData'

type UserRole = 'admin' | 'user'
type ThemeMode = 'light' | 'dark'
type NewsSource = 'rss' | 'newsapi'
type LangBucket = 'en' | 'zh' | 'ja'

type EnglishWord = {
  id: string
  word: string
  meaningZh: string
  tags: string[]
  needsWork: boolean
  level: number
  lastReviewedAt: string | null
}

type JapaneseVocab = {
  word: string
  meaningZh: string
}

type JapaneseSentence = {
  id: string
  sentence: string
  romaji: string
  meaningZh: string
  tags: string[]
  vocabulary: JapaneseVocab[]
  level: number
  lastReviewedAt: string | null
}

type SpeechSettings = {
  engine: 'browser' | 'openai'
  openAiVoice: string
  browserVoices: Record<LangBucket, string>
  rates: Record<LangBucket, number>
  pitches: Record<LangBucket, number>
  browserVolumes: Record<LangBucket, number>
  openAiVolumes: Record<LangBucket, number>
}

type UserDataPayload = {
  englishWords: EnglishWord[]
  japaneseSentences: JapaneseSentence[]
  speechSettings: SpeechSettings
  theme: ThemeMode
  updatedAt: string
}

type AuthUser = {
  account: string
  role: UserRole
  name: string
}

type ProviderStatus = {
  tts: {
    browser: boolean
    openai: boolean
  }
  news: {
    rss: boolean
    newsapi: boolean
  }
}

type AdminUserSummary = {
  account: string
  active: boolean
  role: UserRole
  name: string
  createdAt: string
  updatedAt: string
  englishCount: number
  japaneseCount: number
}

type BackupFile = {
  fileName: string
  size: number
  mtime: string
}

type NewsHeadline = {
  id: string
  title: string
  summary: string
  link: string
  source: string
  publishedAt: string | null
}

type SpeakPart = {
  text: string
  lang: 'en-US' | 'zh-TW' | 'ja-JP'
  rate?: number
  pitch?: number
  volume?: number
  browserVoiceUri?: string
}

type ReviewState<T> = {
  queue: T[]
  index: number
  running: boolean
  paused: boolean
  runId: number
}

const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]
const AUTH_TOKEN_KEY = 'langtool.auth.token.v3'

const EN_STOPWORDS = new Set(['the', 'a', 'an', 'to', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'for', 'in', 'on', 'at', 'as', 'with', 'that', 'this', 'it', 'its', 'by', 'from', 'or', 'and', 'but', 'about', 'into', 'after', 'before', 'if', 'then', 'than', 'we', 'you', 'they', 'he', 'she', 'i', 'our', 'their', 'his', 'her', 'your', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'do', 'does', 'did', 'not'])

const defaultSpeechSettings: SpeechSettings = {
  engine: 'browser',
  openAiVoice: 'alloy',
  browserVoices: { en: '', zh: '', ja: '' },
  rates: { en: 0.95, zh: 0.95, ja: 0.95 },
  pitches: { en: 1, zh: 1, ja: 1 },
  browserVolumes: { en: 1, zh: 1, ja: 1 },
  openAiVolumes: { en: 0.9, zh: 0.9, ja: 0.9 }
}

let token = localStorage.getItem(AUTH_TOKEN_KEY) ?? ''
let authUser: AuthUser | null = null
let providerStatus: ProviderStatus = { tts: { browser: true, openai: false }, news: { rss: true, newsapi: false } }

let englishWords: EnglishWord[] = []
let japaneseSentences: JapaneseSentence[] = []
let speechSettings: SpeechSettings = {
  ...defaultSpeechSettings,
  browserVoices: { ...defaultSpeechSettings.browserVoices },
  rates: { ...defaultSpeechSettings.rates },
  pitches: { ...defaultSpeechSettings.pitches },
  browserVolumes: { ...defaultSpeechSettings.browserVolumes },
  openAiVolumes: { ...defaultSpeechSettings.openAiVolumes }
}
let themeMode: ThemeMode = 'light'

let activeTab: 'english' | 'japanese' | 'content' | 'speech' | 'admin' = 'english'
let englishGroup = 'due'
let japaneseGroup = 'due'
let englishSearch = ''
let japaneseSearch = ''

let enCandidates: string[] = []
let jaCandidates: string[] = []
let enHeadlines: NewsHeadline[] = []
let jaHeadlines: NewsHeadline[] = []
let enNewsSource: NewsSource = 'rss'
let jaNewsSource: NewsSource = 'rss'
let enNewsQuery = ''
let jaNewsQuery = ''
let enCandidateLimit = 60
let jaCandidateLimit = 60
let enCandidateTags = 'news'
let jaCandidateTags = 'news'

let adminUsers: AdminUserSummary[] = []
let backupFiles: BackupFile[] = []

let voices: SpeechSynthesisVoice[] = []
let activeAudio: HTMLAudioElement | null = null
let tempPlaybackAbort: AbortController | null = null
let englishAbort: AbortController | null = null
let japaneseAbort: AbortController | null = null
let persistTimer: number | null = null
let persistInFlight = false
let pendingPersist = false
let lastOpenAiFailNoticeAt = 0

const englishReview: ReviewState<EnglishWord> = { queue: [], index: 0, running: false, paused: false, runId: 0 }
const japaneseReview: ReviewState<JapaneseSentence> = { queue: [], index: 0, running: false, paused: false, runId: 0 }

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('App root not found')
const app = appRoot

initSpeechVoices()
applyTheme()
void bootstrap()

async function bootstrap(): Promise<void> {
  if (!token) {
    setLocalSeedFallback()
    render()
    return
  }

  const me = await fetchMe()
  if (!me) {
    clearAuth()
    setLocalSeedFallback()
    render()
    return
  }

  authUser = me
  await Promise.all([loadProviderStatus(), loadUserData()])

  if (authUser.role === 'admin') {
    await Promise.all([loadAdminUsers(), loadBackups()])
  }

  render()
}

function render(): void {
  if (!authUser) {
    renderLoginView()
    return
  }

  renderAppShell()
  renderCurrentTab()
  bindGlobalActions()
}

function renderLoginView(): void {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>EchoLingo Lab</h1>
        <p>請以你的帳號密碼登入。</p>
        <form id="loginForm" class="stack-form">
          <label>帳號
            <input id="loginAccount" autocomplete="username" required />
          </label>
          <label>密碼
            <input id="loginPassword" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit">登入</button>
        </form>
      </div>
    </div>
  `

  byId<HTMLFormElement>('loginForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void login()
  })
}

function renderAppShell(): void {
  const isAdmin = authUser?.role === 'admin'

  app.innerHTML = `
    <div class="app-shell">
      <header class="hero">
        <div>
          <p class="hero-kicker">EchoLingo Lab</p>
          <h1>語言學習控制台</h1>
          <p class="hero-subtitle">登入者：${escapeHtml(authUser?.name ?? '')}（${escapeHtml(authUser?.account ?? '')} / ${authUser?.role === 'admin' ? '管理員' : '一般使用者'}）</p>
        </div>
        <div class="hero-actions">
          <button id="themeToggleBtn" class="secondary">${themeMode === 'dark' ? '切換淺色模式' : '切換深色模式'}</button>
          <button id="stopSpeechBtn" class="secondary">停止朗讀</button>
          <button id="logoutBtn" class="danger">登出</button>
        </div>
      </header>

      <nav class="tabbar" aria-label="主功能">
        <button class="tab-btn ${activeTab === 'english' ? 'is-active' : ''}" data-tab="english">英文單字</button>
        <button class="tab-btn ${activeTab === 'japanese' ? 'is-active' : ''}" data-tab="japanese">日文句子</button>
        <button class="tab-btn ${activeTab === 'content' ? 'is-active' : ''}" data-tab="content">內容工坊</button>
        <button class="tab-btn ${activeTab === 'speech' ? 'is-active' : ''}" data-tab="speech">聲音設定</button>
        ${isAdmin ? `<button class="tab-btn ${activeTab === 'admin' ? 'is-active' : ''}" data-tab="admin">後台管理</button>` : ''}
      </nav>

      <main>
        <section id="tab-english" class="tab-panel ${activeTab === 'english' ? 'is-active' : ''}"></section>
        <section id="tab-japanese" class="tab-panel ${activeTab === 'japanese' ? 'is-active' : ''}"></section>
        <section id="tab-content" class="tab-panel ${activeTab === 'content' ? 'is-active' : ''}"></section>
        <section id="tab-speech" class="tab-panel ${activeTab === 'speech' ? 'is-active' : ''}"></section>
        ${isAdmin ? `<section id="tab-admin" class="tab-panel ${activeTab === 'admin' ? 'is-active' : ''}"></section>` : ''}
      </main>
    </div>
  `

  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab as typeof activeTab
      render()
    })
  })
}

function renderCurrentTab(): void {
  if (!authUser) return

  if (activeTab === 'english') renderEnglishTab()
  if (activeTab === 'japanese') renderJapaneseTab()
  if (activeTab === 'content') renderContentTab()
  if (activeTab === 'speech') renderSpeechTab()
  if (activeTab === 'admin') renderAdminTab()
}
function renderEnglishTab(): void {
  const panel = byId<HTMLDivElement>('tab-english')
  const dueCount = englishWords.filter((item) => isDue(item.level, item.lastReviewedAt)).length
  const needsWorkCount = englishWords.filter((item) => item.needsWork).length
  const filteredWords = getVisibleEnglishWords()
  const progress = englishReview.running
    ? `進度 ${Math.min(englishReview.index + 1, englishReview.queue.length)}/${englishReview.queue.length}`
    : '尚未開始播放'

  panel.innerHTML = `
    <div class="panel-head">
      <h2>英文單字模式</h2>
      <p>流程：單字發音 -> 字母拼讀 -> 繁中意涵。</p>
      <p class="muted">待複習 ${dueCount} 個，需加強 ${needsWorkCount} 個</p>
    </div>

    <div class="card-grid">
      <article class="card">
        <h3>新增英文單字</h3>
        <form id="englishAddForm" class="stack-form">
          <label>英文單字
            <input id="englishWordInput" required placeholder="momentum" />
          </label>
          <label>繁體中文意涵（可留空自動生成）
            <input id="englishMeaningInput" placeholder="動能；趨勢動力" />
          </label>
          <label>標籤（逗號分隔）
            <input id="englishTagsInput" placeholder="news, business" />
          </label>
          <button type="submit">新增</button>
        </form>
      </article>

      <article class="card player-card">
        <h3>今日英文播放器</h3>
        <p>${escapeHtml(progress)}</p>
        <label>播放群組
          <select id="englishGroupSelect">
            ${renderEnglishGroupOptions()}
          </select>
        </label>
        <label>搜尋單字或中文
          <input id="englishSearchInput" placeholder="輸入關鍵字過濾，例如 market 或 市場" value="${escapeHtmlAttr(englishSearch)}" />
        </label>
        <div class="chips-wrap">${renderEnglishTagChips()}</div>
        <p class="muted">${englishReview.running ? `播放中僅顯示本群組，共 ${englishReview.queue.length} 筆` : `目前顯示 ${filteredWords.length} / ${englishWords.length} 筆`}</p>
        <div class="transport-grid">
          <button id="enStartBtn" class="transport-main">開始</button>
          <button id="enPauseBtn" class="secondary" ${englishReview.running ? '' : 'disabled'}>${englishReview.paused ? '續播' : '暫停'}</button>
          <button id="enPrevBtn" class="secondary" ${englishReview.running ? '' : 'disabled'}>上一個</button>
          <button id="enNextBtn" class="secondary" ${englishReview.running ? '' : 'disabled'}>下一個</button>
          <button id="enStopBtn" class="danger" ${englishReview.running ? '' : 'disabled'}>停止</button>
        </div>
      </article>
    </div>

    <div class="list-wrap">
      ${filteredWords.length > 0 ? filteredWords.map((item) => renderEnglishRow(item)).join('') : '<article class="card"><p class="muted">目前沒有符合條件的英文單字。</p></article>'}
    </div>
  `

  byId<HTMLFormElement>('englishAddForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void addEnglishWord()
  })

  byId<HTMLSelectElement>('englishGroupSelect').addEventListener('change', (event) => {
    englishGroup = (event.currentTarget as HTMLSelectElement).value
    render()
  })

  byId<HTMLInputElement>('englishSearchInput').addEventListener('input', (event) => {
    englishSearch = (event.currentTarget as HTMLInputElement).value
    render()
  })

  byId<HTMLButtonElement>('enStartBtn').addEventListener('click', () => {
    void startEnglishReview()
  })
  byId<HTMLButtonElement>('enPauseBtn').addEventListener('click', () => {
    toggleEnglishPause()
  })
  byId<HTMLButtonElement>('enPrevBtn').addEventListener('click', () => {
    void shiftEnglishReview(-1)
  })
  byId<HTMLButtonElement>('enNextBtn').addEventListener('click', () => {
    void shiftEnglishReview(1)
  })
  byId<HTMLButtonElement>('enStopBtn').addEventListener('click', () => {
    stopEnglishReview(true)
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-en-group]').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.dataset.enGroup
      if (!group) return
      englishGroup = group
      render()
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-en-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.enAction
      const id = button.dataset.id
      if (!id) return

      if (action === 'play') {
        const item = englishWords.find((word) => word.id === id)
        if (item) void playSingleEnglish(item)
      }

      if (action === 'needs-work') {
        englishWords = englishWords.map((word) => (word.id === id ? { ...word, needsWork: !word.needsWork } : word))
        schedulePersist()
        render()
      }

      if (action === 'reviewed') {
        markEnglishReviewed(id)
        render()
      }

      if (action === 'edit-tags') {
        const target = englishWords.find((word) => word.id === id)
        if (!target) return
        const next = window.prompt('請輸入標籤（逗號分隔）', target.tags.join(', '))
        if (next === null) return
        englishWords = englishWords.map((word) => (word.id === id ? { ...word, tags: parseTags(next) } : word))
        schedulePersist()
        render()
      }

      if (action === 'delete') {
        englishWords = englishWords.filter((word) => word.id !== id)
        schedulePersist()
        render()
      }
    })
  })
}

function renderEnglishGroupOptions(): string {
  const tags = Array.from(new Set(englishWords.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b))
  const options = [
    { value: 'due', label: '今日待複習' },
    { value: 'needs-work', label: '需加強' },
    { value: 'all', label: '全部' },
    ...tags.map((tag) => ({ value: `tag:${tag}`, label: `標籤：${tag}` }))
  ]

  return options
    .map((option) => `<option value="${escapeHtmlAttr(option.value)}" ${englishGroup === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('')
}

function renderEnglishTagChips(): string {
  const tags = Array.from(new Set(englishWords.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b))
  if (tags.length === 0) return '<span class="muted">尚無可用標籤</span>'
  return tags
    .map((tag) => {
      const active = englishGroup === `tag:${tag}`
      return `<button class="chip" data-en-group="tag:${escapeHtmlAttr(tag)}" ${active ? 'disabled' : ''}>${escapeHtml(tag)}</button>`
    })
    .join('')
}

function renderEnglishRow(item: EnglishWord): string {
  const tags = item.tags.length > 0 ? item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('') : '<span class="muted">無標籤</span>'
  const reviewedAt = item.lastReviewedAt ? formatTime(item.lastReviewedAt) : '尚未複習'

  return `
    <article class="list-card">
      <div class="list-main">
        <p><strong>${escapeHtml(item.word)}</strong> ・ ${escapeHtml(item.meaningZh)}</p>
        <p class="muted">複習：${reviewedAt}${item.needsWork ? ' ・ 需加強' : ''}</p>
        <div class="tag-wrap">${tags}</div>
      </div>
      <div class="row-actions">
        <button data-en-action="play" data-id="${escapeHtmlAttr(item.id)}">朗讀</button>
        <button data-en-action="edit-tags" data-id="${escapeHtmlAttr(item.id)}" class="secondary">編輯標籤</button>
        <button data-en-action="needs-work" data-id="${escapeHtmlAttr(item.id)}" class="secondary">${item.needsWork ? '取消需加強' : '標記需加強'}</button>
        <button data-en-action="reviewed" data-id="${escapeHtmlAttr(item.id)}" class="secondary">已複習</button>
        <button data-en-action="delete" data-id="${escapeHtmlAttr(item.id)}" class="danger">刪除</button>
      </div>
    </article>
  `
}

function renderJapaneseTab(): void {
  const panel = byId<HTMLDivElement>('tab-japanese')
  const dueCount = japaneseSentences.filter((item) => isDue(item.level, item.lastReviewedAt)).length
  const filteredSentences = getVisibleJapaneseSentences()
  const progress = japaneseReview.running
    ? `進度 ${Math.min(japaneseReview.index + 1, japaneseReview.queue.length)}/${japaneseReview.queue.length}`
    : '尚未開始播放'

  panel.innerHTML = `
    <div class="panel-head">
      <h2>日文句子模式</h2>
      <p>流程：句子朗讀 -> 繁中意涵；支援全句羅馬拼音。</p>
      <p class="muted">待複習 ${dueCount} 句</p>
    </div>

    <div class="card-grid">
      <article class="card">
        <h3>新增日文句子</h3>
        <form id="japaneseAddForm" class="stack-form">
          <label>日文句子
            <textarea id="jaSentenceInput" required placeholder="明日は図書館で日本語を勉強します。"></textarea>
          </label>
          <label>羅馬拼音（可留空自動生成）
            <input id="jaRomajiInput" placeholder="Ashita wa toshokan de nihongo o benkyou shimasu." />
          </label>
          <label>繁體中文意涵（可留空自動生成）
            <textarea id="jaMeaningInput" placeholder="明天會在圖書館學日文。"></textarea>
          </label>
          <label>單字對照（可選，格式：単語=單字; 勉強=學習）
            <input id="jaVocabInput" placeholder="単語=單字; 勉強=學習" />
          </label>
          <label>標籤（逗號分隔）
            <input id="jaTagsInput" placeholder="daily, news" />
          </label>
          <button type="submit">新增</button>
        </form>
      </article>

      <article class="card player-card">
        <h3>今日日文播放器</h3>
        <p>${escapeHtml(progress)}</p>
        <label>播放群組
          <select id="japaneseGroupSelect">
            ${renderJapaneseGroupOptions()}
          </select>
        </label>
        <label>搜尋句子或中文
          <input id="japaneseSearchInput" placeholder="輸入關鍵字過濾" value="${escapeHtmlAttr(japaneseSearch)}" />
        </label>
        <p class="muted">${japaneseReview.running ? `播放中僅顯示本群組，共 ${japaneseReview.queue.length} 句` : `目前顯示 ${filteredSentences.length} / ${japaneseSentences.length} 句`}</p>
        <div class="transport-grid">
          <button id="jaStartBtn" class="transport-main">開始</button>
          <button id="jaPauseBtn" class="secondary" ${japaneseReview.running ? '' : 'disabled'}>${japaneseReview.paused ? '續播' : '暫停'}</button>
          <button id="jaPrevBtn" class="secondary" ${japaneseReview.running ? '' : 'disabled'}>上一句</button>
          <button id="jaNextBtn" class="secondary" ${japaneseReview.running ? '' : 'disabled'}>下一句</button>
          <button id="jaStopBtn" class="danger" ${japaneseReview.running ? '' : 'disabled'}>停止</button>
        </div>
      </article>
    </div>

    <div class="list-wrap">
      ${filteredSentences.length > 0 ? filteredSentences.map((item) => renderJapaneseRow(item)).join('') : '<article class="card"><p class="muted">目前沒有符合條件的日文句子。</p></article>'}
    </div>
  `

  byId<HTMLFormElement>('japaneseAddForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void addJapaneseSentence()
  })

  byId<HTMLSelectElement>('japaneseGroupSelect').addEventListener('change', (event) => {
    japaneseGroup = (event.currentTarget as HTMLSelectElement).value
    render()
  })

  byId<HTMLInputElement>('japaneseSearchInput').addEventListener('input', (event) => {
    japaneseSearch = (event.currentTarget as HTMLInputElement).value
    render()
  })

  byId<HTMLButtonElement>('jaStartBtn').addEventListener('click', () => {
    void startJapaneseReview()
  })
  byId<HTMLButtonElement>('jaPauseBtn').addEventListener('click', () => {
    toggleJapanesePause()
  })
  byId<HTMLButtonElement>('jaPrevBtn').addEventListener('click', () => {
    void shiftJapaneseReview(-1)
  })
  byId<HTMLButtonElement>('jaNextBtn').addEventListener('click', () => {
    void shiftJapaneseReview(1)
  })
  byId<HTMLButtonElement>('jaStopBtn').addEventListener('click', () => {
    stopJapaneseReview(true)
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-ja-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.jaAction
      const id = button.dataset.id
      if (!id) return

      if (action === 'play') {
        const item = japaneseSentences.find((sentence) => sentence.id === id)
        if (item) void playSingleJapanese(item)
      }

      if (action === 'reviewed') {
        markJapaneseReviewed(id)
        render()
      }

      if (action === 'edit-tags') {
        const target = japaneseSentences.find((sentence) => sentence.id === id)
        if (!target) return
        const next = window.prompt('請輸入標籤（逗號分隔）', target.tags.join(', '))
        if (next === null) return
        japaneseSentences = japaneseSentences.map((sentence) => (sentence.id === id ? { ...sentence, tags: parseTags(next) } : sentence))
        schedulePersist()
        render()
      }

      if (action === 'delete') {
        japaneseSentences = japaneseSentences.filter((sentence) => sentence.id !== id)
        schedulePersist()
        render()
      }
    })
  })
}

function renderJapaneseGroupOptions(): string {
  const tags = Array.from(new Set(japaneseSentences.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b))
  const options = [
    { value: 'due', label: '今日待複習' },
    { value: 'all', label: '全部' },
    ...tags.map((tag) => ({ value: `tag:${tag}`, label: `標籤：${tag}` }))
  ]

  return options
    .map((option) => `<option value="${escapeHtmlAttr(option.value)}" ${japaneseGroup === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('')
}

function renderJapaneseRow(item: JapaneseSentence): string {
  const tags = item.tags.length > 0 ? item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('') : '<span class="muted">無標籤</span>'
  const vocab = item.vocabulary.length > 0
    ? item.vocabulary.map((v) => `${escapeHtml(v.word)}=${escapeHtml(v.meaningZh)}`).join('、')
    : '無'
  const reviewedAt = item.lastReviewedAt ? formatTime(item.lastReviewedAt) : '尚未複習'

  return `
    <article class="list-card">
      <div class="list-main">
        <p><strong>${escapeHtml(item.sentence)}</strong></p>
        <p class="romaji">${escapeHtml(item.romaji)}</p>
        <p>${escapeHtml(item.meaningZh)}</p>
        <p class="muted">單字：${vocab}</p>
        <p class="muted">複習：${reviewedAt}</p>
        <div class="tag-wrap">${tags}</div>
      </div>
      <div class="row-actions">
        <button data-ja-action="play" data-id="${escapeHtmlAttr(item.id)}">朗讀</button>
        <button data-ja-action="edit-tags" data-id="${escapeHtmlAttr(item.id)}" class="secondary">編輯標籤</button>
        <button data-ja-action="reviewed" data-id="${escapeHtmlAttr(item.id)}" class="secondary">已複習</button>
        <button data-ja-action="delete" data-id="${escapeHtmlAttr(item.id)}" class="danger">刪除</button>
      </div>
    </article>
  `
}
function renderContentTab(): void {
  const panel = byId<HTMLDivElement>('tab-content')
  const shownEnCandidates = enCandidates.slice(0, enCandidateLimit)
  const shownJaCandidates = jaCandidates.slice(0, jaCandidateLimit)

  panel.innerHTML = `
    <div class="panel-head">
      <h2>內容工坊</h2>
      <p>支援貼文抽取與一鍵匯入新聞，快速補充學習內容。</p>
    </div>

    <div class="card-grid">
      <article class="card">
        <h3>英文內容</h3>
        <form id="enExtractForm" class="stack-form">
          <label>英文文章
            <textarea id="enTextInput" placeholder="貼上英文新聞內容"></textarea>
          </label>
          <button type="submit">抽取關鍵字</button>
        </form>
        <div class="inline-fields">
          <label>新聞關鍵字（可空白）
            <input id="enNewsQueryInput" placeholder="例如: AI, climate, market" value="${escapeHtmlAttr(enNewsQuery)}" />
          </label>
          <label>新聞來源
            <select id="enNewsSourceSelect">
              <option value="rss" ${enNewsSource === 'rss' ? 'selected' : ''}>免費 RSS</option>
              <option value="newsapi" ${(providerStatus.news.newsapi && enNewsSource === 'newsapi') ? 'selected' : ''} ${providerStatus.news.newsapi ? '' : 'disabled'}>News API / GNews（金鑰）</option>
            </select>
          </label>
          <label>顯示候選數
            <input id="enCandidateLimitInput" type="number" min="10" max="200" step="10" value="${enCandidateLimit}" />
          </label>
          <label>加入時標籤（逗號分隔）
            <input id="enCandidateTagsInput" placeholder="news, topic-ai" value="${escapeHtmlAttr(enCandidateTags)}" />
          </label>
          <button id="enImportNewsBtn" class="secondary">匯入英文新聞</button>
        </div>
        <p class="muted">英文候選：顯示 ${shownEnCandidates.length} / ${enCandidates.length} 筆</p>
        <div class="chips-wrap">${shownEnCandidates.map((candidate) => `<button class="chip" data-en-candidate="${escapeHtmlAttr(candidate)}">${escapeHtml(candidate)}</button>`).join('')}</div>
        <div class="headline-list">${enHeadlines.map((item) => renderHeadline(item, 'en')).join('')}</div>
      </article>

      <article class="card">
        <h3>日文內容</h3>
        <form id="jaExtractForm" class="stack-form">
          <label>日文文章
            <textarea id="jaTextInput" placeholder="貼上日文段落"></textarea>
          </label>
          <button type="submit">切句</button>
        </form>
        <div class="inline-fields">
          <label>新聞關鍵字（可空白）
            <input id="jaNewsQueryInput" placeholder="例如: 経済, 技術, 旅行" value="${escapeHtmlAttr(jaNewsQuery)}" />
          </label>
          <label>新聞來源
            <select id="jaNewsSourceSelect">
              <option value="rss" ${jaNewsSource === 'rss' ? 'selected' : ''}>免費 RSS</option>
              <option value="newsapi" ${(providerStatus.news.newsapi && jaNewsSource === 'newsapi') ? 'selected' : ''} ${providerStatus.news.newsapi ? '' : 'disabled'}>News API / GNews（金鑰）</option>
            </select>
          </label>
          <label>顯示候選數
            <input id="jaCandidateLimitInput" type="number" min="10" max="200" step="10" value="${jaCandidateLimit}" />
          </label>
          <label>加入時標籤（逗號分隔）
            <input id="jaCandidateTagsInput" placeholder="news, topic-economy" value="${escapeHtmlAttr(jaCandidateTags)}" />
          </label>
          <button id="jaImportNewsBtn" class="secondary">匯入日文新聞</button>
        </div>
        <p class="muted">日文候選：顯示 ${shownJaCandidates.length} / ${jaCandidates.length} 筆</p>
        <div class="chips-wrap">${shownJaCandidates.map((candidate) => `<button class="chip chip-full" data-ja-candidate="${escapeHtmlAttr(candidate)}">${escapeHtml(candidate)}</button>`).join('')}</div>
        <div class="headline-list">${jaHeadlines.map((item) => renderHeadline(item, 'ja')).join('')}</div>
      </article>

      <article class="card">
        <h3>個人資料備份</h3>
        <p class="muted">可匯出/匯入自己的學習資料（英文、日文、聲音設定、主題）。</p>
        <div class="stack-form">
          <button id="exportUserDataBtn" class="secondary">匯出我的學習資料</button>
          <label>匯入檔案（JSON）
            <input id="importUserDataFile" type="file" accept="application/json,.json" />
          </label>
          <button id="importUserDataBtn">匯入並覆蓋目前資料</button>
        </div>
      </article>
    </div>
  `

  byId<HTMLFormElement>('enExtractForm').addEventListener('submit', (event) => {
    event.preventDefault()
    const text = byId<HTMLTextAreaElement>('enTextInput').value
    enCandidates = extractEnglishKeywords(text)
    render()
  })

  byId<HTMLFormElement>('jaExtractForm').addEventListener('submit', (event) => {
    event.preventDefault()
    const text = byId<HTMLTextAreaElement>('jaTextInput').value
    jaCandidates = extractJapaneseSentences(text)
    render()
  })

  byId<HTMLSelectElement>('enNewsSourceSelect').addEventListener('change', (event) => {
    enNewsSource = (event.currentTarget as HTMLSelectElement).value as NewsSource
  })
  byId<HTMLInputElement>('enNewsQueryInput').addEventListener('input', (event) => {
    enNewsQuery = (event.currentTarget as HTMLInputElement).value
  })
  byId<HTMLInputElement>('enCandidateLimitInput').addEventListener('change', (event) => {
    enCandidateLimit = clampNumber(Number((event.currentTarget as HTMLInputElement).value), 10, 200)
    render()
  })
  byId<HTMLInputElement>('enCandidateTagsInput').addEventListener('input', (event) => {
    enCandidateTags = (event.currentTarget as HTMLInputElement).value
  })

  byId<HTMLSelectElement>('jaNewsSourceSelect').addEventListener('change', (event) => {
    jaNewsSource = (event.currentTarget as HTMLSelectElement).value as NewsSource
  })
  byId<HTMLInputElement>('jaNewsQueryInput').addEventListener('input', (event) => {
    jaNewsQuery = (event.currentTarget as HTMLInputElement).value
  })
  byId<HTMLInputElement>('jaCandidateLimitInput').addEventListener('change', (event) => {
    jaCandidateLimit = clampNumber(Number((event.currentTarget as HTMLInputElement).value), 10, 200)
    render()
  })
  byId<HTMLInputElement>('jaCandidateTagsInput').addEventListener('input', (event) => {
    jaCandidateTags = (event.currentTarget as HTMLInputElement).value
  })

  byId<HTMLButtonElement>('enImportNewsBtn').addEventListener('click', () => {
    void importNews('en', enNewsSource, enNewsQuery)
  })

  byId<HTMLButtonElement>('jaImportNewsBtn').addEventListener('click', () => {
    void importNews('ja', jaNewsSource, jaNewsQuery)
  })
  byId<HTMLButtonElement>('exportUserDataBtn').addEventListener('click', () => {
    void exportUserData()
  })
  byId<HTMLButtonElement>('importUserDataBtn').addEventListener('click', () => {
    void importUserData()
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-en-candidate]').forEach((button) => {
    button.addEventListener('click', () => {
      const keyword = button.dataset.enCandidate
      if (!keyword) return
      const tags = parseTags(enCandidateTags)
      void addEnglishCandidate(keyword, tags)
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-ja-candidate]').forEach((button) => {
    button.addEventListener('click', () => {
      const sentence = button.dataset.jaCandidate
      if (!sentence) return
      const tags = parseTags(jaCandidateTags)
      void addJapaneseCandidate(sentence, tags)
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-headline-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang
      const payload = button.dataset.headlineAdd
      if (!payload) return
      const text = decodeFromAttr(payload)

      if (lang === 'en') {
        const keywords = extractEnglishKeywords(text)
        enCandidates = mergeUniqueStrings(enCandidates, keywords)
        render()
      }

      if (lang === 'ja') {
        const sentences = extractJapaneseSentences(text)
        jaCandidates = mergeUniqueStrings(jaCandidates, sentences)
        render()
      }
    })
  })
}

function renderHeadline(item: NewsHeadline, lang: 'en' | 'ja'): string {
  return `
    <article class="headline-item">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.summary || '（無摘要）')}</p>
      <p class="muted">${escapeHtml(item.source)}${item.publishedAt ? ` ・ ${escapeHtml(formatTime(item.publishedAt))}` : ''}</p>
      <div class="row-actions">
        ${item.link ? `<a href="${escapeHtmlAttr(item.link)}" target="_blank" rel="noreferrer" class="link-btn">原文</a>` : ''}
        <button data-lang="${lang}" data-headline-add="${encodeForAttr(`${item.title} ${item.summary}`)}" data-headline-add-role="1">提取候選</button>
      </div>
    </article>
  `
}

function renderSpeechTab(): void {
  const panel = byId<HTMLDivElement>('tab-speech')

  panel.innerHTML = `
    <div class="panel-head">
      <h2>聲音設定</h2>
      <p>英文、中文、日文可分開設定語速、聲調與音量。</p>
      <p class="muted">OpenAI TTS：${providerStatus.tts.openai ? '可用' : '未設定'}</p>
      <p class="muted">聲調（pitch）就是音高，高一點聲音較尖，低一點較沉。</p>
    </div>

    <div class="card-grid">
      <article class="card">
        <h3>引擎</h3>
        <form id="speechEngineForm" class="stack-form">
          <label>朗讀引擎
            <select id="speechEngineSelect">
              <option value="browser" ${speechSettings.engine === 'browser' ? 'selected' : ''}>瀏覽器內建（免費）</option>
              <option value="openai" ${speechSettings.engine === 'openai' ? 'selected' : ''} ${providerStatus.tts.openai ? '' : 'disabled'}>OpenAI TTS</option>
            </select>
          </label>
          <label>OpenAI 聲音
            <select id="openAiVoiceSelect" ${speechSettings.engine === 'openai' ? '' : 'disabled'}>
              ${['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'].map((voice) => `<option value="${voice}" ${speechSettings.openAiVoice === voice ? 'selected' : ''}>${voice}</option>`).join('')}
            </select>
          </label>
          <button type="button" id="refreshTtsStatusBtn" class="secondary">重新檢查 TTS 狀態</button>
          <button type="button" id="testSpeechBtn" class="secondary">測試目前聲音</button>
          <button type="submit">儲存引擎設定</button>
        </form>
      </article>

      <article class="card">
        <h3>瀏覽器聲音</h3>
        <form id="browserVoiceForm" class="stack-form">
          <label>英文<select id="voice-en">${renderVoiceOptions('en')}</select></label>
          <label>中文<select id="voice-zh">${renderVoiceOptions('zh')}</select></label>
          <label>日文<select id="voice-ja">${renderVoiceOptions('ja')}</select></label>
          <div class="inline-fields">
            <button type="button" id="previewVoiceEnBtn" class="secondary">試聽英文聲音</button>
            <button type="button" id="previewVoiceZhBtn" class="secondary">試聽中文聲音</button>
            <button type="button" id="previewVoiceJaBtn" class="secondary">試聽日文聲音</button>
          </div>
          <button type="submit">儲存聲音選擇</button>
        </form>
      </article>

      <article class="card">
        <h3>語速 / 聲調 / 音量</h3>
        <form id="speechRateForm" class="stack-form">
          <label>英文語速 <input id="rate-en" type="number" min="0.6" max="1.3" step="0.05" value="${speechSettings.rates.en}" /></label>
          <label>中文語速 <input id="rate-zh" type="number" min="0.6" max="1.3" step="0.05" value="${speechSettings.rates.zh}" /></label>
          <label>日文語速 <input id="rate-ja" type="number" min="0.6" max="1.3" step="0.05" value="${speechSettings.rates.ja}" /></label>
          <label>英文聲調 <input id="pitch-en" type="number" min="0.7" max="1.4" step="0.05" value="${speechSettings.pitches.en}" /></label>
          <label>中文聲調 <input id="pitch-zh" type="number" min="0.7" max="1.4" step="0.05" value="${speechSettings.pitches.zh}" /></label>
          <label>日文聲調 <input id="pitch-ja" type="number" min="0.7" max="1.4" step="0.05" value="${speechSettings.pitches.ja}" /></label>
          <p class="muted">瀏覽器聲音音量（免費）</p>
          <label>英文音量（Browser）<input id="browser-volume-en" type="number" min="0" max="1" step="0.05" value="${speechSettings.browserVolumes.en}" /></label>
          <label>中文音量（Browser）<input id="browser-volume-zh" type="number" min="0" max="1" step="0.05" value="${speechSettings.browserVolumes.zh}" /></label>
          <label>日文音量（Browser）<input id="browser-volume-ja" type="number" min="0" max="1" step="0.05" value="${speechSettings.browserVolumes.ja}" /></label>
          <p class="muted">OpenAI 聲音音量（API）</p>
          <label>英文音量（OpenAI）<input id="openai-volume-en" type="number" min="0" max="1" step="0.05" value="${speechSettings.openAiVolumes.en}" /></label>
          <label>中文音量（OpenAI）<input id="openai-volume-zh" type="number" min="0" max="1" step="0.05" value="${speechSettings.openAiVolumes.zh}" /></label>
          <label>日文音量（OpenAI）<input id="openai-volume-ja" type="number" min="0" max="1" step="0.05" value="${speechSettings.openAiVolumes.ja}" /></label>
          <button type="submit">儲存語速、聲調與音量</button>
        </form>
      </article>
    </div>
  `

  byId<HTMLFormElement>('speechEngineForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void saveSpeechEngine()
  })

  byId<HTMLButtonElement>('refreshTtsStatusBtn').addEventListener('click', () => {
    void loadProviderStatus().then(() => {
      render()
      toast('已更新聲音服務狀態')
    })
  })

  byId<HTMLButtonElement>('testSpeechBtn').addEventListener('click', () => {
    void testSpeech()
  })

  byId<HTMLButtonElement>('previewVoiceEnBtn').addEventListener('click', () => {
    void previewBrowserVoice('en')
  })
  byId<HTMLButtonElement>('previewVoiceZhBtn').addEventListener('click', () => {
    void previewBrowserVoice('zh')
  })
  byId<HTMLButtonElement>('previewVoiceJaBtn').addEventListener('click', () => {
    void previewBrowserVoice('ja')
  })

  byId<HTMLFormElement>('browserVoiceForm').addEventListener('submit', (event) => {
    event.preventDefault()

    speechSettings = {
      ...speechSettings,
      browserVoices: {
        en: byId<HTMLSelectElement>('voice-en').value,
        zh: byId<HTMLSelectElement>('voice-zh').value,
        ja: byId<HTMLSelectElement>('voice-ja').value
      }
    }

    schedulePersist()
    toast('已儲存瀏覽器聲音')
  })

  byId<HTMLFormElement>('speechRateForm').addEventListener('submit', (event) => {
    event.preventDefault()

    speechSettings = {
      ...speechSettings,
      rates: {
        en: clampNumber(Number(byId<HTMLInputElement>('rate-en').value), 0.6, 1.3),
        zh: clampNumber(Number(byId<HTMLInputElement>('rate-zh').value), 0.6, 1.3),
        ja: clampNumber(Number(byId<HTMLInputElement>('rate-ja').value), 0.6, 1.3)
      },
      pitches: {
        en: clampNumber(Number(byId<HTMLInputElement>('pitch-en').value), 0.7, 1.4),
        zh: clampNumber(Number(byId<HTMLInputElement>('pitch-zh').value), 0.7, 1.4),
        ja: clampNumber(Number(byId<HTMLInputElement>('pitch-ja').value), 0.7, 1.4)
      },
      browserVolumes: {
        en: clampNumber(Number(byId<HTMLInputElement>('browser-volume-en').value), 0, 1),
        zh: clampNumber(Number(byId<HTMLInputElement>('browser-volume-zh').value), 0, 1),
        ja: clampNumber(Number(byId<HTMLInputElement>('browser-volume-ja').value), 0, 1)
      },
      openAiVolumes: {
        en: clampNumber(Number(byId<HTMLInputElement>('openai-volume-en').value), 0, 1),
        zh: clampNumber(Number(byId<HTMLInputElement>('openai-volume-zh').value), 0, 1),
        ja: clampNumber(Number(byId<HTMLInputElement>('openai-volume-ja').value), 0, 1)
      }
    }

    schedulePersist()
    toast('已儲存語速、聲調與音量')
  })
}

async function saveSpeechEngine(): Promise<void> {
  const engine = byId<HTMLSelectElement>('speechEngineSelect').value
  const openAiVoice = byId<HTMLSelectElement>('openAiVoiceSelect').value

  if (engine === 'openai' && !providerStatus.tts.openai) {
    toast('OpenAI TTS 尚未啟用')
    return
  }

  if (engine === 'openai') {
    const verify = await verifyOpenAiVoice(openAiVoice)
    if (!verify.ok) {
      toast(`OpenAI 聲音驗證失敗：${verify.message}`)
      return
    }
  }

  speechSettings = {
    ...speechSettings,
    engine: engine === 'openai' ? 'openai' : 'browser',
    openAiVoice
  }

  schedulePersist()
  render()
  toast(`已套用朗讀引擎：${speechSettings.engine === 'openai' ? 'OpenAI TTS' : '瀏覽器內建'}`)
}

async function verifyOpenAiVoice(voice: string): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Voice test', lang: 'en-US', voice, speed: 1 })
    })
    if (!response.ok) {
      const detail = await safeReadText(response)
      return { ok: false, message: detail }
    }
    return { ok: true, message: '' }
  } catch {
    return { ok: false, message: '無法連線到 TTS 服務' }
  }
}

async function previewBrowserVoice(bucket: LangBucket): Promise<void> {
  const selectId = bucket === 'en' ? 'voice-en' : bucket === 'zh' ? 'voice-zh' : 'voice-ja'
  const sampleText = bucket === 'en'
    ? 'This is an English browser voice preview.'
    : bucket === 'zh'
      ? '這是中文瀏覽器聲音試聽。'
      : 'これは日本語ブラウザ音声の試聴です。'
  const lang = bucket === 'en' ? 'en-US' : bucket === 'zh' ? 'zh-TW' : 'ja-JP'
  const voiceUri = byId<HTMLSelectElement>(selectId).value

  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  tempPlaybackAbort = controller

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
  tempPlaybackAbort = null
}

function renderVoiceOptions(bucket: LangBucket): string {
  const auto = '<option value="">自動選擇</option>'
  const target = voices.filter((voice) => voice.lang.toLowerCase().startsWith(bucket))

  if (target.length === 0) {
    return `${auto}<option value="" disabled>找不到此語言聲音</option>`
  }

  const selected = speechSettings.browserVoices[bucket]
  return auto + target
    .map((voice) => `<option value="${escapeHtmlAttr(voice.voiceURI)}" ${selected === voice.voiceURI ? 'selected' : ''}>${escapeHtml(`${voice.name} (${voice.lang})`)}</option>`)
    .join('')
}

function renderAdminTab(): void {
  const panel = byId<HTMLDivElement>('tab-admin')

  if (!authUser || authUser.role !== 'admin') {
    panel.innerHTML = '<article class="card"><p>需要管理員權限。</p></article>'
    return
  }
  const currentAccount = authUser.account

  panel.innerHTML = `
    <div class="panel-head">
      <h2>後台管理</h2>
      <p>管理使用者、每日備份、API 狀態更新。</p>
    </div>

    <div class="card-grid">
      <article class="card">
        <h3>API 狀態</h3>
        <p>TTS：${providerStatus.tts.openai ? 'OpenAI 可用' : 'OpenAI 未設定'} / Browser ${providerStatus.tts.browser ? '可用' : '不可用'}</p>
        <p>新聞：RSS ${providerStatus.news.rss ? '可用' : '不可用'} / NewsAPI ${providerStatus.news.newsapi ? '可用' : '未設定'}</p>
        <button id="refreshProviderBtn" class="secondary">更新 API 狀態</button>
      </article>

      <article class="card">
        <h3>新增使用者</h3>
        <form id="adminAddUserForm" class="stack-form">
          <label>帳號
            <input id="adminAccountInput" required placeholder="newuser" />
          </label>
          <label>密碼
            <input id="adminPasswordInput" required placeholder="至少 4 碼" />
          </label>
          <label>名稱
            <input id="adminNameInput" placeholder="顯示名稱" />
          </label>
          <label>權限
            <select id="adminRoleInput">
              <option value="user">一般使用者</option>
              <option value="admin">管理員</option>
            </select>
          </label>
          <button type="submit">新增</button>
        </form>
      </article>

      <article class="card">
        <h3>備份管理</h3>
        <p class="muted">系統每天自動備份一次，也可手動備份。</p>
        <button id="manualBackupBtn" class="secondary">立即建立備份</button>
        <div class="headline-list">
          ${backupFiles.map((file) => `<p class="muted">${escapeHtml(file.fileName)} ・ ${Math.round(file.size / 1024)} KB ・ ${escapeHtml(formatTime(file.mtime))}</p>`).join('') || '<p class="muted">目前無備份紀錄</p>'}
        </div>
      </article>
    </div>

    <article class="card">
      <h3>使用者清單</h3>
      <div class="list-wrap">
        ${adminUsers.map((user) => `
          <article class="list-card">
            <div class="list-main">
              <p><strong>${escapeHtml(user.account)}</strong> (${user.role === 'admin' ? '管理員' : '一般使用者'}) - ${escapeHtml(user.name)}</p>
              <p class="muted">狀態：${user.active ? '啟用' : '停用'}</p>
              <p class="muted">英文 ${user.englishCount} 筆 ・ 日文 ${user.japaneseCount} 句</p>
              <p class="muted">建立 ${escapeHtml(formatTime(user.createdAt))} ・ 更新 ${escapeHtml(formatTime(user.updatedAt))}</p>
            </div>
            <div class="row-actions">
              <button data-admin-action="change-password" data-account="${escapeHtmlAttr(user.account)}" class="secondary">改密碼</button>
              <button
                data-admin-action="toggle-status"
                data-account="${escapeHtmlAttr(user.account)}"
                data-active="${user.active ? '1' : '0'}"
                class="secondary"
                ${(user.account === 'admin' || user.account === currentAccount) ? 'disabled' : ''}
              >${user.active ? '停用' : '啟用'}</button>
              <button data-admin-action="delete-user" data-account="${escapeHtmlAttr(user.account)}" class="danger" ${(user.account === 'admin' || user.account === currentAccount) ? 'disabled' : ''}>刪除</button>
            </div>
          </article>
        `).join('')}
      </div>
    </article>
  `

  byId<HTMLButtonElement>('refreshProviderBtn').addEventListener('click', () => {
    void refreshProviderByAdmin()
  })

  byId<HTMLFormElement>('adminAddUserForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void adminCreateUser()
  })

  byId<HTMLButtonElement>('manualBackupBtn').addEventListener('click', () => {
    void triggerManualBackup()
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-admin-action="delete-user"]').forEach((button) => {
    button.addEventListener('click', () => {
      const account = button.dataset.account
      if (!account) return
      void adminDeleteUser(account)
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-admin-action="change-password"]').forEach((button) => {
    button.addEventListener('click', () => {
      const account = button.dataset.account
      if (!account) return
      const password = window.prompt(`請輸入 ${account} 的新密碼（至少 4 碼）`)
      if (!password) return
      void adminChangeUserPassword(account, password.trim())
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-admin-action="toggle-status"]').forEach((button) => {
    button.addEventListener('click', () => {
      const account = button.dataset.account
      const current = button.dataset.active === '1'
      if (!account) return
      void adminSetUserStatus(account, !current)
    })
  })
}

function bindGlobalActions(): void {
  byId<HTMLButtonElement>('themeToggleBtn').addEventListener('click', () => {
    themeMode = themeMode === 'light' ? 'dark' : 'light'
    applyTheme()
    schedulePersist()
    render()
  })

  byId<HTMLButtonElement>('stopSpeechBtn').addEventListener('click', () => {
    stopAllPlayback(true)
    toast('已停止朗讀')
  })

  byId<HTMLButtonElement>('logoutBtn').addEventListener('click', () => {
    void logout()
  })
}

async function login(): Promise<void> {
  const account = byId<HTMLInputElement>('loginAccount').value.trim()
  const password = byId<HTMLInputElement>('loginPassword').value.trim()

  if (!account || !password) {
    toast('請輸入帳號密碼')
    return
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password })
    })

    if (!response.ok) {
      const errorText = await safeReadText(response)
      if (response.status === 401 || response.status === 403) {
        toast(errorText || '帳號或密碼錯誤')
      } else {
        toast(`登入失敗：${errorText}`)
      }
      return
    }

    const payload = (await response.json()) as { token: string; user: AuthUser }
    token = payload.token
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    authUser = payload.user

    await Promise.all([loadProviderStatus(), loadUserData()])

    if (authUser.role === 'admin') {
      await Promise.all([loadAdminUsers(), loadBackups()])
    }

    render()
  } catch {
    toast('登入失敗，請確認後端已啟動')
  }
}

async function logout(): Promise<void> {
  await persistUserData(true)
  stopAllPlayback(true)

  if (token) {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
  }

  clearAuth()
  setLocalSeedFallback()
  render()
}

function clearAuth(): void {
  token = ''
  authUser = null
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

async function fetchMe(): Promise<AuthUser | null> {
  try {
    const response = await apiFetch('/api/auth/me')
    if (!response.ok) return null
    return (await response.json()) as AuthUser
  } catch {
    return null
  }
}

async function loadProviderStatus(): Promise<void> {
  try {
    const response = await apiFetch('/api/providers')
    if (!response.ok) return
    providerStatus = (await response.json()) as ProviderStatus
  } catch {
    providerStatus = { tts: { browser: true, openai: false }, news: { rss: true, newsapi: false } }
  }
}

async function refreshProviderByAdmin(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/providers/refresh', { method: 'POST' })
  if (!response.ok) {
    toast('更新 API 狀態失敗')
    return
  }

  providerStatus = (await response.json()) as ProviderStatus
  render()
  toast('已更新 API 狀態')
}

async function loadUserData(): Promise<void> {
  try {
    const response = await apiFetch('/api/user/data')
    if (!response.ok) throw new Error('load user data failed')

    const payload = (await response.json()) as { data: UserDataPayload }
    englishWords = normalizeEnglishWords(payload.data.englishWords)
    japaneseSentences = normalizeJapaneseSentences(payload.data.japaneseSentences)
    speechSettings = sanitizeSpeechSettings(payload.data.speechSettings)
    themeMode = payload.data.theme === 'dark' ? 'dark' : 'light'

    applyTheme()
  } catch {
    setLocalSeedFallback()
  }
}

async function loadAdminUsers(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/users')
  if (!response.ok) return

  const payload = (await response.json()) as { users: AdminUserSummary[] }
  adminUsers = payload.users
}

async function loadBackups(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/backups')
  if (!response.ok) return

  const payload = (await response.json()) as { files: BackupFile[] }
  backupFiles = payload.files
}

async function adminCreateUser(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const account = byId<HTMLInputElement>('adminAccountInput').value.trim()
  const password = byId<HTMLInputElement>('adminPasswordInput').value.trim()
  const name = byId<HTMLInputElement>('adminNameInput').value.trim()
  const role = byId<HTMLSelectElement>('adminRoleInput').value as UserRole

  const response = await apiFetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, name, role })
  })

  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`新增失敗：${errorText}`)
    return
  }

  await loadAdminUsers()
  render()
  toast('已新增使用者')
}

async function adminDeleteUser(account: string): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(account)}`, { method: 'DELETE' })
  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`刪除失敗：${errorText}`)
    return
  }

  await loadAdminUsers()
  render()
  toast('已刪除使用者')
}

async function adminChangeUserPassword(account: string, password: string): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return
  if (password.length < 4) {
    toast('密碼至少 4 碼')
    return
  }

  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(account)}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })

  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`改密碼失敗：${errorText}`)
    return
  }

  await loadAdminUsers()
  render()
  toast(`已更新 ${account} 密碼`)
}

async function adminSetUserStatus(account: string, active: boolean): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(account)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active })
  })

  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`更新狀態失敗：${errorText}`)
    return
  }

  await loadAdminUsers()
  render()
  toast(`${account} 已${active ? '啟用' : '停用'}`)
}

async function triggerManualBackup(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/backup', { method: 'POST' })
  if (!response.ok) {
    toast('建立備份失敗')
    return
  }

  await loadBackups()
  render()
  toast('已建立備份')
}

async function exportUserData(): Promise<void> {
  const response = await apiFetch('/api/user/export')
  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`匯出失敗：${errorText}`)
    return
  }

  const blob = await response.blob()
  const contentDisposition = response.headers.get('content-disposition') ?? ''
  const fileName = extractFileName(contentDisposition) || `lingua-user-export-${new Date().toISOString().slice(0, 10)}.json`
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  toast('已匯出個人學習資料')
}

async function importUserData(): Promise<void> {
  const fileInput = byId<HTMLInputElement>('importUserDataFile')
  const file = fileInput.files?.[0]
  if (!file) {
    toast('請先選擇 JSON 檔案')
    return
  }

  try {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') {
      toast('檔案格式錯誤')
      return
    }

    const response = await apiFetch('/api/user/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    })

    if (!response.ok) {
      const errorText = await safeReadText(response)
      toast(`匯入失敗：${errorText}`)
      return
    }

    fileInput.value = ''
    await loadUserData()
    render()
    toast('已匯入個人學習資料')
  } catch {
    toast('匯入失敗，請確認是有效 JSON')
  }
}
async function addEnglishWord(): Promise<void> {
  const wordInput = byId<HTMLInputElement>('englishWordInput')
  const meaningInput = byId<HTMLInputElement>('englishMeaningInput')
  const tagsInput = byId<HTMLInputElement>('englishTagsInput')

  const word = wordInput.value.trim()
  if (!word) {
    toast('請輸入英文單字')
    return
  }

  let meaningZh = meaningInput.value.trim()
  if (!meaningZh) {
    meaningZh = await autoTranslate(word, 'en', 'zh-TW')
  }

  englishWords = [
    {
      id: `en-${uid()}`,
      word,
      meaningZh: meaningZh || '（請手動補中文）',
      tags: parseTags(tagsInput.value),
      needsWork: false,
      level: 0,
      lastReviewedAt: null
    },
    ...englishWords
  ]

  wordInput.value = ''
  meaningInput.value = ''
  tagsInput.value = ''

  schedulePersist()
  render()
}

async function addJapaneseSentence(): Promise<void> {
  const sentenceInput = byId<HTMLTextAreaElement>('jaSentenceInput')
  const romajiInput = byId<HTMLInputElement>('jaRomajiInput')
  const meaningInput = byId<HTMLTextAreaElement>('jaMeaningInput')
  const vocabInput = byId<HTMLInputElement>('jaVocabInput')
  const tagsInput = byId<HTMLInputElement>('jaTagsInput')

  const sentence = sentenceInput.value.trim()
  if (!sentence) {
    toast('請輸入日文句子')
    return
  }

  const romaji = romajiInput.value.trim() || toRomaji(sentence)
  let meaningZh = meaningInput.value.trim()
  const inputTags = parseTags(tagsInput.value)

  if (!meaningZh) {
    meaningZh = await autoTranslate(sentence, 'ja', 'zh-TW')
  }

  japaneseSentences = [
    {
      id: `ja-${uid()}`,
      sentence,
      romaji,
      meaningZh: meaningZh || '（請手動補中文）',
      tags: inputTags.length > 0 ? inputTags : inferJapaneseTags(sentence),
      vocabulary: parseVocabPairs(vocabInput.value),
      level: 0,
      lastReviewedAt: null
    },
    ...japaneseSentences
  ]

  sentenceInput.value = ''
  romajiInput.value = ''
  meaningInput.value = ''
  vocabInput.value = ''
  tagsInput.value = ''

  schedulePersist()
  render()
}

async function addEnglishCandidate(candidate: string, tagsInput: string[] = ['news']): Promise<void> {
  const existed = englishWords.some((item) => item.word.toLowerCase() === candidate.toLowerCase())
  if (existed) {
    toast('此單字已存在')
    return
  }

  const meaning = await autoTranslate(candidate, 'en', 'zh-TW')

  englishWords = [
    {
      id: `en-${uid()}`,
      word: candidate,
      meaningZh: meaning || '（請手動補中文）',
      tags: tagsInput.length > 0 ? tagsInput : ['news'],
      needsWork: false,
      level: 0,
      lastReviewedAt: null
    },
    ...englishWords
  ]

  schedulePersist()
  toast(`已加入英文單字：${candidate}`)
  render()
}

async function addJapaneseCandidate(candidate: string, tagsInput: string[] = ['news']): Promise<void> {
  const existed = japaneseSentences.some((item) => item.sentence === candidate)
  if (existed) {
    toast('此句子已存在')
    return
  }

  const meaning = await autoTranslate(candidate, 'ja', 'zh-TW')

  japaneseSentences = [
    {
      id: `ja-${uid()}`,
      sentence: candidate,
      romaji: toRomaji(candidate),
      meaningZh: meaning || '（請手動補中文）',
      tags: tagsInput.length > 0 ? tagsInput : inferJapaneseTags(candidate),
      vocabulary: [],
      level: 0,
      lastReviewedAt: null
    },
    ...japaneseSentences
  ]

  schedulePersist()
  toast('已加入日文句子')
  render()
}

async function importNews(lang: 'en' | 'ja', source: NewsSource, query = '', fallbackTried = false): Promise<void> {
  const response = await apiFetch(`/api/news/headlines?lang=${lang}&source=${source}&limit=30&q=${encodeURIComponent(query)}`)
  if (!response.ok) {
    const detail = await safeReadText(response)
    if (source === 'newsapi' && !fallbackTried) {
      toast(`NewsAPI 失敗，已改用 RSS：${detail}`)
      await importNews(lang, 'rss', query, true)
      return
    }
    toast(`匯入新聞失敗：${detail}`)
    return
  }

  const payload = (await response.json()) as {
    items: NewsHeadline[]
    count: number
  }

  if (lang === 'en') {
    enHeadlines = payload.items
    enCandidates = extractEnglishKeywords(payload.items.map((item) => `${item.title} ${item.summary}`).join(' '))
  } else {
    jaHeadlines = payload.items
    jaCandidates = extractJapaneseSentences(payload.items.map((item) => `${item.title}${item.summary}`).join('。'))
  }

  if ((payload.count ?? payload.items.length) === 0) {
    toast(`找不到「${query || '目前條件'}」的新聞，請換關鍵字或改來源`)
  }

  render()
}

function startEnglishReview(): Promise<void> {
  englishReview.queue = getEnglishQueueByGroup(englishGroup)

  if (englishReview.queue.length === 0) {
    toast('此群組目前沒有可播放內容')
    return Promise.resolve()
  }

  stopJapaneseReview(false)
  englishReview.running = true
  englishReview.paused = false
  englishReview.index = 0
  englishReview.runId += 1
  render()

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
    englishAbort = controller

    await speakEnglishWord(current, controller.signal)

    if (!englishReview.running || englishReview.runId !== runId) return

    markEnglishReviewed(current.id)
    englishReview.index += 1
    render()
  }

  stopEnglishReview(false)
}

function toggleEnglishPause(): void {
  if (!englishReview.running) return

  englishReview.paused = !englishReview.paused
  if (englishReview.paused) pauseActivePlayback()
  else resumeActivePlayback()

  render()
}

function stopEnglishReview(stopPlayback: boolean): void {
  englishReview.running = false
  englishReview.paused = false
  englishReview.queue = []
  englishReview.index = 0
  englishReview.runId += 1

  if (englishAbort) {
    englishAbort.abort()
    englishAbort = null
  }

  if (stopPlayback) stopActivePlayback()
  render()
}

function shiftEnglishReview(step: number): Promise<void> {
  if (!englishReview.running || englishReview.queue.length === 0) return Promise.resolve()

  const nextIndex = clampNumber(englishReview.index + step, 0, englishReview.queue.length - 1)
  englishReview.index = nextIndex
  englishReview.paused = false
  englishReview.runId += 1

  if (englishAbort) englishAbort.abort()

  render()
  return runEnglishReview(englishReview.runId)
}

function startJapaneseReview(): Promise<void> {
  japaneseReview.queue = getJapaneseQueueByGroup(japaneseGroup)

  if (japaneseReview.queue.length === 0) {
    toast('此群組目前沒有可播放內容')
    return Promise.resolve()
  }

  stopEnglishReview(false)
  japaneseReview.running = true
  japaneseReview.paused = false
  japaneseReview.index = 0
  japaneseReview.runId += 1
  render()

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
    japaneseAbort = controller

    await speakJapaneseSentence(current, controller.signal)

    if (!japaneseReview.running || japaneseReview.runId !== runId) return

    markJapaneseReviewed(current.id)
    japaneseReview.index += 1
    render()
  }

  stopJapaneseReview(false)
}

function toggleJapanesePause(): void {
  if (!japaneseReview.running) return

  japaneseReview.paused = !japaneseReview.paused
  if (japaneseReview.paused) pauseActivePlayback()
  else resumeActivePlayback()

  render()
}

function stopJapaneseReview(stopPlayback: boolean): void {
  japaneseReview.running = false
  japaneseReview.paused = false
  japaneseReview.queue = []
  japaneseReview.index = 0
  japaneseReview.runId += 1

  if (japaneseAbort) {
    japaneseAbort.abort()
    japaneseAbort = null
  }

  if (stopPlayback) stopActivePlayback()
  render()
}

function shiftJapaneseReview(step: number): Promise<void> {
  if (!japaneseReview.running || japaneseReview.queue.length === 0) return Promise.resolve()

  const nextIndex = clampNumber(japaneseReview.index + step, 0, japaneseReview.queue.length - 1)
  japaneseReview.index = nextIndex
  japaneseReview.paused = false
  japaneseReview.runId += 1

  if (japaneseAbort) japaneseAbort.abort()

  render()
  return runJapaneseReview(japaneseReview.runId)
}

function stopAllPlayback(stopPlayback: boolean): void {
  stopEnglishReview(false)
  stopJapaneseReview(false)

  if (tempPlaybackAbort) {
    tempPlaybackAbort.abort()
    tempPlaybackAbort = null
  }

  if (stopPlayback) stopActivePlayback()
}

async function testSpeech(): Promise<void> {
  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  tempPlaybackAbort = controller

  await speakByParts([
    { text: `This is an English voice test using ${speechSettings.engine}.`, lang: 'en-US', rate: speechSettings.rates.en, pitch: speechSettings.pitches.en },
    { text: '這是中文語音測試。', lang: 'zh-TW', rate: speechSettings.rates.zh, pitch: speechSettings.pitches.zh },
    { text: 'これは日本語の音声テストです。', lang: 'ja-JP', rate: speechSettings.rates.ja, pitch: speechSettings.pitches.ja }
  ], controller.signal)

  tempPlaybackAbort = null
}

async function playSingleEnglish(item: EnglishWord): Promise<void> {
  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  tempPlaybackAbort = controller
  await speakEnglishWord(item, controller.signal)
  tempPlaybackAbort = null
}

async function playSingleJapanese(item: JapaneseSentence): Promise<void> {
  if (tempPlaybackAbort) tempPlaybackAbort.abort()
  const controller = new AbortController()
  tempPlaybackAbort = controller
  await speakJapaneseSentence(item, controller.signal)
  tempPlaybackAbort = null
}

function speakEnglishWord(item: EnglishWord, signal: AbortSignal): Promise<void> {
  const letters = extractSpelling(item.word).join(' ')

  return speakByParts([
    { text: item.word, lang: 'en-US', rate: speechSettings.rates.en, pitch: speechSettings.pitches.en },
    { text: letters, lang: 'en-US', rate: speechSettings.rates.en, pitch: speechSettings.pitches.en },
    { text: item.meaningZh, lang: 'zh-TW', rate: speechSettings.rates.zh, pitch: speechSettings.pitches.zh }
  ], signal)
}

function speakJapaneseSentence(item: JapaneseSentence, signal: AbortSignal): Promise<void> {
  return speakByParts([
    { text: item.sentence, lang: 'ja-JP', rate: speechSettings.rates.ja, pitch: speechSettings.pitches.ja },
    { text: item.meaningZh, lang: 'zh-TW', rate: speechSettings.rates.zh, pitch: speechSettings.pitches.zh }
  ], signal)
}

function resolvePartVolume(part: SpeakPart, engine: 'browser' | 'openai'): number {
  if (typeof part.volume === 'number') return clampNumber(part.volume, 0, 1)
  const bucket = bucketFromSpeechLang(part.lang)
  return engine === 'openai'
    ? clampNumber(speechSettings.openAiVolumes[bucket], 0, 1)
    : clampNumber(speechSettings.browserVolumes[bucket], 0, 1)
}

function bucketFromSpeechLang(lang: SpeakPart['lang']): LangBucket {
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('zh')) return 'zh'
  return 'en'
}

async function speakByParts(parts: SpeakPart[], signal: AbortSignal): Promise<void> {
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

async function speakPartWithOpenAi(part: SpeakPart, signal: AbortSignal, volume: number): Promise<boolean> {
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
    await playAudioUrl(objectUrl, signal, volume)
    URL.revokeObjectURL(objectUrl)
    return true
  } catch {
    maybeNotifyOpenAiFallback('OpenAI TTS 連線失敗，已改用瀏覽器聲音')
    return false
  }
}

function speakPartWithBrowser(part: SpeakPart, signal: AbortSignal, volume: number): Promise<void> {
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

function playAudioUrl(url: string, signal: AbortSignal, volume: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const audio = new Audio(url)
    audio.volume = clampNumber(volume, 0, 1)
    activeAudio = audio

    const finish = (): void => {
      signal.removeEventListener('abort', onAbort)
      audio.onended = null
      audio.onerror = null
      if (activeAudio === audio) activeAudio = null
      resolve()
    }

    const onAbort = (): void => {
      audio.pause()
      audio.currentTime = 0
      finish()
    }

    audio.onended = finish
    audio.onerror = finish
    signal.addEventListener('abort', onAbort, { once: true })

    void audio.play().catch(() => finish())
  })
}

function pauseActivePlayback(): void {
  if (activeAudio) {
    activeAudio.pause()
    return
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.pause()
  }
}

function resumeActivePlayback(): void {
  if (activeAudio) {
    void activeAudio.play().catch(() => undefined)
    return
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.resume()
  }
}

function stopActivePlayback(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }

  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeAudio.src = ''
    activeAudio = null
  }
}

function chooseVoice(lang: SpeakPart['lang'], overrideVoiceUri?: string): SpeechSynthesisVoice | null {
  const bucket = toLangBucket(lang)
  const selectedUri = overrideVoiceUri || speechSettings.browserVoices[bucket]

  if (selectedUri) {
    const selected = voices.find((voice) => voice.voiceURI === selectedUri)
    if (selected) return selected
  }

  return voices.find((voice) => voice.lang.toLowerCase().startsWith(bucket)) ?? null
}

function maybeNotifyOpenAiFallback(detail: string): void {
  const now = Date.now()
  if (now - lastOpenAiFailNoticeAt < 4000) return
  lastOpenAiFailNoticeAt = now
  toast(`OpenAI TTS 未生效，已改用瀏覽器聲音：${detail}`)
}

function initSpeechVoices(): void {
  if (!('speechSynthesis' in window)) return

  const load = (): void => {
    voices = window.speechSynthesis.getVoices()
    if (authUser && activeTab === 'speech') render()
  }

  load()
  window.speechSynthesis.onvoiceschanged = load
}

function toLangBucket(lang: SpeakPart['lang']): LangBucket {
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('zh')) return 'zh'
  return 'en'
}

function markEnglishReviewed(id: string): void {
  const now = new Date().toISOString()
  englishWords = englishWords.map((item) =>
    item.id === id
      ? { ...item, level: Math.min(item.level + 1, REVIEW_INTERVAL_DAYS.length - 1), lastReviewedAt: now }
      : item
  )
  schedulePersist()
}

function markJapaneseReviewed(id: string): void {
  const now = new Date().toISOString()
  japaneseSentences = japaneseSentences.map((item) =>
    item.id === id
      ? { ...item, level: Math.min(item.level + 1, REVIEW_INTERVAL_DAYS.length - 1), lastReviewedAt: now }
      : item
  )
  schedulePersist()
}

function getEnglishQueueByGroup(group: string): EnglishWord[] {
  return englishWords.filter((item) => {
    if (group === 'all') return true
    if (group === 'due') return isDue(item.level, item.lastReviewedAt)
    if (group === 'needs-work') return item.needsWork
    if (group.startsWith('tag:')) return item.tags.includes(group.slice(4))
    return true
  })
}

function getVisibleEnglishWords(): EnglishWord[] {
  if (englishReview.running) return englishReview.queue

  const keyword = englishSearch.trim().toLowerCase()
  return getEnglishQueueByGroup(englishGroup).filter((item) => {
    if (!keyword) return true
    return item.word.toLowerCase().includes(keyword) || item.meaningZh.toLowerCase().includes(keyword) || item.tags.some((tag) => tag.includes(keyword))
  })
}

function getJapaneseQueueByGroup(group: string): JapaneseSentence[] {
  return japaneseSentences.filter((item) => {
    if (group === 'all') return true
    if (group === 'due') return isDue(item.level, item.lastReviewedAt)
    if (group.startsWith('tag:')) return item.tags.includes(group.slice(4))
    return true
  })
}

function getVisibleJapaneseSentences(): JapaneseSentence[] {
  if (japaneseReview.running) return japaneseReview.queue

  const keyword = japaneseSearch.trim().toLowerCase()
  return getJapaneseQueueByGroup(japaneseGroup).filter((item) => {
    if (!keyword) return true
    return item.sentence.toLowerCase().includes(keyword) || item.romaji.toLowerCase().includes(keyword) || item.meaningZh.toLowerCase().includes(keyword) || item.tags.some((tag) => tag.includes(keyword))
  })
}

function isDue(level: number, lastReviewedAt: string | null): boolean {
  if (!lastReviewedAt) return true
  const reviewedAt = Date.parse(lastReviewedAt)
  if (Number.isNaN(reviewedAt)) return true

  const waitDays = REVIEW_INTERVAL_DAYS[level] ?? REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1]
  return Date.now() >= reviewedAt + waitDays * 24 * 60 * 60 * 1000
}

function extractEnglishKeywords(text: string): string[] {
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

function extractJapaneseSentences(text: string): string[] {
  return Array.from(new Set(text.split(/(?<=[。！？])/).map((part) => part.trim()).filter((part) => part.length >= 8))).slice(0, 200)
}

function parseVocabPairs(raw: string): JapaneseVocab[] {
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

function extractSpelling(word: string): string[] {
  const letters = Array.from(word.replace(/[^A-Za-z]/g, '').toUpperCase())
  if (letters.length > 0) return letters
  return Array.from(word)
}

function parseTags(raw: string): string[] {
  return Array.from(new Set(raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
  )).slice(0, 10)
}

function mergeUniqueStrings(current: string[], incoming: string[]): string[] {
  const merged = new Set<string>(current)
  incoming.forEach((item) => merged.add(item))
  return Array.from(merged)
}

function inferJapaneseTags(sentence: string): string[] {
  const tags = ['news']
  if (/(経済|市場|投資)/.test(sentence)) tags.push('economy')
  if (/(天気|気温|台風)/.test(sentence)) tags.push('weather')
  if (/(観光|旅行|空港)/.test(sentence)) tags.push('travel')
  if (/(学校|授業|勉強)/.test(sentence)) tags.push('study')
  return parseTags(tags.join(','))
}

async function autoTranslate(text: string, from: string, to: string): Promise<string> {
  try {
    const response = await apiFetch(`/api/translate?text=${encodeURIComponent(text)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    if (!response.ok) return ''

    const payload = (await response.json()) as { translatedText: string }
    return payload.translatedText?.trim() || ''
  } catch {
    return ''
  }
}
function schedulePersist(): void {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
  }

  persistTimer = window.setTimeout(() => {
    void persistUserData(false)
  }, 500)
}

async function persistUserData(force: boolean): Promise<void> {
  if (!authUser) return

  if (persistInFlight && !force) {
    pendingPersist = true
    return
  }

  persistInFlight = true
  try {
    const payload: Omit<UserDataPayload, 'updatedAt'> = {
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
    persistInFlight = false
    if (pendingPersist) {
      pendingPersist = false
      void persistUserData(false)
    }
  }
}

function setLocalSeedFallback(): void {
  englishWords = generateEnglishSeedWords(220).map((item, index) => ({
    id: `en-local-${index + 1}`,
    word: item.word,
    meaningZh: item.meaningZh,
    tags: [...item.tags],
    needsWork: false,
    level: 0,
    lastReviewedAt: null
  }))

  japaneseSentences = generateJapaneseSeedSentences(220).map((item, index) => ({
    id: `ja-local-${index + 1}`,
    sentence: item.sentence,
    romaji: item.romaji,
    meaningZh: item.meaningZh,
    tags: [...item.tags],
    vocabulary: item.vocabulary.map((vocab) => ({ ...vocab })),
    level: 0,
    lastReviewedAt: null
  }))

  speechSettings = {
    ...defaultSpeechSettings,
    browserVoices: { ...defaultSpeechSettings.browserVoices },
    rates: { ...defaultSpeechSettings.rates },
    pitches: { ...defaultSpeechSettings.pitches },
    browserVolumes: { ...defaultSpeechSettings.browserVolumes },
    openAiVolumes: { ...defaultSpeechSettings.openAiVolumes }
  }
  themeMode = 'light'
  applyTheme()
}

function normalizeEnglishWords(input: EnglishWord[]): EnglishWord[] {
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

function normalizeJapaneseSentences(input: JapaneseSentence[]): JapaneseSentence[] {
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

function sanitizeSpeechSettings(settings: Partial<SpeechSettings> | undefined): SpeechSettings {
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

function applyTheme(): void {
  document.documentElement.dataset.theme = themeMode
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, {
    ...init,
    headers
  })

  if (response.status === 401 && token) {
    clearAuth()
    render()
    toast('登入已過期，請重新登入')
  }

  return response
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const json = await response.json() as { error?: string }
    return json.error || '未知錯誤'
  } catch {
    const fallback = response.statusText || '未知錯誤'
    try {
      const text = await response.text()
      if (!text) return fallback
      const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return stripped || fallback
    } catch {
      return fallback
    }
  }
}

function byId<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Element #${id} not found`)
  return element as TElement
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

function formatTime(iso: string): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return iso

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function toast(message: string): void {
  const current = document.querySelector<HTMLDivElement>('.toast')
  if (current) current.remove()

  const toastEl = document.createElement('div')
  toastEl.className = 'toast'
  toastEl.textContent = message
  document.body.appendChild(toastEl)

  setTimeout(() => {
    toastEl.remove()
  }, 1800)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value)
}

function encodeForAttr(value: string): string {
  return btoa(encodeURIComponent(value))
}

function decodeFromAttr(value: string): string {
  return decodeURIComponent(atob(value))
}

function extractFileName(contentDisposition: string): string | null {
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)
  if (!match || !match[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
