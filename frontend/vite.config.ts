import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Keep pdf.js out of the dep optimizer so the worker URL resolves correctly.
    exclude: ['pdfjs-dist'],
  },
  server: {
    host: true,
    port: 5173,
    // Allow tenant subdomains on the local BASE_DOMAIN (*.signdeskcrm.test).
    allowedHosts: ['.signdeskcrm.test', '.localhost'],
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
