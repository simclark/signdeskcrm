/** Prefer same-origin /media paths so Vite can proxy them in development. */
export function toAppMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname.startsWith('/media/')) {
      return `${parsed.pathname}${parsed.search}`
    }
  } catch {
    /* keep original */
  }
  return url
}
