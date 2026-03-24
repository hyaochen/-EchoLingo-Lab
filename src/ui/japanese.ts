import { toRomaji } from 'wanakana'
import type { JapaneseSentence } from '../types'
import {
  japaneseSentences, japaneseGroup, japaneseSearch, japaneseReview,
  setJapaneseSentences, setJapaneseGroup, setJapaneseSearch
} from '../state'
import {
  isDue, parseTags, schedulePersist, parseVocabPairs, inferJapaneseTags,
  getVisibleJapaneseSentences, markJapaneseReviewed, autoTranslate
} from '../data'
import {
  startJapaneseReview, toggleJapanesePause, stopJapaneseReview, shiftJapaneseReview
} from '../review'
import { playSingleJapanese } from '../speech'
import { uid, byId, escapeHtml, escapeHtmlAttr, toast } from '../utils'
import { triggerRender } from '../renderBus'

export function renderJapaneseTab(): void {
  const panel = byId<HTMLDivElement>('tab-japanese')
  const dueCount = japaneseSentences.filter((item) => isDue(item.level, item.lastReviewedAt)).length
  const filteredSentences = getVisibleJapaneseSentences(japaneseReview.running, japaneseReview.queue)
  const progress = japaneseReview.running
    ? `${Math.min(japaneseReview.index + 1, japaneseReview.queue.length)} / ${japaneseReview.queue.length}`
    : null

  panel.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">日文句子</h2>
        <p class="page-desc">流程：句子朗讀 → 繁中意涵；支援羅馬拼音</p>
      </div>
      <div class="page-stats">
        <span class="stat-badge stat-due">待複習 ${dueCount}</span>
      </div>
    </div>

    <div class="content-grid">
      <article class="card">
        <div class="card-header">
          <h3 class="card-title">新增日文句子</h3>
        </div>
        <form id="japaneseAddForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">日文句子</label>
            <textarea id="jaSentenceInput" class="field-textarea" required placeholder="明日は図書館で日本語を勉強します。"></textarea>
          </div>
          <div class="field-group">
            <label class="field-label">羅馬拼音（可留空自動生成）</label>
            <input id="jaRomajiInput" class="field-input" placeholder="Ashita wa toshokan de nihongo o benkyou shimasu." />
          </div>
          <div class="field-group">
            <label class="field-label">繁體中文意涵（可留空自動生成）</label>
            <textarea id="jaMeaningInput" class="field-textarea" placeholder="明天會在圖書館學日文。"></textarea>
          </div>
          <div class="field-group">
            <label class="field-label">單字對照（格式：単語=單字; 勉強=學習）</label>
            <input id="jaVocabInput" class="field-input" placeholder="単語=單字; 勉強=學習" />
          </div>
          <div class="field-group">
            <label class="field-label">標籤（逗號分隔）</label>
            <input id="jaTagsInput" class="field-input" placeholder="daily, news" />
          </div>
          <button type="submit" class="btn btn-primary">新增</button>
        </form>
      </article>

      <article class="card card-player">
        <div class="card-header">
          <h3 class="card-title">播放器</h3>
          ${progress ? `<span class="player-progress">${progress}</span>` : ''}
        </div>

        <div class="form-stack">
          <div class="field-group">
            <label class="field-label">播放群組</label>
            <select id="japaneseGroupSelect" class="field-select">
              ${renderJapaneseGroupOptions()}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">搜尋</label>
            <input id="japaneseSearchInput" class="field-input" placeholder="輸入關鍵字過濾" value="${escapeHtmlAttr(japaneseSearch)}" />
          </div>
          <p class="muted-text">${japaneseReview.running ? `播放中，共 ${japaneseReview.queue.length} 句` : `顯示 ${filteredSentences.length} / ${japaneseSentences.length} 句`}</p>
        </div>

        <div class="player-controls">
          <button id="jaStartBtn" class="btn btn-primary player-btn-main">
            ${japaneseReview.running ? '重新開始' : '開始'}
          </button>
          <button id="jaPauseBtn" class="btn btn-secondary" ${japaneseReview.running ? '' : 'disabled'}>
            ${japaneseReview.paused ? '▶ 續播' : '⏸ 暫停'}
          </button>
          <button id="jaPrevBtn" class="btn btn-secondary" ${japaneseReview.running ? '' : 'disabled'}>◀ 上一句</button>
          <button id="jaNextBtn" class="btn btn-secondary" ${japaneseReview.running ? '' : 'disabled'}>▶ 下一句</button>
          <button id="jaStopBtn" class="btn btn-danger" ${japaneseReview.running ? '' : 'disabled'}>⏹ 停止</button>
        </div>
      </article>
    </div>

    <div class="list-container">
      ${filteredSentences.length > 0
        ? filteredSentences.map((item) => renderJapaneseRow(item)).join('')
        : '<div class="empty-state"><p>目前沒有符合條件的日文句子</p></div>'
      }
    </div>
  `

  byId<HTMLFormElement>('japaneseAddForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void addJapaneseSentence()
  })

  byId<HTMLSelectElement>('japaneseGroupSelect').addEventListener('change', (event) => {
    setJapaneseGroup((event.currentTarget as HTMLSelectElement).value)
    triggerRender()
  })

  byId<HTMLInputElement>('japaneseSearchInput').addEventListener('input', (event) => {
    setJapaneseSearch((event.currentTarget as HTMLInputElement).value)
    triggerRender()
  })

  byId<HTMLButtonElement>('jaStartBtn').addEventListener('click', () => {
    void startJapaneseReview(japaneseGroup)
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
        const item = japaneseSentences.find((s) => s.id === id)
        if (item) void playSingleJapanese(item)
      }

      if (action === 'reviewed') {
        markJapaneseReviewed(id)
        triggerRender()
      }

      if (action === 'edit-tags') {
        const target = japaneseSentences.find((s) => s.id === id)
        if (!target) return
        const next = window.prompt('請輸入標籤（逗號分隔）', target.tags.join(', '))
        if (next === null) return
        setJapaneseSentences(japaneseSentences.map((s) => (s.id === id ? { ...s, tags: parseTags(next) } : s)))
        schedulePersist()
        triggerRender()
      }

      if (action === 'delete') {
        setJapaneseSentences(japaneseSentences.filter((s) => s.id !== id))
        schedulePersist()
        triggerRender()
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
  const tags = item.tags.length > 0
    ? item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
    : '<span class="muted-text">無標籤</span>'
  const vocab = item.vocabulary.length > 0
    ? item.vocabulary.map((v) => `${escapeHtml(v.word)}=${escapeHtml(v.meaningZh)}`).join('、')
    : '無'
  const reviewedAt = item.lastReviewedAt
    ? new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(new Date(item.lastReviewedAt))
    : '未複習'
  const levelDots = '●'.repeat(item.level) + '○'.repeat(5 - item.level)

  return `
    <article class="list-item">
      <div class="list-item-body">
        <div class="list-item-main">
          <p class="item-sentence">${escapeHtml(item.sentence)}</p>
          <p class="item-romaji">${escapeHtml(item.romaji)}</p>
          <p class="item-meaning">${escapeHtml(item.meaningZh)}</p>
          <p class="item-vocab muted-text">單字：${vocab}</p>
        </div>
        <div class="item-meta">
          <span class="item-level" title="學習進度">${levelDots}</span>
          <span class="item-date">${reviewedAt}</span>
        </div>
        <div class="tag-bar">${tags}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary btn-sm" data-ja-action="play" data-id="${escapeHtmlAttr(item.id)}">▶ 朗讀</button>
        <button class="btn btn-secondary btn-sm" data-ja-action="reviewed" data-id="${escapeHtmlAttr(item.id)}">✓ 已複習</button>
        <button class="btn btn-secondary btn-sm" data-ja-action="edit-tags" data-id="${escapeHtmlAttr(item.id)}">✎ 標籤</button>
        <button class="btn btn-danger btn-sm" data-ja-action="delete" data-id="${escapeHtmlAttr(item.id)}">刪除</button>
      </div>
    </article>
  `
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

  setJapaneseSentences([
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
  ])

  sentenceInput.value = ''
  romajiInput.value = ''
  meaningInput.value = ''
  vocabInput.value = ''
  tagsInput.value = ''

  schedulePersist()
  triggerRender()
}
