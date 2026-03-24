import { authUser, providerStatus, adminUsers, backupFiles } from '../state'
import {
  adminCreateUser, adminDeleteUser, adminChangeUserPassword, adminSetUserStatus,
  triggerManualBackup, refreshProviderByAdmin
} from '../auth'
import { byId, escapeHtml, escapeHtmlAttr, formatTime } from '../utils'

export function renderAdminTab(): void {
  const panel = byId<HTMLDivElement>('tab-admin')

  if (!authUser || authUser.role !== 'admin') {
    panel.innerHTML = '<div class="empty-state"><p>需要管理員權限</p></div>'
    return
  }

  const currentAccount = authUser.account

  panel.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">後台管理</h2>
        <p class="page-desc">管理使用者、每日備份、API 狀態</p>
      </div>
    </div>

    <div class="content-grid">
      <article class="card">
        <div class="card-header">
          <h3 class="card-title">API 狀態</h3>
        </div>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">TTS</span>
            <span class="status-badge ${providerStatus.tts.openai ? 'status-ok' : 'status-off'}">OpenAI ${providerStatus.tts.openai ? '可用' : '未設定'}</span>
            <span class="status-badge ${providerStatus.tts.browser ? 'status-ok' : 'status-off'}">Browser ${providerStatus.tts.browser ? '可用' : '不可用'}</span>
          </div>
          <div class="status-row">
            <span class="status-label">新聞</span>
            <span class="status-badge ${providerStatus.news.rss ? 'status-ok' : 'status-off'}">RSS ${providerStatus.news.rss ? '可用' : '不可用'}</span>
            <span class="status-badge ${providerStatus.news.newsapi ? 'status-ok' : 'status-off'}">NewsAPI ${providerStatus.news.newsapi ? '可用' : '未設定'}</span>
          </div>
        </div>
        <button id="refreshProviderBtn" class="btn btn-secondary" style="margin-top:.75rem">更新 API 狀態</button>
      </article>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">新增使用者</h3>
        </div>
        <form id="adminAddUserForm" class="form-stack">
          <div class="field-group">
            <label class="field-label">帳號</label>
            <input id="adminAccountInput" class="field-input" required placeholder="newuser" />
          </div>
          <div class="field-group">
            <label class="field-label">密碼</label>
            <input id="adminPasswordInput" class="field-input" required placeholder="至少 4 碼" />
          </div>
          <div class="field-group">
            <label class="field-label">名稱</label>
            <input id="adminNameInput" class="field-input" placeholder="顯示名稱" />
          </div>
          <div class="field-group">
            <label class="field-label">權限</label>
            <select id="adminRoleInput" class="field-select">
              <option value="user">一般使用者</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">新增</button>
        </form>
      </article>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">備份管理</h3>
        </div>
        <p class="muted-text">系統每天自動備份一次，也可手動備份</p>
        <button id="manualBackupBtn" class="btn btn-secondary" style="margin-top:.75rem">立即建立備份</button>
        <div class="backup-list" style="margin-top:.75rem">
          ${backupFiles.length > 0
            ? backupFiles.map((file) => `
              <div class="backup-row">
                <span class="muted-text">${escapeHtml(file.fileName)}</span>
                <span class="muted-text">${Math.round(file.size / 1024)} KB</span>
                <span class="muted-text">${escapeHtml(formatTime(file.mtime))}</span>
              </div>
            `).join('')
            : '<p class="muted-text">目前無備份紀錄</p>'
          }
        </div>
      </article>
    </div>

    <article class="card" style="margin-top:1.5rem">
      <div class="card-header">
        <h3 class="card-title">使用者清單</h3>
        <span class="muted-text">${adminUsers.length} 位使用者</span>
      </div>
      <div class="list-container" style="margin-top:.75rem">
        ${adminUsers.map((user) => `
          <article class="list-item">
            <div class="list-item-body">
              <div class="list-item-main">
                <p class="item-word">${escapeHtml(user.account)} <span class="badge">${user.role === 'admin' ? '管理員' : '一般'}</span></p>
                <p class="item-meaning">${escapeHtml(user.name)}</p>
              </div>
              <div class="item-meta">
                <span class="status-badge ${user.active ? 'status-ok' : 'status-off'}">${user.active ? '啟用' : '停用'}</span>
                <span class="muted-text">英 ${user.englishCount} · 日 ${user.japaneseCount}</span>
              </div>
              <p class="muted-text" style="font-size:0.8rem">建立 ${escapeHtml(formatTime(user.createdAt))}</p>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-secondary btn-sm" data-admin-action="change-password" data-account="${escapeHtmlAttr(user.account)}">改密碼</button>
              <button
                class="btn btn-secondary btn-sm"
                data-admin-action="toggle-status"
                data-account="${escapeHtmlAttr(user.account)}"
                data-active="${user.active ? '1' : '0'}"
                ${(user.account === 'admin' || user.account === currentAccount) ? 'disabled' : ''}
              >${user.active ? '停用' : '啟用'}</button>
              <button
                class="btn btn-danger btn-sm"
                data-admin-action="delete-user"
                data-account="${escapeHtmlAttr(user.account)}"
                ${(user.account === 'admin' || user.account === currentAccount) ? 'disabled' : ''}
              >刪除</button>
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
    const account = byId<HTMLInputElement>('adminAccountInput').value.trim()
    const password = byId<HTMLInputElement>('adminPasswordInput').value.trim()
    const name = byId<HTMLInputElement>('adminNameInput').value.trim()
    const role = byId<HTMLSelectElement>('adminRoleInput').value
    void adminCreateUser(account, password, name, role)
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
