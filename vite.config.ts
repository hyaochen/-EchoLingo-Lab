import 'dotenv/config'
import { defineConfig, type PluginOption } from 'vite'

const apiPort = Number(process.env.API_PORT ?? 8787)
const defaultAllowedHosts = ['lingo.hongjixuan-market-ledger.com']
const extraAllowedHosts = String(process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter((host) => host.length > 0)
const allowedHosts = Array.from(new Set([...defaultAllowedHosts, ...extraAllowedHosts]))

const apiProxy = {
  '/api': {
    target: `http://localhost:${apiPort}`,
    changeOrigin: true
  }
}

const blockedPathPattern = /^\/(@vite|@id|@fs|@react-refresh|__open-in-editor|__inspect|__vite|node_modules|src|server|\.env|tsconfig|vite\.config|package(-lock)?\.json|Dockerfile)(\/|$|\?|\.)/i

const blockDevPaths: PluginOption = {
  name: 'block-dev-paths',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? ''
      if (blockedPathPattern.test(url)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Not Found')
        return
      }
      next()
    })
  }
}

export default defineConfig({
  plugins: [blockDevPaths],
  server: {
    allowedHosts,
    proxy: apiProxy
  },
  preview: {
    allowedHosts,
    proxy: apiProxy
  }
})
