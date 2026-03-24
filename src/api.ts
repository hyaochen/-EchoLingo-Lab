import { token, clearAuth } from './state'
import { triggerRender } from './renderBus'
import { toast } from './utils'

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, {
    ...init,
    headers
  })

  if (response.status === 401 && token) {
    clearAuth()
    triggerRender()
    toast('登入已過期，請重新登入')
  }

  return response
}

export async function safeReadText(response: Response): Promise<string> {
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
