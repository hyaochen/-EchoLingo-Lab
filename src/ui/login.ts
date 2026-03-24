import { login } from '../auth'
import { byId } from '../utils'

export function renderLoginView(appEl: HTMLElement): void {
  appEl.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <span class="auth-logo-icon">🎧</span>
          <h1>EchoLingo Lab</h1>
        </div>
        <p class="auth-subtitle">語言學習平台</p>
        <form id="loginForm" class="auth-form">
          <div class="field-group">
            <label class="field-label" for="loginAccount">帳號</label>
            <input id="loginAccount" class="field-input" autocomplete="username" required placeholder="輸入帳號" />
          </div>
          <div class="field-group">
            <label class="field-label" for="loginPassword">密碼</label>
            <input id="loginPassword" class="field-input" type="password" autocomplete="current-password" required placeholder="輸入密碼" />
          </div>
          <button type="submit" class="btn btn-primary btn-full">登入</button>
        </form>
      </div>
    </div>
  `

  byId<HTMLFormElement>('loginForm').addEventListener('submit', (event) => {
    event.preventDefault()
    const account = byId<HTMLInputElement>('loginAccount').value.trim()
    const password = byId<HTMLInputElement>('loginPassword').value.trim()
    void login(account, password)
  })
}
