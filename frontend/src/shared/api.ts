const ACCESS_KEY = 'sd_access'
const REFRESH_KEY = 'sd_refresh'

/** Local default matches BASE_DOMAIN; override in production builds. */
export const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN as string) || 'signdeskcrm.test'

export function getTenantSlug(): string | null {
  const host = window.location.hostname.toLowerCase()
  if (
    host === BASE_DOMAIN ||
    host === `www.${BASE_DOMAIN}` ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return null
  }
  const suffix = `.${BASE_DOMAIN}`
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length)
    if (!sub || sub.includes('.')) return null
    return sub
  }
  // Fallback for alternate apex domains (e.g. production when env differs).
  const parts = host.split('.')
  if (parts.length >= 3 && parts[0] !== 'www') {
    return parts[0]
  }
  return null
}

export function isApexHost(): boolean {
  return !getTenantSlug()
}

export function getTokens() {
  return {
    access: localStorage.getItem(ACCESS_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  }
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export class ApiError extends Error {
  status: number
  data: unknown
  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown; formData?: FormData; public?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {})
  const slug = getTenantSlug()
  if (slug) headers.set('X-Tenant-Slug', slug)

  const { access } = getTokens()
  if (access && !options.public) headers.set('Authorization', `Bearer ${access}`)

  let body = options.body
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.json)
  }
  if (options.formData) {
    body = options.formData
  }

  const res = await fetch(path, { ...options, headers, body })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new ApiError(data?.detail || 'Request failed', res.status, data)
  }
  return data as T
}
