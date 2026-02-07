import 'dotenv/config'
import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import { XMLParser } from 'fast-xml-parser'
import { promises as fs } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { generateEnglishSeedWords, generateJapaneseSeedSentences } from '../src/seedData'

type SupportedLang = 'en' | 'ja'
type NewsSource = 'rss' | 'newsapi'
type UserRole = 'admin' | 'user'
type ThemeMode = 'light' | 'dark'

type EnglishWord = {
  id: string
  word: string
  meaningZh: string
  tags: string[]
  needsWork: boolean
  level: number
  lastReviewedAt: string | null
}

type JapaneseSentence = {
  id: string
  sentence: string
  romaji: string
  meaningZh: string
  tags: string[]
  vocabulary: Array<{ word: string; meaningZh: string }>
  level: number
  lastReviewedAt: string | null
}

type SpeechSettings = {
  engine: 'browser' | 'openai'
  openAiVoice: string
  browserVoices: Record<'en' | 'zh' | 'ja', string>
  rates: Record<'en' | 'zh' | 'ja', number>
  pitches: Record<'en' | 'zh' | 'ja', number>
  browserVolumes: Record<'en' | 'zh' | 'ja', number>
  openAiVolumes: Record<'en' | 'zh' | 'ja', number>
}

type UserDataRecord = {
  englishWords: EnglishWord[]
  japaneseSentences: JapaneseSentence[]
  speechSettings: SpeechSettings
  theme: ThemeMode
  updatedAt: string
}

type UserRecord = {
  account: string
  password: string
  active: boolean
  role: UserRole
  name: string
  createdAt: string
  updatedAt: string
  data: UserDataRecord
}

type SessionRecord = {
  token: string
  account: string
  role: UserRole
  expiresAt: number
}

type AppDatabase = {
  meta: {
    lastBackupDate: string | null
  }
  users: Record<string, UserRecord>
}

type NewsHeadline = {
  id: string
  title: string
  summary: string
  link: string
  source: string
  publishedAt: string | null
}

type AuthRequest = Request & {
  auth?: { account: string; role: UserRole }
}

const app = express()
const port = Number(process.env.API_PORT ?? 8787)

const DATA_DIR = path.join(process.cwd(), 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const DB_PATH = path.join(DATA_DIR, 'app-db.json')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts'
const NEWSAPI_KEY = process.env.NEWSAPI_KEY ?? ''
const GNEWS_API_KEY = process.env.GNEWS_API_KEY ?? ''
const NEWS_PROVIDER = String(process.env.NEWS_PROVIDER ?? 'auto').trim().toLowerCase()

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true })
const rssFeeds: Record<SupportedLang, string[]> = {
  en: ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'https://www.theguardian.com/world/rss'],
  ja: ['https://www3.nhk.or.jp/rss/news/cat0.xml', 'https://www3.nhk.or.jp/rss/news/cat1.xml']
}

const defaultSpeechSettings: SpeechSettings = {
  engine: 'browser',
  openAiVoice: 'alloy',
  browserVoices: { en: '', zh: '', ja: '' },
  rates: { en: 0.95, zh: 0.95, ja: 0.95 },
  pitches: { en: 1, zh: 1, ja: 1 },
  browserVolumes: { en: 1, zh: 1, ja: 1 },
  openAiVolumes: { en: 0.9, zh: 0.9, ja: 0.9 }
}

const sessions = new Map<string, SessionRecord>()
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

app.use(cors())
app.use(express.json({ limit: '5mb' }))

let database = await initDatabase()
let writeLock: Promise<void> = Promise.resolve()

setInterval(() => {
  void ensureDailyBackup(false)
  pruneSessions()
}, 60 * 60 * 1000).unref()

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, now: new Date().toISOString() })
})

app.post('/api/auth/login', (request, response) => {
  const account = String(request.body?.account ?? '').trim()
  const password = String(request.body?.password ?? '').trim()

  const user = database.users[account]
  if (!user || user.password !== password) {
    response.status(401).json({ error: '帳號或密碼錯誤' })
    return
  }
  if (!user.active) {
    response.status(403).json({ error: '此帳號已停用，請聯絡管理員' })
    return
  }

  const token = createToken()
  sessions.set(token, {
    token,
    account,
    role: user.role,
    expiresAt: Date.now() + SESSION_TTL_MS
  })

  response.json({
    token,
    user: {
      account: user.account,
      role: user.role,
      name: user.name
    }
  })
})

app.post('/api/auth/logout', requireAuth, (request, response) => {
  const token = readBearerToken(request)
  if (token) sessions.delete(token)
  response.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (request, response) => {
  const auth = (request as AuthRequest).auth!
  const user = database.users[auth.account]
  if (!user) {
    response.status(404).json({ error: 'user not found' })
    return
  }

  response.json({
    account: user.account,
    role: user.role,
    name: user.name
  })
})

app.get('/api/providers', requireAuth, (_request, response) => {
  response.json(getProviderStatus())
})

app.post('/api/admin/providers/refresh', requireAuth, requireAdmin, (_request, response) => {
  response.json(getProviderStatus())
})

app.get('/api/user/data', requireAuth, (request, response) => {
  const auth = (request as AuthRequest).auth!
  const user = database.users[auth.account]

  if (!user) {
    response.status(404).json({ error: 'user not found' })
    return
  }

  response.json({
    account: user.account,
    active: user.active,
    role: user.role,
    name: user.name,
    data: user.data
  })
})

app.put('/api/user/data', requireAuth, async (request, response) => {
  const auth = (request as AuthRequest).auth!
  const user = database.users[auth.account]

  if (!user) {
    response.status(404).json({ error: 'user not found' })
    return
  }

  const input = request.body as Partial<UserDataRecord> | undefined

  user.data = sanitizeUserData({
    ...input,
    updatedAt: new Date().toISOString()
  })
  user.updatedAt = new Date().toISOString()

  await persistDatabase()
  response.json({ ok: true })
})

app.get('/api/admin/users', requireAuth, requireAdmin, (_request, response) => {
  response.json({
    users: Object.values(database.users)
      .sort((a, b) => a.account.localeCompare(b.account))
      .map((user) => ({
        account: user.account,
        active: user.active,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        englishCount: user.data.englishWords.length,
        japaneseCount: user.data.japaneseSentences.length
      }))
  })
})

app.post('/api/admin/users', requireAuth, requireAdmin, async (request, response) => {
  const account = String(request.body?.account ?? '').trim()
  const password = String(request.body?.password ?? '').trim()
  const name = String(request.body?.name ?? '').trim() || account
  const role = request.body?.role === 'admin' ? 'admin' : 'user'

  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(account)) {
    response.status(400).json({ error: 'account 格式需為 3-32 位英文數字或 _ -' })
    return
  }

  if (password.length < 4) {
    response.status(400).json({ error: 'password 至少 4 碼' })
    return
  }

  if (database.users[account]) {
    response.status(409).json({ error: '帳號已存在' })
    return
  }

  const now = new Date().toISOString()
  database.users[account] = {
    account,
    password,
    active: true,
    role,
    name,
    createdAt: now,
    updatedAt: now,
    data: createInitialUserData()
  }

  await persistDatabase()
  response.status(201).json({ ok: true })
})

app.delete('/api/admin/users/:account', requireAuth, requireAdmin, async (request, response) => {
  const target = String(request.params.account ?? '').trim()
  const auth = (request as AuthRequest).auth!

  if (!target || !database.users[target]) {
    response.status(404).json({ error: 'user not found' })
    return
  }

  if (target === auth.account) {
    response.status(400).json({ error: '不能刪除目前登入的 admin 帳號' })
    return
  }

  if (target === 'admin') {
    response.status(400).json({ error: '不能刪除預設 admin 帳號' })
    return
  }

  delete database.users[target]
  await persistDatabase()
  response.json({ ok: true })
})

app.patch('/api/admin/users/:account/password', requireAuth, requireAdmin, async (request, response) => {
  const target = String(request.params.account ?? '').trim()
  const password = String(request.body?.password ?? '').trim()

  if (!target || !database.users[target]) {
    response.status(404).json({ error: 'user not found' })
    return
  }
  if (password.length < 4) {
    response.status(400).json({ error: 'password 至少 4 碼' })
    return
  }

  const user = database.users[target]
  user.password = password
  user.updatedAt = new Date().toISOString()
  await persistDatabase()
  response.json({ ok: true })
})

app.patch('/api/admin/users/:account/status', requireAuth, requireAdmin, async (request, response) => {
  const target = String(request.params.account ?? '').trim()
  const auth = (request as AuthRequest).auth!
  const active = Boolean(request.body?.active)

  if (!target || !database.users[target]) {
    response.status(404).json({ error: 'user not found' })
    return
  }
  if (target === 'admin' && !active) {
    response.status(400).json({ error: '不能停用預設 admin 帳號' })
    return
  }
  if (target === auth.account && !active) {
    response.status(400).json({ error: '不能停用目前登入帳號' })
    return
  }

  const user = database.users[target]
  user.active = active
  user.updatedAt = new Date().toISOString()
  await persistDatabase()

  if (!active) {
    for (const [token, session] of sessions.entries()) {
      if (session.account === target) sessions.delete(token)
    }
  }

  response.json({ ok: true })
})

app.get('/api/admin/backups', requireAuth, requireAdmin, async (_request, response) => {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true })

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const fullPath = path.join(BACKUP_DIR, entry.name)
        const stats = await fs.stat(fullPath)
        return {
          fileName: entry.name,
          size: stats.size,
          mtime: stats.mtime.toISOString()
        }
      })
  )

  files.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime))
  response.json({ files })
})

app.post('/api/admin/backup', requireAuth, requireAdmin, async (_request, response) => {
  await ensureDailyBackup(true)
  response.json({ ok: true })
})

app.get('/api/user/export', requireAuth, (request, response) => {
  const auth = (request as AuthRequest).auth!
  const user = database.users[auth.account]
  if (!user) {
    response.status(404).json({ error: 'user not found' })
    return
  }

  const date = new Date().toISOString().slice(0, 10)
  const payload = {
    exportedAt: new Date().toISOString(),
    account: user.account,
    name: user.name,
    data: user.data
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Disposition', `attachment; filename=\"lingua-${user.account}-backup-${date}.json\"`)
  response.send(JSON.stringify(payload, null, 2))
})

app.post('/api/user/import', requireAuth, async (request, response) => {
  const auth = (request as AuthRequest).auth!
  const user = database.users[auth.account]
  if (!user) {
    response.status(404).json({ error: 'user not found' })
    return
  }

  const body = request.body as { data?: unknown } | undefined
  const rawData = body && typeof body === 'object' && 'data' in body ? body.data : request.body

  user.data = sanitizeUserData({
    ...(rawData as Record<string, unknown>),
    updatedAt: new Date().toISOString()
  })
  user.updatedAt = new Date().toISOString()

  await persistDatabase()
  response.json({
    ok: true,
    englishCount: user.data.englishWords.length,
    japaneseCount: user.data.japaneseSentences.length
  })
})

app.get('/api/news/headlines', requireAuth, async (request, response) => {
  const lang = request.query.lang === 'ja' ? 'ja' : 'en'
  const source = request.query.source === 'newsapi' ? 'newsapi' : 'rss'
  const limit = clampNumber(Number(request.query.limit ?? 8), 1, 50)
  const query = String(request.query.q ?? '').trim()

  try {
    const items = source === 'newsapi'
      ? await fetchNewsApiHeadlines(lang, limit, query)
      : await fetchRssHeadlines(lang, limit, query)

    response.json({ lang, source, query, count: items.length, items })
  } catch (error) {
    const message = error instanceof Error ? error.message : '無法取得新聞內容'
    response.status(500).json({ error: message })
  }
})

app.get('/api/translate', requireAuth, async (request, response) => {
  const text = String(request.query.text ?? '').trim()
  const from = String(request.query.from ?? 'en').trim()
  const to = String(request.query.to ?? 'zh-TW').trim()

  if (!text) {
    response.status(400).json({ error: 'text required' })
    return
  }

  try {
    const translatedText = await translateWithMyMemory(text, from, to)
    response.json({ translatedText })
  } catch {
    response.status(500).json({ error: '翻譯失敗' })
  }
})

app.post('/api/tts', requireAuth, async (request, response) => {
  const text = String(request.body?.text ?? '').trim()
  const voice = String(request.body?.voice ?? 'alloy').trim() || 'alloy'
  const speed = clampNumber(Number(request.body?.speed ?? 1), 0.5, 1.5)

  if (!text) {
    response.status(400).json({ error: 'text required' })
    return
  }

  if (!OPENAI_API_KEY) {
    response.status(503).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  try {
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice,
        speed,
        input: text
      })
    })

    if (!ttsResponse.ok) {
      const message = await ttsResponse.text()
      response.status(500).json({ error: `openai tts failed: ${message}` })
      return
    }

    const arrayBuffer = await ttsResponse.arrayBuffer()
    response.setHeader('Content-Type', 'audio/mpeg')
    response.send(Buffer.from(arrayBuffer))
  } catch {
    response.status(500).json({ error: 'openai tts request failed' })
  }
})

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'internal error'
  response.status(500).json({ error: message })
})

app.listen(port, () => {
  console.log(`EchoLingo Lab API listening on http://localhost:${port}`)
})

function requireAuth(request: Request, response: Response, next: NextFunction): void {
  const token = readBearerToken(request)
  if (!token) {
    response.status(401).json({ error: 'missing token' })
    return
  }

  const session = sessions.get(token)
  if (!session) {
    response.status(401).json({ error: 'invalid session' })
    return
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    response.status(401).json({ error: 'session expired' })
    return
  }
  const user = database.users[session.account]
  if (!user) {
    sessions.delete(token)
    response.status(401).json({ error: 'user not found' })
    return
  }
  if (!user.active) {
    sessions.delete(token)
    response.status(403).json({ error: 'account disabled' })
    return
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, session)
  ;(request as AuthRequest).auth = { account: session.account, role: session.role }
  next()
}

function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  const auth = (request as AuthRequest).auth
  if (!auth || auth.role !== 'admin') {
    response.status(403).json({ error: 'admin only' })
    return
  }

  next()
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

function pruneSessions(): void {
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token)
  }
}

function createToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

function getProviderStatus(): { tts: { browser: boolean; openai: boolean }; news: { rss: boolean; newsapi: boolean } } {
  return {
    tts: {
      browser: true,
      openai: Boolean(OPENAI_API_KEY)
    },
    news: {
      rss: true,
      newsapi: Boolean(NEWSAPI_KEY || GNEWS_API_KEY)
    }
  }
}

async function fetchRssHeadlines(lang: SupportedLang, limit: number, query: string): Promise<NewsHeadline[]> {
  const feeds = rssFeeds[lang]
  const allItems: NewsHeadline[] = []

  for (const feed of feeds) {
    try {
      const response = await fetch(feed)
      if (!response.ok) continue
      const xml = await response.text()
      const parsed = xmlParser.parse(xml) as {
        rss?: { channel?: { title?: string; item?: unknown | unknown[] } }
      }

      const channel = parsed.rss?.channel
      const channelTitle = String(channel?.title ?? new URL(feed).hostname)
      const rawItems = channel?.item
      const itemList = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []

      for (const rawItem of itemList) {
        const item = rawItem as Record<string, unknown>
        const title = String(item.title ?? '').trim()
        if (!title) continue

        const link = String(item.link ?? '').trim()
        const summaryRaw = String(item.description ?? item['content:encoded'] ?? '').replace(/<[^>]+>/g, ' ')
        const summary = summaryRaw.replace(/\s+/g, ' ').trim()
        const publishedAt = typeof item.pubDate === 'string' ? new Date(item.pubDate).toISOString() : null

        allItems.push({
          id: `${channelTitle}-${title}`,
          title,
          summary,
          link,
          source: channelTitle,
          publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : null
        })
      }
    } catch {
      continue
    }
  }

  const unique = deduplicateHeadlines(allItems)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? unique.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(normalizedQuery))
    : unique
  filtered.sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''))
  return filtered.slice(0, limit)
}

async function fetchNewsApiHeadlines(lang: SupportedLang, limit: number, query: string): Promise<NewsHeadline[]> {
  const mode = NEWS_PROVIDER === 'newsapi' || NEWS_PROVIDER === 'gnews' ? NEWS_PROVIDER : 'auto'
  const attempts: Array<() => Promise<NewsHeadline[]>> = []

  if (mode === 'newsapi') {
    if (!NEWSAPI_KEY) throw new Error('NEWS_PROVIDER=newsapi 但 NEWSAPI_KEY 未設定')
    attempts.push(() => fetchFromNewsApiOrg(lang, limit, query, NEWSAPI_KEY))
  } else if (mode === 'gnews') {
    const key = GNEWS_API_KEY || NEWSAPI_KEY
    if (!key) throw new Error('NEWS_PROVIDER=gnews 但 GNEWS_API_KEY / NEWSAPI_KEY 皆未設定')
    attempts.push(() => fetchFromGNews(lang, limit, query, key))
  } else {
    if (NEWSAPI_KEY) attempts.push(() => fetchFromNewsApiOrg(lang, limit, query, NEWSAPI_KEY))
    if (GNEWS_API_KEY) attempts.push(() => fetchFromGNews(lang, limit, query, GNEWS_API_KEY))
    if (!GNEWS_API_KEY && NEWSAPI_KEY) attempts.push(() => fetchFromGNews(lang, limit, query, NEWSAPI_KEY))
    if (attempts.length === 0) throw new Error('未設定 NEWSAPI_KEY 或 GNEWS_API_KEY')
  }

  const errors: string[] = []
  for (const run of attempts) {
    try {
      return await run()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      errors.push(message)
    }
  }

  throw new Error(errors.join(' | '))
}

async function fetchFromNewsApiOrg(lang: SupportedLang, limit: number, query: string, apiKey: string): Promise<NewsHeadline[]> {
  const hasQuery = query.trim().length > 0
  const url = new URL(hasQuery ? 'https://newsapi.org/v2/everything' : 'https://newsapi.org/v2/top-headlines')
  url.searchParams.set('pageSize', String(limit))
  if (hasQuery) {
    url.searchParams.set('language', lang)
    url.searchParams.set('q', query.trim())
    url.searchParams.set('sortBy', 'publishedAt')
  } else {
    url.searchParams.set('country', lang === 'ja' ? 'jp' : 'us')
  }

  const response = await fetch(url, {
    headers: { 'X-Api-Key': apiKey }
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`NewsAPI failed: ${detail || response.statusText}`)
  }

  const payload = (await response.json()) as {
    articles?: Array<{
      title?: string
      description?: string
      url?: string
      publishedAt?: string
      source?: { name?: string }
    }>
  }

  const mapped = (payload.articles ?? [])
    .map((article) => {
      const title = String(article.title ?? '').trim()
      if (!title) return null
      const publishedAtRaw = String(article.publishedAt ?? '').trim()
      const publishedAt = publishedAtRaw && !Number.isNaN(Date.parse(publishedAtRaw)) ? new Date(publishedAtRaw).toISOString() : null
      return {
        id: `${article.source?.name ?? 'NewsAPI'}-${title}`,
        title,
        summary: String(article.description ?? '').trim(),
        link: String(article.url ?? '').trim(),
        source: String(article.source?.name ?? 'NewsAPI'),
        publishedAt
      } satisfies NewsHeadline
    })
    .filter((item): item is NewsHeadline => item !== null)

  if (mapped.length === 0) throw new Error('NewsAPI 查無結果，請換關鍵字或放寬條件')
  return deduplicateHeadlines(mapped).slice(0, limit)
}

async function fetchFromGNews(lang: SupportedLang, limit: number, query: string, apiKey: string): Promise<NewsHeadline[]> {
  const hasQuery = query.trim().length > 0
  const url = new URL(hasQuery ? 'https://gnews.io/api/v4/search' : 'https://gnews.io/api/v4/top-headlines')
  url.searchParams.set('lang', lang)
  url.searchParams.set('max', String(limit))
  url.searchParams.set('apikey', apiKey)
  if (hasQuery) {
    url.searchParams.set('q', query.trim())
  } else {
    url.searchParams.set('country', lang === 'ja' ? 'jp' : 'us')
  }

  const response = await fetch(url)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GNews failed: ${detail || response.statusText}`)
  }

  const payload = (await response.json()) as {
    articles?: Array<{
      title?: string
      description?: string
      url?: string
      publishedAt?: string
      source?: { name?: string }
    }>
  }

  const mapped = (payload.articles ?? [])
    .map((article) => {
      const title = String(article.title ?? '').trim()
      if (!title) return null
      const publishedAtRaw = String(article.publishedAt ?? '').trim()
      const publishedAt = publishedAtRaw && !Number.isNaN(Date.parse(publishedAtRaw)) ? new Date(publishedAtRaw).toISOString() : null
      return {
        id: `${article.source?.name ?? 'GNews'}-${title}`,
        title,
        summary: String(article.description ?? '').trim(),
        link: String(article.url ?? '').trim(),
        source: String(article.source?.name ?? 'GNews'),
        publishedAt
      } satisfies NewsHeadline
    })
    .filter((item): item is NewsHeadline => item !== null)

  if (mapped.length === 0) throw new Error('GNews 查無結果，請換關鍵字或放寬條件')
  return deduplicateHeadlines(mapped).slice(0, limit)
}

function deduplicateHeadlines(items: NewsHeadline[]): NewsHeadline[] {
  const seen = new Set<string>()
  const result: NewsHeadline[] = []

  for (const item of items) {
    const key = `${item.title.toLowerCase()}|${item.source.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

async function translateWithMyMemory(text: string, from: string, to: string): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', `${from}|${to}`)

  const response = await fetch(url)
  if (!response.ok) throw new Error('translation request failed')

  const payload = (await response.json()) as {
    responseData?: { translatedText?: string }
  }

  const translated = String(payload.responseData?.translatedText ?? '').trim()
  return translated || text
}

async function initDatabase(): Promise<AppDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(BACKUP_DIR, { recursive: true })

  try {
    const raw = await fs.readFile(DB_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeDatabase(parsed)
    await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8')
    await ensureDailyBackup(false, normalized)
    return normalized
  } catch {
    const fresh = createDefaultDatabase()
    await fs.writeFile(DB_PATH, JSON.stringify(fresh, null, 2), 'utf8')
    await ensureDailyBackup(false, fresh)
    return fresh
  }
}

function createDefaultDatabase(): AppDatabase {
  const now = new Date().toISOString()

  return {
    meta: {
      lastBackupDate: null
    },
    users: {
      admin: {
        account: 'admin',
        password: 'admin',
        active: true,
        role: 'admin',
        name: 'System Admin',
        createdAt: now,
        updatedAt: now,
        data: createInitialUserData()
      }
    }
  }
}

function normalizeDatabase(raw: unknown): AppDatabase {
  const fallback = createDefaultDatabase()
  if (!raw || typeof raw !== 'object') return fallback

  const source = raw as { meta?: { lastBackupDate?: unknown }; users?: unknown }
  const users: Record<string, UserRecord> = {}

  if (source.users && typeof source.users === 'object') {
    for (const [key, value] of Object.entries(source.users as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const rawUser = value as Record<string, unknown>

      const account = String(rawUser.account ?? key).trim()
      if (!account) continue
      if (account.startsWith('user-')) continue

      const role: UserRole = rawUser.role === 'admin' ? 'admin' : 'user'
      const now = new Date().toISOString()
      const password = String(rawUser.password ?? getDefaultPasswordByAccount(account)).trim() || getDefaultPasswordByAccount(account)

      let data = sanitizeUserData(rawUser.data)
      if (isFakeSeedData(data)) {
        data = createInitialUserData()
      }

      users[account] = {
        account,
        password,
        active: rawUser.active === false ? false : true,
        role,
        name: String(rawUser.name ?? account).trim() || account,
        createdAt: parseIsoOr(rawUser.createdAt, now),
        updatedAt: parseIsoOr(rawUser.updatedAt, now),
        data
      }
    }
  }

  ensureDefaultAdmin(users, fallback)

  return {
    meta: {
      lastBackupDate: typeof source.meta?.lastBackupDate === 'string' ? source.meta.lastBackupDate : null
    },
    users
  }
}

function getDefaultPasswordByAccount(account: string): string {
  if (account === 'admin') return 'admin'
  return '0000'
}

function ensureDefaultAdmin(
  users: Record<string, UserRecord>,
  fallback: AppDatabase
): void {
  const admin = users.admin
  if (!admin) {
    users.admin = fallback.users.admin
    return
  }

  admin.role = 'admin'
  admin.active = true
  if (!admin.password.trim()) admin.password = 'admin'
}

function isFakeSeedData(data: UserDataRecord): boolean {
  const fakeWordCount = data.englishWords.filter((item) => /^sampleword\d+/i.test(item.word)).length
  return fakeWordCount >= 20
}

function createInitialUserData(): UserDataRecord {
  const now = new Date().toISOString()
  const englishWords: EnglishWord[] = generateEnglishSeedWords(220).map((item, index) => ({
    id: `en-seed-${index + 1}`,
    word: item.word,
    meaningZh: item.meaningZh,
    tags: sanitizeTags(item.tags),
    needsWork: false,
    level: 0,
    lastReviewedAt: null
  }))

  const japaneseSentences: JapaneseSentence[] = generateJapaneseSeedSentences(220).map((item, index) => ({
    id: `ja-seed-${index + 1}`,
    sentence: item.sentence,
    romaji: item.romaji,
    meaningZh: item.meaningZh,
    tags: sanitizeTags(item.tags),
    vocabulary: item.vocabulary.map((vocab) => ({
      word: String(vocab.word),
      meaningZh: String(vocab.meaningZh)
    })),
    level: 0,
    lastReviewedAt: null
  }))

  return {
    englishWords,
    japaneseSentences,
    speechSettings: {
      ...defaultSpeechSettings,
      browserVoices: { ...defaultSpeechSettings.browserVoices },
      rates: { ...defaultSpeechSettings.rates },
      pitches: { ...defaultSpeechSettings.pitches },
      browserVolumes: { ...defaultSpeechSettings.browserVolumes },
      openAiVolumes: { ...defaultSpeechSettings.openAiVolumes }
    },
    theme: 'light',
    updatedAt: now
  }
}

function sanitizeUserData(raw: unknown): UserDataRecord {
  const source = (raw && typeof raw === 'object' ? raw : {}) as {
    englishWords?: unknown
    japaneseSentences?: unknown
    speechSettings?: unknown
    theme?: unknown
    updatedAt?: unknown
  }

  const englishWords = Array.isArray(source.englishWords)
    ? source.englishWords.map((item, index) => sanitizeEnglishWord(item, index)).filter((item): item is EnglishWord => item !== null)
    : []

  const japaneseSentences = Array.isArray(source.japaneseSentences)
    ? source.japaneseSentences.map((item, index) => sanitizeJapaneseSentence(item, index)).filter((item): item is JapaneseSentence => item !== null)
    : []

  const now = new Date().toISOString()

  return {
    englishWords: englishWords.length > 0 ? englishWords : createInitialUserData().englishWords,
    japaneseSentences: japaneseSentences.length > 0 ? japaneseSentences : createInitialUserData().japaneseSentences,
    speechSettings: sanitizeSpeechSettings(source.speechSettings),
    theme: source.theme === 'dark' ? 'dark' : 'light',
    updatedAt: parseIsoOr(source.updatedAt, now)
  }
}

function sanitizeEnglishWord(raw: unknown, index: number): EnglishWord | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>

  const word = String(source.word ?? '').trim()
  if (!word) return null

  return {
    id: String(source.id ?? `en-${index}-${crypto.randomUUID()}`),
    word,
    meaningZh: String(source.meaningZh ?? '').trim() || '（未填寫）',
    tags: sanitizeTags(source.tags),
    needsWork: Boolean(source.needsWork),
    level: clampNumber(Number(source.level ?? 0), 0, 6),
    lastReviewedAt: typeof source.lastReviewedAt === 'string' ? source.lastReviewedAt : null
  }
}

function sanitizeJapaneseSentence(raw: unknown, index: number): JapaneseSentence | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>

  const sentence = String(source.sentence ?? '').trim()
  if (!sentence) return null

  const vocabularyRaw = Array.isArray(source.vocabulary) ? source.vocabulary : []

  return {
    id: String(source.id ?? `ja-${index}-${crypto.randomUUID()}`),
    sentence,
    romaji: String(source.romaji ?? '').trim() || sentence,
    meaningZh: String(source.meaningZh ?? '').trim() || '（未填寫）',
    tags: sanitizeTags(source.tags),
    vocabulary: vocabularyRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const pair = item as Record<string, unknown>
        const word = String(pair.word ?? '').trim()
        const meaningZh = String(pair.meaningZh ?? '').trim()
        if (!word || !meaningZh) return null
        return { word, meaningZh }
      })
      .filter((item): item is { word: string; meaningZh: string } => item !== null),
    level: clampNumber(Number(source.level ?? 0), 0, 6),
    lastReviewedAt: typeof source.lastReviewedAt === 'string' ? source.lastReviewedAt : null
  }
}

function sanitizeSpeechSettings(raw: unknown): SpeechSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<SpeechSettings>
  const legacyVolumes = (source as unknown as { volumes?: Partial<Record<'en' | 'zh' | 'ja', number>> }).volumes

  return {
    engine: source.engine === 'openai' ? 'openai' : 'browser',
    openAiVoice: typeof source.openAiVoice === 'string' && source.openAiVoice.trim() ? source.openAiVoice.trim() : 'alloy',
    browserVoices: {
      en: typeof source.browserVoices?.en === 'string' ? source.browserVoices.en : '',
      zh: typeof source.browserVoices?.zh === 'string' ? source.browserVoices.zh : '',
      ja: typeof source.browserVoices?.ja === 'string' ? source.browserVoices.ja : ''
    },
    rates: {
      en: clampNumber(Number(source.rates?.en ?? 0.95), 0.6, 1.3),
      zh: clampNumber(Number(source.rates?.zh ?? 0.95), 0.6, 1.3),
      ja: clampNumber(Number(source.rates?.ja ?? 0.95), 0.6, 1.3)
    },
    pitches: {
      en: clampNumber(Number(source.pitches?.en ?? 1), 0.7, 1.4),
      zh: clampNumber(Number(source.pitches?.zh ?? 1), 0.7, 1.4),
      ja: clampNumber(Number(source.pitches?.ja ?? 1), 0.7, 1.4)
    },
    browserVolumes: {
      en: clampNumber(Number(source.browserVolumes?.en ?? legacyVolumes?.en ?? 1), 0, 1),
      zh: clampNumber(Number(source.browserVolumes?.zh ?? legacyVolumes?.zh ?? 1), 0, 1),
      ja: clampNumber(Number(source.browserVolumes?.ja ?? legacyVolumes?.ja ?? 1), 0, 1)
    },
    openAiVolumes: {
      en: clampNumber(Number(source.openAiVolumes?.en ?? legacyVolumes?.en ?? 0.9), 0, 1),
      zh: clampNumber(Number(source.openAiVolumes?.zh ?? legacyVolumes?.zh ?? 0.9), 0, 1),
      ja: clampNumber(Number(source.openAiVolumes?.ja ?? legacyVolumes?.ja ?? 0.9), 0, 1)
    }
  }
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []

  return Array.from(
    new Set(
      raw
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter((item) => Boolean(item))
    )
  ).slice(0, 10)
}

function parseIsoOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return fallback
  return new Date(timestamp).toISOString()
}

async function persistDatabase(): Promise<void> {
  writeLock = writeLock
    .then(async () => {
      await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2), 'utf8')
    })
    .catch(() => undefined)

  await writeLock
}

async function ensureDailyBackup(force: boolean, dbOverride?: AppDatabase): Promise<void> {
  const targetDb = dbOverride ?? database
  await fs.mkdir(BACKUP_DIR, { recursive: true })

  const today = new Date().toISOString().slice(0, 10)
  if (!force && targetDb.meta.lastBackupDate === today) return

  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const fileName = force ? `db-backup-manual-${stamp}.json` : `db-backup-${today}.json`
  const fullPath = path.join(BACKUP_DIR, fileName)

  await fs.writeFile(fullPath, JSON.stringify(targetDb, null, 2), 'utf8')

  if (dbOverride) {
    dbOverride.meta.lastBackupDate = today
    await fs.writeFile(DB_PATH, JSON.stringify(dbOverride, null, 2), 'utf8')
    return
  }

  database.meta.lastBackupDate = today
  await persistDatabase()
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
