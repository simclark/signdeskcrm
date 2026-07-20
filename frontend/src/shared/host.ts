/** Local default matches BASE_DOMAIN; override in production builds. */
export const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN as string) || 'signdeskcrm.test'

/** Reserved subdomain for SignDesk ops console (not a tenant workspace). */
export const PLATFORM_SUBDOMAIN = 'platform'

export function getHostPort(): string {
  return window.location.port ? `:${window.location.port}` : ''
}

export function platformOrigin(): string {
  return `${window.location.protocol}//${PLATFORM_SUBDOMAIN}.${BASE_DOMAIN}${getHostPort()}`
}

export function platformUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${platformOrigin()}${normalized}`
}

export function isPlatformHost(): boolean {
  const host = window.location.hostname.toLowerCase()
  return host === `${PLATFORM_SUBDOMAIN}.${BASE_DOMAIN}`
}

export function getTenantSlug(): string | null {
  const host = window.location.hostname.toLowerCase()
  if (
    host === BASE_DOMAIN ||
    host === `www.${BASE_DOMAIN}` ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === `${PLATFORM_SUBDOMAIN}.${BASE_DOMAIN}`
  ) {
    return null
  }
  const suffix = `.${BASE_DOMAIN}`
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length)
    if (!sub || sub.includes('.')) return null
    if (sub === PLATFORM_SUBDOMAIN) return null
    return sub
  }
  // Fallback for alternate apex domains (e.g. production when env differs).
  const parts = host.split('.')
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== PLATFORM_SUBDOMAIN) {
    return parts[0]
  }
  return null
}

export function isApexHost(): boolean {
  return !getTenantSlug() && !isPlatformHost()
}
