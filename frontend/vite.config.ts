import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = dirname(fileURLToPath(import.meta.url))

/** Serve pdf.js worker as .js so production nginx MIME types always accept it. */
function copyPdfWorker(): Plugin {
  const src = resolve(
    rootDir,
    'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  )
  const dest = resolve(rootDir, 'public/pdf.worker.min.js')

  const copy = () => {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }

  return {
    name: 'copy-pdf-worker',
    buildStart: copy,
    configureServer() {
      copy()
    },
  }
}

export default defineConfig({
  plugins: [react(), copyPdfWorker()],
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
