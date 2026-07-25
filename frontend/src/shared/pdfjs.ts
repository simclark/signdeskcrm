/**
 * Shared pdf.js setup.
 *
 * Use Vite's `?worker` so the worker is constructed by the bundler instead of
 * fetching a standalone .mjs URL (nginx/Alpine often serves those as
 * application/octet-stream, which browsers reject for module workers).
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

export { pdfjs }
