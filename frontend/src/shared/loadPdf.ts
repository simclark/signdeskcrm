import { fetchAuthed } from './api'
import { toAppMediaUrl } from './mediaUrl'
import { pdfjs } from './pdfjs'

/** Load a PDF via auth-aware fetch (for /api/media/) or public fetch (signing links). */
export async function loadPdfDocument(
  fileUrl: string | null | undefined,
): Promise<pdfjs.PDFDocumentProxy> {
  const resolved = toAppMediaUrl(fileUrl)
  if (!resolved) {
    throw new Error('Missing PDF URL')
  }

  const needsAuth = resolved.startsWith('/api/media/')
  const res = needsAuth ? await fetchAuthed(resolved) : await fetch(resolved)
  if (!res.ok) {
    throw new Error(`Failed to load PDF (${res.status})`)
  }
  const data = await res.arrayBuffer()
  return pdfjs.getDocument({ data }).promise
}

export async function downloadMediaFile(
  fileUrl: string | null | undefined,
  downloadFileName: string,
): Promise<void> {
  const resolved = toAppMediaUrl(fileUrl)
  if (!resolved) return
  const needsAuth = resolved.startsWith('/api/media/')
  const res = needsAuth ? await fetchAuthed(resolved) : await fetch(resolved)
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = downloadFileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
