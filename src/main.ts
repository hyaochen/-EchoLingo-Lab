import './style.css'
import { registerRender } from './renderBus'
import { token, authUser, activeTab, applyTheme, clearAuth, setAuthUser } from './state'
import { fetchMe, loadProviderStatus, loadUserData, loadAdminUsers, loadBackups } from './auth'
import { initSpeechVoices } from './speech'
import { setLocalSeedFallback } from './data'
import { renderLoginView } from './ui/login'
import { renderAppShell } from './ui/layout'
import { renderEnglishTab } from './ui/english'
import { renderJapaneseTab } from './ui/japanese'
import { renderContentTab } from './ui/content'
import { renderSpeechTab } from './ui/speech-settings'
import { renderAdminTab } from './ui/admin'

const appEl = document.querySelector<HTMLDivElement>('#app')
if (!appEl) throw new Error('App root #app not found')

registerRender(render)
initSpeechVoices()
applyTheme()
void bootstrap()

function render(): void {
  if (!authUser) {
    renderLoginView(appEl!)
    return
  }

  renderAppShell(appEl!)

  if (activeTab === 'english') renderEnglishTab()
  else if (activeTab === 'japanese') renderJapaneseTab()
  else if (activeTab === 'content') renderContentTab()
  else if (activeTab === 'speech') renderSpeechTab()
  else if (activeTab === 'admin') renderAdminTab()
}

async function bootstrap(): Promise<void> {
  if (!token) {
    setLocalSeedFallback()
    render()
    return
  }

  const me = await fetchMe()
  if (!me) {
    clearAuth()
    setLocalSeedFallback()
    render()
    return
  }

  setAuthUser(me)
  await Promise.all([loadProviderStatus(), loadUserData()])

  if (authUser?.role === 'admin') {
    await Promise.all([loadAdminUsers(), loadBackups()])
  }

  render()
}
