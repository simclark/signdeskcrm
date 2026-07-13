const ACCESS_KEY = 'sd_access'
const REFRESH_KEY = 'sd_refresh'

export function getTenantSlug(): string | null {
  const host = window.location.hostname
  if (host.endsWith('.localhost')) {
    return host.replace('.localhost', '')
  }
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
