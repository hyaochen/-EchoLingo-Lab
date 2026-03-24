// Simple bus to trigger re-renders from any module without circular deps.
type RenderFn = () => void

let _renderFn: RenderFn | null = null

export function registerRender(fn: RenderFn): void {
  _renderFn = fn
}

export function triggerRender(): void {
  _renderFn?.()
}
