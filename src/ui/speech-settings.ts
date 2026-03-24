import type { LangBucket } from '../types'
import { speechSettings, providerStatus, voices, setSpeechSettings } from '../state'
import { loadProviderStatus } from '../auth'
import { schedulePersist } from '../data'
import { testSpeech, previewBrowserVoice, verifyOpenAiVoice } from '../speech'
import { byId, escapeHtml, escapeHtmlAttr, clampNumber, toast } from '../utils'
import { triggerRender } from '../renderBus'

export function renderSpeechTab(): void {
  const panel = byId<HTMLDivElement>('tab-speech')

  panel.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">聲音設定</h2>
        <p class="page-desc">英文、中文、日文可分開設定語速、聲調與音量</p>
      </div>
      <div class="page-stats">
        <span class="stat-badge ${providerStatus.tts.openai ? 'stat-ok' : 'stat-off'}">
          OpenAI ${providerStatus.tts.openai ? '可用' : '未設定'}
        </span>
      </div>
    </div>

    <div class="content-grid">
      <article class="card">
        <div class="card-header">
          <h3 class="card-title">引擎設定</h3>
        </div>
        <form id="speechEngineForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">朗讀引擎</label>
            <select id="speechEngineSelect" class="field-select">
              <option value="browser" ${speechSettings.engine === 'browser' ? 'selected' : ''}>瀏覽器內建（免費）</option>
              <option value="openai" ${speechSettings.engine === 'openai' ? 'selected' : ''} ${providerStatus.tts.openai ? '' : 'disabled'}>OpenAI TTS</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">OpenAI 聲音</label>
            <select id="openAiVoiceSelect" class="field-select" ${speechSettings.engine === 'openai' ? '' : 'disabled'}>
              ${['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']
                .map((voice) => `<option value="${voice}" ${speechSettings.openAiVoice === voice ? 'selected' : ''}>${voice}</option>`)
                .join('')}
            </select>
          </div>
          <div class="btn-row">
            <button type="button" id="refreshTtsStatusBtn" class="btn btn-secondary">更新 TTS 狀態</button>
            <button type="button" id="testSpeechBtn" class="btn btn-secondary">測試聲音</button>
            <button type="submit" class="btn btn-primary">儲存引擎</button>
          </div>
        </form>
      </article>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">瀏覽器聲音</h3>
        </div>
        <form id="browserVoiceForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">英文</label>
            <select id="voice-en" class="field-select">${renderVoiceOptions('en')}</select>
          </div>
          <div class="field-group">
            <label class="field-label">中文</label>
            <select id="voice-zh" class="field-select">${renderVoiceOptions('zh')}</select>
          </div>
          <div class="field-group">
            <label class="field-label">日文</label>
            <select id="voice-ja" class="field-select">${renderVoiceOptions('ja')}</select>
          </div>
          <div class="btn-row">
            <button type="button" id="previewVoiceEnBtn" class="btn btn-secondary">試聽英文</button>
            <button type="button" id="previewVoiceZhBtn" class="btn btn-secondary">試聽中文</button>
            <button type="button" id="previewVoiceJaBtn" class="btn btn-secondary">試聽日文</button>
          </div>
          <button type="submit" class="btn btn-primary">儲存聲音</button>
        </form>
      </article>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">語速 / 聲調 / 音量</h3>
        </div>
        <form id="speechRateForm" class="form-stack">
          <div class="settings-group">
            <p class="settings-group-label">語速</p>
            <div class="field-row">
              ${rangeSlider('rate-en', '英文', 0.6, 1.3, 0.05, speechSettings.rates.en)}
              ${rangeSlider('rate-zh', '中文', 0.6, 1.3, 0.05, speechSettings.rates.zh)}
              ${rangeSlider('rate-ja', '日文', 0.6, 1.3, 0.05, speechSettings.rates.ja)}
            </div>
          </div>
          <div class="settings-group">
            <p class="settings-group-label">聲調</p>
            <div class="field-row">
              ${rangeSlider('pitch-en', '英文', 0.7, 1.4, 0.05, speechSettings.pitches.en)}
              ${rangeSlider('pitch-zh', '中文', 0.7, 1.4, 0.05, speechSettings.pitches.zh)}
              ${rangeSlider('pitch-ja', '日文', 0.7, 1.4, 0.05, speechSettings.pitches.ja)}
            </div>
          </div>
          <div class="settings-group">
            <p class="settings-group-label">瀏覽器音量</p>
            <div class="field-row">
              ${rangeSlider('browser-volume-en', '英文', 0, 1, 0.05, speechSettings.browserVolumes.en)}
              ${rangeSlider('browser-volume-zh', '中文', 0, 1, 0.05, speechSettings.browserVolumes.zh)}
              ${rangeSlider('browser-volume-ja', '日文', 0, 1, 0.05, speechSettings.browserVolumes.ja)}
            </div>
          </div>
          <div class="settings-group">
            <p class="settings-group-label">OpenAI 音量</p>
            <div class="field-row">
              ${rangeSlider('openai-volume-en', '英文', 0, 1, 0.05, speechSettings.openAiVolumes.en)}
              ${rangeSlider('openai-volume-zh', '中文', 0, 1, 0.05, speechSettings.openAiVolumes.zh)}
              ${rangeSlider('openai-volume-ja', '日文', 0, 1, 0.05, speechSettings.openAiVolumes.ja)}
            </div>
          </div>
          <button type="submit" class="btn btn-primary">儲存語速、聲調與音量</button>
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
      triggerRender()
      toast('已更新聲音服務狀態')
    })
  })

  byId<HTMLButtonElement>('testSpeechBtn').addEventListener('click', () => {
    void testSpeech()
  })

  byId<HTMLButtonElement>('previewVoiceEnBtn').addEventListener('click', () => {
    void previewBrowserVoice('en', byId<HTMLSelectElement>('voice-en').value)
  })
  byId<HTMLButtonElement>('previewVoiceZhBtn').addEventListener('click', () => {
    void previewBrowserVoice('zh', byId<HTMLSelectElement>('voice-zh').value)
  })
  byId<HTMLButtonElement>('previewVoiceJaBtn').addEventListener('click', () => {
    void previewBrowserVoice('ja', byId<HTMLSelectElement>('voice-ja').value)
  })

  byId<HTMLFormElement>('browserVoiceForm').addEventListener('submit', (event) => {
    event.preventDefault()
    setSpeechSettings({
      ...speechSettings,
      browserVoices: {
        en: byId<HTMLSelectElement>('voice-en').value,
        zh: byId<HTMLSelectElement>('voice-zh').value,
        ja: byId<HTMLSelectElement>('voice-ja').value
      }
    })
    schedulePersist()
    toast('已儲存瀏覽器聲音')
  })

  // Live update range slider value displays
  panel.querySelectorAll<HTMLInputElement>('.field-range').forEach((range) => {
    range.addEventListener('input', () => {
      const valEl = document.getElementById(`${range.id}-val`)
      if (valEl) valEl.textContent = range.value
    })
  })

  byId<HTMLFormElement>('speechRateForm').addEventListener('submit', (event) => {
    event.preventDefault()
    setSpeechSettings({
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
    })
    schedulePersist()
    toast('已儲存語速、聲調與音量')
  })
}

function rangeSlider(id: string, label: string, min: number, max: number, step: number, value: number): string {
  return `
    <div class="field-group">
      <label class="field-label">${escapeHtml(label)} <span class="range-value" id="${id}-val">${value}</span></label>
      <input id="${id}" class="field-range" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
    </div>`
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

  setSpeechSettings({
    ...speechSettings,
    engine: engine === 'openai' ? 'openai' : 'browser',
    openAiVoice
  })

  schedulePersist()
  triggerRender()
  toast(`已套用朗讀引擎：${engine === 'openai' ? 'OpenAI TTS' : '瀏覽器內建'}`)
}
