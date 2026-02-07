import 'dotenv/config'
import { defineConfig } from 'vite'

const apiPort = Number(process.env.API_PORT ?? 8787)
const defaultAllowedHosts = ['lingo.hongjixuan-market-ledger.com']
const extraAllowedHosts = String(process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter((host) => host.length > 0)
const allowedHosts = Array.from(new Set([...defaultAllowedHosts, ...extraAllowedHosts]))

export default defineConfig({
  server: {
    allowedHosts,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      }
    }
  }
})
