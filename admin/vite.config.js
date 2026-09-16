import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Always under /admin/ so deep SPA routes resolve assets correctly.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/admin/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'https://51.21.60.78.sslip.io',
      '/files': 'https://51.21.60.78.sslip.io',
    },
  },
}))
