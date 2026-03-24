import { authUser, activeTab, themeMode, setActiveTab, setThemeMode } from '../state'
import { applyTheme } from '../state'
import { escapeHtml, byId } from '../utils'
import { schedulePersist } from '../data'
import { stopAllPlayback } from '../review'
import { logout } from '../auth'
import { triggerRender } from '../renderBus'
import { toast } from '../utils'

export function renderAppShell(appEl: HTMLElement): void {
  const isAdmin = authUser?.role === 'admin'

  const navItems = [
    { id: 'english', label: '英文單字', icon: '📚' },
    { id: 'japanese', label: '日文句子', icon: '🇯🇵' },
    { id: 'content', label: '內容工坊', icon: '📰' },
    { id: 'speech', label: '聲音設定', icon: '🔊' },
    ...(isAdmin ? [{ id: 'admin', label: '後台管理', icon: '⚙️' }] : [])
  ]

  appEl.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-logo-icon">🎧</span>
          <span class="sidebar-logo-text">EchoLingo</span>
        </div>

        <nav class="sidebar-nav" aria-label="主功能">
          ${navItems.map((item) => `
            <button
              class="sidebar-nav-item ${activeTab === item.id ? 'is-active' : ''}"
              data-tab="${item.id}"
            >
              <span class="nav-item-icon">${item.icon}</span>
              <span class="nav-item-label">${item.label}</span>
            </button>
          `).join('')}
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <span class="user-avatar">${escapeHtml((authUser?.name ?? '?').charAt(0).toUpperCase())}</span>
            <div class="user-details">
              <p class="user-name">${escapeHtml(authUser?.name ?? '')}</p>
              <p class="user-role">${authUser?.role === 'admin' ? '管理員' : '一般使用者'}</p>
            </div>
          </div>
          <div class="sidebar-actions">
            <button id="themeToggleBtn" class="icon-btn" title="${themeMode === 'dark' ? '切換淺色' : '切換深色'}">
              ${themeMode === 'dark' ? '☀️' : '🌙'}
            </button>
            <button id="stopSpeechBtn" class="icon-btn" title="停止朗讀">⏹</button>
            <button id="logoutBtn" class="icon-btn icon-btn-danger" title="登出">↩</button>
          </div>
        </div>
      </aside>

      <main class="main-content" id="main-content">
        <section id="tab-english" class="tab-panel ${activeTab === 'english' ? 'is-active' : ''}"></section>
        <section id="tab-japanese" class="tab-panel ${activeTab === 'japanese' ? 'is-active' : ''}"></section>
        <section id="tab-content" class="tab-panel ${activeTab === 'content' ? 'is-active' : ''}"></section>
        <section id="tab-speech" class="tab-panel ${activeTab === 'speech' ? 'is-active' : ''}"></section>
        ${isAdmin ? `<section id="tab-admin" class="tab-panel ${activeTab === 'admin' ? 'is-active' : ''}"></section>` : ''}
      </main>

      <nav class="bottom-nav" aria-label="底部導覽">
        ${navItems.map((item) => `
          <button class="bottom-nav-item ${activeTab === item.id ? 'is-active' : ''}" data-tab="${item.id}">
            <span class="nav-item-icon">${item.icon}</span>
            <span class="nav-item-label">${item.label}</span>
          </button>
        `).join('')}
      </nav>
    </div>
  `

  // Tab navigation
  appEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab as typeof activeTab)
      triggerRender()
    })
  })

  // Theme toggle
  byId<HTMLButtonElement>('themeToggleBtn').addEventListener('click', () => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light')
    applyTheme()
    schedulePersist()
    triggerRender()
  })

  // Stop speech
  byId<HTMLButtonElement>('stopSpeechBtn').addEventListener('click', () => {
    stopAllPlayback(true)
    toast('已停止朗讀')
  })

  // Logout
  byId<HTMLButtonElement>('logoutBtn').addEventListener('click', () => {
    void logout()
  })
}
