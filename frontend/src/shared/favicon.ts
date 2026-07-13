const DEFAULT_FAVICON = '/vite.svg'

/** Update the document favicon; restores the default when url is null. */
export function setDocumentFavicon(url: string | null | undefined) {
  const href = url || DEFAULT_FAVICON
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  if (link.getAttribute('href') !== href) {
    link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
    link.href = href
  }
}
