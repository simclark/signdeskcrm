/** Shared pdf.js setup — worker served as .js so nginx MIME never blocks it. */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// Copied into public/ during Vite build (see vite.config.ts). Prefer .js over
// the hashed /assets/*.mjs worker so Content-Type is always text/javascript.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

export { pdfjs }
