import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Admin is served at https://admin.miniplagg.com/ (site root).
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'https://miniplagg.com',
      '/files': 'https://miniplagg.com',
    },
  },
})
