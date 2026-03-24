import type { EnglishWord } from '../types'
import {
  englishWords, englishGroup, englishSearch, englishReview,
  setEnglishWords, setEnglishGroup, setEnglishSearch
} from '../state'
import {
  isDue, parseTags, schedulePersist,
  getVisibleEnglishWords, markEnglishReviewed
} from '../data'
import {
  startEnglishReview, toggleEnglishPause, stopEnglishReview, shiftEnglishReview
} from '../review'
import { playSingleEnglish } from '../speech'
import { autoTranslate } from '../data'
import { uid, byId, escapeHtml, escapeHtmlAttr, toast } from '../utils'
import { triggerRender } from '../renderBus'

export function renderEnglishTab(): void {
  const panel = byId<HTMLDivElement>('tab-english')
  const dueCount = englishWords.filter((item) => isDue(item.level, item.lastReviewedAt)).length
  const needsWorkCount = englishWords.filter((item) => item.needsWork).length
  const filteredWords = getVisibleEnglishWords(englishReview.running, englishReview.queue)
  const progress = englishReview.running
    ? `${Math.min(englishReview.index + 1, englishReview.queue.length)} / ${englishReview.queue.length}`
    : null

  panel.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">英文單字</h2>
        <p class="page-desc">流程：單字發音 → 字母拼讀 → 繁中意涵</p>
      </div>
      <div class="page-stats">
        <span class="stat-badge stat-due">待複習 ${dueCount}</span>
        <span class="stat-badge stat-work">需加強 ${needsWorkCount}</span>
      </div>
    </div>

    <div class="content-grid">
      <article class="card">
        <div class="card-header">
          <h3 class="card-title">新增英文單字</h3>
        </div>
        <form id="englishAddForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">英文單字</label>
            <input id="englishWordInput" class="field-input" required placeholder="momentum" />
          </div>
          <div class="field-group">
            <label class="field-label">繁體中文意涵（可留空自動生成）</label>
            <input id="englishMeaningInput" class="field-input" placeholder="動能；趨勢動力" />
          </div>
          <div class="field-group">
            <label class="field-label">標籤（逗號分隔）</label>
            <input id="englishTagsInput" class="field-input" placeholder="news, business" />
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
            <select id="englishGroupSelect" class="field-select">
              ${renderEnglishGroupOptions()}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">搜尋</label>
            <input id="englishSearchInput" class="field-input" placeholder="輸入關鍵字過濾" value="${escapeHtmlAttr(englishSearch)}" />
          </div>
          <div class="tag-bar">${renderEnglishTagChips()}</div>
          <p class="muted-text">${englishReview.running ? `播放中，共 ${englishReview.queue.length} 筆` : `顯示 ${filteredWords.length} / ${englishWords.length} 筆`}</p>
        </div>

        <div class="player-controls">
          <button id="enStartBtn" class="btn btn-primary player-btn-main">
            ${englishReview.running ? '重新開始' : '開始'}
          </button>
          <button id="enPauseBtn" class="btn btn-secondary" ${englishReview.running ? '' : 'disabled'}>
            ${englishReview.paused ? '▶ 續播' : '⏸ 暫停'}
          </button>
          <button id="enPrevBtn" class="btn btn-secondary" ${englishReview.running ? '' : 'disabled'}>◀ 上一個</button>
          <button id="enNextBtn" class="btn btn-secondary" ${englishReview.running ? '' : 'disabled'}>▶ 下一個</button>
          <button id="enStopBtn" class="btn btn-danger" ${englishReview.running ? '' : 'disabled'}>⏹ 停止</button>
        </div>
      </article>
    </div>

    <div class="list-container">
      ${filteredWords.length > 0
        ? filteredWords.map((item) => renderEnglishRow(item)).join('')
        : '<div class="empty-state"><p>目前沒有符合條件的英文單字</p></div>'
      }
    </div>
  `

  byId<HTMLFormElement>('englishAddForm').addEventListener('submit', (event) => {
    event.preventDefault()
    void addEnglishWord()
  })

  byId<HTMLSelectElement>('englishGroupSelect').addEventListener('change', (event) => {
    setEnglishGroup((event.currentTarget as HTMLSelectElement).value)
    triggerRender()
  })

  byId<HTMLInputElement>('englishSearchInput').addEventListener('input', (event) => {
    setEnglishSearch((event.currentTarget as HTMLInputElement).value)
    triggerRender()
  })

  byId<HTMLButtonElement>('enStartBtn').addEventListener('click', () => {
    void startEnglishReview(englishGroup)
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
      setEnglishGroup(group)
      triggerRender()
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
        setEnglishWords(englishWords.map((word) => (word.id === id ? { ...word, needsWork: !word.needsWork } : word)))
        schedulePersist()
        triggerRender()
      }

      if (action === 'reviewed') {
        markEnglishReviewed(id)
        triggerRender()
      }

      if (action === 'edit-tags') {
        const target = englishWords.find((word) => word.id === id)
        if (!target) return
        const next = window.prompt('請輸入標籤（逗號分隔）', target.tags.join(', '))
        if (next === null) return
        setEnglishWords(englishWords.map((word) => (word.id === id ? { ...word, tags: parseTags(next) } : word)))
        schedulePersist()
        triggerRender()
      }

      if (action === 'delete') {
        setEnglishWords(englishWords.filter((word) => word.id !== id))
        schedulePersist()
        triggerRender()
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
  if (tags.length === 0) return '<span class="muted-text">尚無標籤</span>'
  return tags
    .map((tag) => {
      const active = englishGroup === `tag:${tag}`
      return `<button class="tag-chip ${active ? 'is-active' : ''}" data-en-group="tag:${escapeHtmlAttr(tag)}" ${active ? 'disabled' : ''}>${escapeHtml(tag)}</button>`
    })
    .join('')
}

function renderEnglishRow(item: EnglishWord): string {
  const tags = item.tags.length > 0
    ? item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
    : '<span class="muted-text">無標籤</span>'
  const reviewedAt = item.lastReviewedAt
    ? new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(new Date(item.lastReviewedAt))
    : '未複習'
  const levelDots = '●'.repeat(item.level) + '○'.repeat(5 - item.level)

  return `
    <article class="list-item ${item.needsWork ? 'is-needs-work' : ''}">
      <div class="list-item-body">
        <div class="list-item-main">
          <p class="item-word">${escapeHtml(item.word)}</p>
          <p class="item-meaning">${escapeHtml(item.meaningZh)}</p>
        </div>
        <div class="item-meta">
          <span class="item-level" title="學習進度">${levelDots}</span>
          <span class="item-date">${reviewedAt}</span>
          ${item.needsWork ? '<span class="badge badge-work">需加強</span>' : ''}
        </div>
        <div class="tag-bar">${tags}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary btn-sm" data-en-action="play" data-id="${escapeHtmlAttr(item.id)}">▶ 朗讀</button>
        <button class="btn btn-secondary btn-sm" data-en-action="needs-work" data-id="${escapeHtmlAttr(item.id)}">${item.needsWork ? '取消加強' : '需加強'}</button>
        <button class="btn btn-secondary btn-sm" data-en-action="reviewed" data-id="${escapeHtmlAttr(item.id)}">✓ 已複習</button>
        <button class="btn btn-secondary btn-sm" data-en-action="edit-tags" data-id="${escapeHtmlAttr(item.id)}">✎ 標籤</button>
        <button class="btn btn-danger btn-sm" data-en-action="delete" data-id="${escapeHtmlAttr(item.id)}">刪除</button>
      </div>
    </article>
  `
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

  setEnglishWords([
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
  ])

  wordInput.value = ''
  meaningInput.value = ''
  tagsInput.value = ''

  schedulePersist()
  triggerRender()
}
