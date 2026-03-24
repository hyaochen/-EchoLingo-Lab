import type { AuthUser, ProviderStatus, AdminUserSummary, BackupFile } from './types'
import {
  token, authUser,
  setToken, setAuthUser, setProviderStatus, setAdminUsers, setBackupFiles,
  clearAuth, AUTH_TOKEN_KEY
} from './state'
import { apiFetch, safeReadText } from './api'
import {
  normalizeEnglishWords, normalizeJapaneseSentences, sanitizeSpeechSettings,
  setLocalSeedFallback, persistUserData
} from './data'
import {
  setEnglishWords, setJapaneseSentences, setSpeechSettings, setThemeMode
} from './state'
import { applyTheme } from './state'
import { toast } from './utils'
import { triggerRender } from './renderBus'
import type { UserDataPayload } from './types'
import { stopAllPlayback } from './review'

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const response = await apiFetch('/api/auth/me')
    if (!response.ok) return null
    return (await response.json()) as AuthUser
  } catch {
    return null
  }
}

export async function loadProviderStatus(): Promise<void> {
  try {
    const response = await apiFetch('/api/providers')
    if (!response.ok) return
    setProviderStatus((await response.json()) as ProviderStatus)
  } catch {
    setProviderStatus({ tts: { browser: true, openai: false }, news: { rss: true, newsapi: false } })
  }
}

export async function loadUserData(): Promise<void> {
  try {
    const response = await apiFetch('/api/user/data')
    if (!response.ok) throw new Error('load user data failed')

    const payload = (await response.json()) as { data: UserDataPayload }
    setEnglishWords(normalizeEnglishWords(payload.data.englishWords))
    setJapaneseSentences(normalizeJapaneseSentences(payload.data.japaneseSentences))
    setSpeechSettings(sanitizeSpeechSettings(payload.data.speechSettings))
    setThemeMode(payload.data.theme === 'dark' ? 'dark' : 'light')

    applyTheme()
  } catch {
    setLocalSeedFallback()
  }
}

export async function loadAdminUsers(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/users')
  if (!response.ok) return

  const payload = (await response.json()) as { users: AdminUserSummary[] }
  setAdminUsers(payload.users)
}

export async function loadBackups(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/backups')
  if (!response.ok) return

  const payload = (await response.json()) as { files: BackupFile[] }
  setBackupFiles(payload.files)
}

export async function login(account: string, password: string): Promise<void> {
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
    setToken(payload.token)
    localStorage.setItem(AUTH_TOKEN_KEY, payload.token)
    setAuthUser(payload.user)

    await Promise.all([loadProviderStatus(), loadUserData()])

    if (payload.user.role === 'admin') {
      await Promise.all([loadAdminUsers(), loadBackups()])
    }

    triggerRender()
  } catch {
    toast('登入失敗，請確認後端已啟動')
  }
}

export async function logout(): Promise<void> {
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
  triggerRender()
}

export async function refreshProviderByAdmin(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/providers/refresh', { method: 'POST' })
  if (!response.ok) {
    toast('更新 API 狀態失敗')
    return
  }

  setProviderStatus((await response.json()) as ProviderStatus)
  triggerRender()
  toast('已更新 API 狀態')
}

export async function adminCreateUser(account: string, password: string, name: string, role: string): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

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
  triggerRender()
  toast('已新增使用者')
}

export async function adminDeleteUser(account: string): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(account)}`, { method: 'DELETE' })
  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`刪除失敗：${errorText}`)
    return
  }

  await loadAdminUsers()
  triggerRender()
  toast('已刪除使用者')
}

export async function adminChangeUserPassword(account: string, password: string): Promise<void> {
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
  triggerRender()
  toast(`已更新 ${account} 密碼`)
}

export async function adminSetUserStatus(account: string, active: boolean): Promise<void> {
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
  triggerRender()
  toast(`${account} 已${active ? '啟用' : '停用'}`)
}

export async function triggerManualBackup(): Promise<void> {
  if (!authUser || authUser.role !== 'admin') return

  const response = await apiFetch('/api/admin/backup', { method: 'POST' })
  if (!response.ok) {
    toast('建立備份失敗')
    return
  }

  await loadBackups()
  triggerRender()
  toast('已建立備份')
}

export async function exportUserData(): Promise<void> {
  const response = await apiFetch('/api/user/export')
  if (!response.ok) {
    const errorText = await safeReadText(response)
    toast(`匯出失敗：${errorText}`)
    return
  }

  const blob = await response.blob()
  const contentDisposition = response.headers.get('content-disposition') ?? ''
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)
  let fileName = match?.[1] ? decodeURIComponent(match[1]) : `lingua-user-export-${new Date().toISOString().slice(0, 10)}.json`
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

export async function importUserData(file: File): Promise<void> {
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

    await loadUserData()
    triggerRender()
    toast('已匯入個人學習資料')
  } catch {
    toast('匯入失敗，請確認是有效 JSON')
  }
}
