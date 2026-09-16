import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Production is served at https://51.21.60.78.sslip.io/admin/
// so networks that time out on admin.IP.sslip.io still work.
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
