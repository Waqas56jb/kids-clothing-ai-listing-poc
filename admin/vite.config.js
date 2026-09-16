import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'https://51.21.60.78.sslip.io',
      '/files': 'https://51.21.60.78.sslip.io',
    },
  },
})
