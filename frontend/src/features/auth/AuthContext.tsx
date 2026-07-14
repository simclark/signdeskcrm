import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearTokens, getTokens, setTokens, getTenantSlug } from '../../shared/api'

type User = {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
}

type Tenant = {
  id: number
  name: string
  slug: string
  legal_name: string
  website: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  primary_contact_name: string
  primary_contact_email: string
  primary_contact_phone: string
  accent_color: string
  timezone: string
  default_expiration_days: number
  logo: string | null
  icon: string | null
  reminders_enabled: boolean
  reminder_interval_hours: number
  reminder_max_count: number
  document_retention_days: number | null
  sender_support_email: string
  sender_support_phone: string
  paper_copy_fee_policy: string
  esign_acknowledgement: string
  esign_acknowledgement_version: string
  listings_enabled: boolean
}

type Membership = {
  id: number
  role: string
}

type AuthState = {
  user: User | null
  tenant: Tenant | null
  membership: Membership | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = async () => {
    if (!getTenantSlug() || !getTokens().access) {
      setUser(null)
      setTenant(null)
      setMembership(null)
      return
    }
    const data = await api<{ user: User; tenant: Tenant; membership: Membership }>(
      '/api/tenant/me/',
    )
    setUser(data.user)
    setTenant(data.tenant)
    setMembership(data.membership)
  }

  useEffect(() => {
    refreshMe()
      .catch(() => {
        clearTokens()
        setUser(null)
        setTenant(null)
        setMembership(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      tenant,
      membership,
      loading,
      refreshMe,
      logout: () => {
        clearTokens()
        setUser(null)
        setTenant(null)
        setMembership(null)
      },
      login: async (email, password) => {
        const data = await api<{
          access: string
          refresh: string
          user: User
        }>('/api/auth/login/', { method: 'POST', json: { email, password } })
        setTokens(data.access, data.refresh)
        await refreshMe()
      },
    }),
    [user, tenant, membership, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth requires AuthProvider')
  return ctx
}
