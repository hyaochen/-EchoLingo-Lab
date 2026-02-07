import 'dotenv/config'
import { defineConfig } from 'vite'

const apiPort = Number(process.env.API_PORT ?? 8787)

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      }
    }
  }
})
