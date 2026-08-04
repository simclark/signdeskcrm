import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  api,
  clearTokens,
  getTokens,
  isPlatformHost,
  setTokens,
  getTenantSlug,
  TRIAL_EXPIRED_EVENT,
} from '../../shared/api'

export type Entitlement = {
  subscription_status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired' | string
  trial_ends_at: string | null
  is_write_locked: boolean
  days_remaining: number | null
  support_email?: string
  billing_portal_available?: boolean
}

type User = {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  is_staff?: boolean
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
  subscription_status?: string
  trial_ends_at?: string | null
  entitlement?: Entitlement
}

type Membership = {
  id: number
  role: string
}

type AuthState = {
  user: User | null
  tenant: Tenant | null
  membership: Membership | null
  entitlement: Entitlement | null
  loading: boolean
  isStaff: boolean
  isWriteLocked: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = async () => {
    if (!getTokens().access) {
      setUser(null)
      setTenant(null)
      setMembership(null)
      return
    }

    if (isPlatformHost()) {
      const data = await api<{ user: User }>('/api/platform/me/')
      setUser(data.user)
      setTenant(null)
      setMembership(null)
      return
    }

    if (!getTenantSlug()) {
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

  useEffect(() => {
    const onTrialExpired = () => {
      void refreshMe().catch(() => undefined)
    }
    window.addEventListener(TRIAL_EXPIRED_EVENT, onTrialExpired)
    return () => window.removeEventListener(TRIAL_EXPIRED_EVENT, onTrialExpired)
  }, [])

  const entitlement = tenant?.entitlement ?? null
  const isWriteLocked = Boolean(entitlement?.is_write_locked)

  const value = useMemo<AuthState>(
    () => ({
      user,
      tenant,
      membership,
      entitlement,
      loading,
      isStaff: Boolean(user?.is_staff),
      isWriteLocked,
      refreshMe,
      logout: async () => {
        const { refresh } = getTokens()
        try {
          if (refresh) {
            await api('/api/auth/logout/', {
              method: 'POST',
              json: { refresh },
              public: true,
            })
          }
        } catch {
          // Client still clears tokens even if blacklist fails.
        }
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
        if (isPlatformHost()) {
          if (!data.user.is_staff) {
            clearTokens()
            throw new Error('Staff access required for the platform console.')
          }
          setUser(data.user)
          setTenant(null)
          setMembership(null)
          return
        }
        await refreshMe()
      },
    }),
    [user, tenant, membership, entitlement, loading, isWriteLocked],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth requires AuthProvider')
  return ctx
}
