import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Local dev proxies the API to production by default; point VITE_PROXY_TARGET
// at a local backend (e.g. http://127.0.0.1:8000) to develop against it.
const target = process.env.VITE_PROXY_TARGET || 'https://miniplagg.com'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': target,
      '/files': target,
    },
  },
})
