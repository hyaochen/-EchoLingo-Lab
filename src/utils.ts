export function byId<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Element #${id} not found`)
  return element as TElement
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function formatTime(iso: string): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return iso

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export function toast(message: string): void {
  const current = document.querySelector<HTMLDivElement>('.toast')
  if (current) current.remove()

  const toastEl = document.createElement('div')
  toastEl.className = 'toast'
  toastEl.textContent = message
  document.body.appendChild(toastEl)

  setTimeout(() => {
    toastEl.remove()
  }, 1800)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function escapeHtmlAttr(value: string): string {
  return escapeHtml(value)
}

export function encodeForAttr(value: string): string {
  return btoa(encodeURIComponent(value))
}

export function decodeFromAttr(value: string): string {
  return decodeURIComponent(atob(value))
}

export function extractFileName(contentDisposition: string): string | null {
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)
  if (!match || !match[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
