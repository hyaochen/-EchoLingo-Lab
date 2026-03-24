import type { NewsHeadline, NewsSource } from '../types'
import {
  enCandidates, jaCandidates, enHeadlines, jaHeadlines,
  enNewsSource, jaNewsSource, enNewsQuery, jaNewsQuery,
  enCandidateLimit, jaCandidateLimit, enCandidateTags, jaCandidateTags,
  providerStatus, englishWords, japaneseSentences,
  setEnCandidates, setJaCandidates, setEnHeadlines, setJaHeadlines,
  setEnNewsSource, setJaNewsSource, setEnNewsQuery, setJaNewsQuery,
  setEnCandidateLimit, setJaCandidateLimit, setEnCandidateTags, setJaCandidateTags,
  setEnglishWords, setJapaneseSentences
} from '../state'
import {
  extractEnglishKeywords, extractJapaneseSentences as extractJaSentences,
  parseTags, mergeUniqueStrings, autoTranslate, schedulePersist,
  inferJapaneseTags
} from '../data'
import { apiFetch, safeReadText } from '../api'
import { exportUserData, importUserData } from '../auth'
import { uid, byId, clampNumber, escapeHtml, escapeHtmlAttr, encodeForAttr, decodeFromAttr, toast } from '../utils'
import { triggerRender } from '../renderBus'
import { toRomaji } from 'wanakana'

export function renderContentTab(): void {
  const panel = byId<HTMLDivElement>('tab-content')
  const shownEnCandidates = enCandidates.slice(0, enCandidateLimit)
  const shownJaCandidates = jaCandidates.slice(0, jaCandidateLimit)

  panel.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">內容工坊</h2>
        <p class="page-desc">支援貼文抽取與一鍵匯入新聞，快速補充學習內容</p>
      </div>
    </div>

    <div class="content-grid">
      <article class="card">
        <div class="card-header">
          <h3 class="card-title">英文內容</h3>
        </div>
        <form id="enExtractForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">英文文章</label>
            <textarea id="enTextInput" class="field-textarea" placeholder="貼上英文新聞內容"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">抽取關鍵字</button>
        </form>

        <div class="form-stack" style="margin-top:1rem">
          <div class="field-row">
            <div class="field-group">
              <label class="field-label">新聞關鍵字</label>
              <input id="enNewsQueryInput" class="field-input" placeholder="AI, climate, market" value="${escapeHtmlAttr(enNewsQuery)}" />
            </div>
            <div class="field-group">
              <label class="field-label">新聞來源</label>
              <select id="enNewsSourceSelect" class="field-select">
                <option value="rss" ${enNewsSource === 'rss' ? 'selected' : ''}>免費 RSS</option>
                <option value="newsapi" ${providerStatus.news.newsapi ? '' : 'disabled'}>News API / GNews</option>
              </select>
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label class="field-label">顯示候選數</label>
              <input id="enCandidateLimitInput" class="field-input" type="number" min="10" max="200" step="10" value="${enCandidateLimit}" />
            </div>
            <div class="field-group">
              <label class="field-label">加入時標籤</label>
              <input id="enCandidateTagsInput" class="field-input" placeholder="news, topic-ai" value="${escapeHtmlAttr(enCandidateTags)}" />
            </div>
          </div>
          <button id="enImportNewsBtn" class="btn btn-secondary">匯入英文新聞</button>
        </div>

        <p class="muted-text" style="margin-top:.5rem">英文候選：${shownEnCandidates.length} / ${enCandidates.length} 筆</p>
        <div class="candidate-grid">${shownEnCandidates.map((c) => `<button class="tag-chip" data-en-candidate="${escapeHtmlAttr(c)}">${escapeHtml(c)}</button>`).join('')}</div>
        <div class="headline-list" style="margin-top:.75rem">${enHeadlines.map((item) => renderHeadline(item, 'en')).join('')}</div>
      </article>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">日文內容</h3>
        </div>
        <form id="jaExtractForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">日文文章</label>
            <textarea id="jaTextInput" class="field-textarea" placeholder="貼上日文段落"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">切句</button>
        </form>

        <div class="form-stack" style="margin-top:1rem">
          <div class="field-row">
            <div class="field-group">
              <label class="field-label">新聞關鍵字</label>
              <input id="jaNewsQueryInput" class="field-input" placeholder="経済, 技術, 旅行" value="${escapeHtmlAttr(jaNewsQuery)}" />
            </div>
            <div class="field-group">
              <label class="field-label">新聞來源</label>
              <select id="jaNewsSourceSelect" class="field-select">
                <option value="rss" ${jaNewsSource === 'rss' ? 'selected' : ''}>免費 RSS</option>
                <option value="newsapi" ${providerStatus.news.newsapi ? '' : 'disabled'}>News API / GNews</option>
              </select>
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label class="field-label">顯示候選數</label>
              <input id="jaCandidateLimitInput" class="field-input" type="number" min="10" max="200" step="10" value="${jaCandidateLimit}" />
            </div>
            <div class="field-group">
              <label class="field-label">加入時標籤</label>
              <input id="jaCandidateTagsInput" class="field-input" placeholder="news, topic-economy" value="${escapeHtmlAttr(jaCandidateTags)}" />
            </div>
          </div>
          <button id="jaImportNewsBtn" class="btn btn-secondary">匯入日文新聞</button>
        </div>

        <p class="muted-text" style="margin-top:.5rem">日文候選：${shownJaCandidates.length} / ${jaCandidates.length} 筆</p>
        <div class="candidate-grid candidate-grid-full">${shownJaCandidates.map((c) => `<button class="tag-chip tag-chip-full" data-ja-candidate="${escapeHtmlAttr(c)}">${escapeHtml(c)}</button>`).join('')}</div>
        <div class="headline-list" style="margin-top:.75rem">${jaHeadlines.map((item) => renderHeadline(item, 'ja')).join('')}</div>
      </article>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">個人資料備份</h3>
        </div>
        <p class="muted-text">可匯出/匯入自己的學習資料（英文、日文、聲音設定、主題）</p>
        <div class="form-stack" style="margin-top:.75rem">
          <button id="exportUserDataBtn" class="btn btn-secondary">匯出我的學習資料</button>
          <div class="field-group">
            <label class="field-label">匯入檔案（JSON）</label>
            <input id="importUserDataFile" class="field-input" type="file" accept="application/json,.json" />
          </div>
          <button id="importUserDataBtn" class="btn btn-primary">匯入並覆蓋目前資料</button>
        </div>
      </article>
    </div>
  `

  byId<HTMLFormElement>('enExtractForm').addEventListener('submit', (event) => {
    event.preventDefault()
    const text = byId<HTMLTextAreaElement>('enTextInput').value
    setEnCandidates(extractEnglishKeywords(text))
    triggerRender()
  })

  byId<HTMLFormElement>('jaExtractForm').addEventListener('submit', (event) => {
    event.preventDefault()
    const text = byId<HTMLTextAreaElement>('jaTextInput').value
    setJaCandidates(extractJaSentences(text))
    triggerRender()
  })

  byId<HTMLSelectElement>('enNewsSourceSelect').addEventListener('change', (event) => {
    setEnNewsSource((event.currentTarget as HTMLSelectElement).value as NewsSource)
  })
  byId<HTMLInputElement>('enNewsQueryInput').addEventListener('input', (event) => {
    setEnNewsQuery((event.currentTarget as HTMLInputElement).value)
  })
  byId<HTMLInputElement>('enCandidateLimitInput').addEventListener('change', (event) => {
    setEnCandidateLimit(clampNumber(Number((event.currentTarget as HTMLInputElement).value), 10, 200))
    triggerRender()
  })
  byId<HTMLInputElement>('enCandidateTagsInput').addEventListener('input', (event) => {
    setEnCandidateTags((event.currentTarget as HTMLInputElement).value)
  })

  byId<HTMLSelectElement>('jaNewsSourceSelect').addEventListener('change', (event) => {
    setJaNewsSource((event.currentTarget as HTMLSelectElement).value as NewsSource)
  })
  byId<HTMLInputElement>('jaNewsQueryInput').addEventListener('input', (event) => {
    setJaNewsQuery((event.currentTarget as HTMLInputElement).value)
  })
  byId<HTMLInputElement>('jaCandidateLimitInput').addEventListener('change', (event) => {
    setJaCandidateLimit(clampNumber(Number((event.currentTarget as HTMLInputElement).value), 10, 200))
    triggerRender()
  })
  byId<HTMLInputElement>('jaCandidateTagsInput').addEventListener('input', (event) => {
    setJaCandidateTags((event.currentTarget as HTMLInputElement).value)
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
    const fileInput = byId<HTMLInputElement>('importUserDataFile')
    const file = fileInput.files?.[0]
    if (!file) {
      toast('請先選擇 JSON 檔案')
      return
    }
    void importUserData(file).then(() => { fileInput.value = '' })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-en-candidate]').forEach((button) => {
    button.addEventListener('click', () => {
      const keyword = button.dataset.enCandidate
      if (!keyword) return
      void addEnglishCandidate(keyword, parseTags(enCandidateTags))
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-ja-candidate]').forEach((button) => {
    button.addEventListener('click', () => {
      const sentence = button.dataset.jaCandidate
      if (!sentence) return
      void addJapaneseCandidate(sentence, parseTags(jaCandidateTags))
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-headline-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang
      const payload = button.dataset.headlineAdd
      if (!payload) return
      const text = decodeFromAttr(payload)

      if (lang === 'en') {
        setEnCandidates(mergeUniqueStrings(enCandidates, extractEnglishKeywords(text)))
        triggerRender()
      }

      if (lang === 'ja') {
        setJaCandidates(mergeUniqueStrings(jaCandidates, extractJaSentences(text)))
        triggerRender()
      }
    })
  })
}

function renderHeadline(item: NewsHeadline, lang: 'en' | 'ja'): string {
  return `
    <article class="headline-card">
      <h4 class="headline-title">${escapeHtml(item.title)}</h4>
      <p class="headline-summary">${escapeHtml(item.summary || '（無摘要）')}</p>
      <p class="muted-text headline-meta">${escapeHtml(item.source)}${item.publishedAt ? ` · ${new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(new Date(item.publishedAt))}` : ''}</p>
      <div class="list-item-actions" style="margin-top:.5rem">
        ${item.link ? `<a href="${escapeHtmlAttr(item.link)}" target="_blank" rel="noreferrer" class="btn btn-secondary btn-sm">原文 ↗</a>` : ''}
        <button class="btn btn-primary btn-sm" data-lang="${lang}" data-headline-add="${encodeForAttr(`${item.title} ${item.summary}`)}">提取候選</button>
      </div>
    </article>
  `
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

  const payload = (await response.json()) as { items: NewsHeadline[]; count: number }

  if (lang === 'en') {
    setEnHeadlines(payload.items)
    setEnCandidates(extractEnglishKeywords(payload.items.map((item) => `${item.title} ${item.summary}`).join(' ')))
  } else {
    setJaHeadlines(payload.items)
    setJaCandidates(extractJaSentences(payload.items.map((item) => `${item.title}${item.summary}`).join('。')))
  }

  if ((payload.count ?? payload.items.length) === 0) {
    toast(`找不到「${query || '目前條件'}」的新聞，請換關鍵字或改來源`)
  }

  triggerRender()
}

async function addEnglishCandidate(candidate: string, tags: string[] = ['news']): Promise<void> {
  const existed = englishWords.some((item) => item.word.toLowerCase() === candidate.toLowerCase())
  if (existed) {
    toast('此單字已存在')
    return
  }

  const meaning = await autoTranslate(candidate, 'en', 'zh-TW')

  setEnglishWords([
    {
      id: `en-${uid()}`,
      word: candidate,
      meaningZh: meaning || '（請手動補中文）',
      tags: tags.length > 0 ? tags : ['news'],
      needsWork: false,
      level: 0,
      lastReviewedAt: null
    },
    ...englishWords
  ])

  schedulePersist()
  toast(`已加入英文單字：${candidate}`)
  triggerRender()
}

async function addJapaneseCandidate(candidate: string, tags: string[] = ['news']): Promise<void> {
  const existed = japaneseSentences.some((item) => item.sentence === candidate)
  if (existed) {
    toast('此句子已存在')
    return
  }

  const meaning = await autoTranslate(candidate, 'ja', 'zh-TW')

  setJapaneseSentences([
    {
      id: `ja-${uid()}`,
      sentence: candidate,
      romaji: toRomaji(candidate),
      meaningZh: meaning || '（請手動補中文）',
      tags: tags.length > 0 ? tags : inferJapaneseTags(candidate),
      vocabulary: [],
      level: 0,
      lastReviewedAt: null
    },
    ...japaneseSentences
  ])

  schedulePersist()
  toast('已加入日文句子')
  triggerRender()
}
