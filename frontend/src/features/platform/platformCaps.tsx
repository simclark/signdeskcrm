import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'

export type PlatformCapability =
  | 'read'
  | 'support'
  | 'operate'
  | 'billing'
  | 'admin'

type PlatformMe = {
  user: {
    id: number
    email: string
    platform_role: string
    capabilities: PlatformCapability[]
    is_staff: boolean
  }
}

type Ctx = {
  role: string | null
  capabilities: Set<PlatformCapability>
  can: (cap: PlatformCapability) => boolean
  loading: boolean
}

const PlatformCapsContext = createContext<Ctx>({
  role: null,
  capabilities: new Set(),
  can: () => false,
  loading: true,
})

export function PlatformCapsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-me'],
    queryFn: () => api<PlatformMe>('/api/platform/me/'),
    retry: false,
  })

  const value = useMemo<Ctx>(() => {
    const caps = new Set<PlatformCapability>(
      (data?.user.capabilities || []) as PlatformCapability[],
    )
    return {
      role: data?.user.platform_role || null,
      capabilities: caps,
      can: (cap) => caps.has(cap),
      loading: isLoading,
    }
  }, [data, isLoading])

  return (
    <PlatformCapsContext.Provider value={value}>{children}</PlatformCapsContext.Provider>
  )
}

export function usePlatformCaps() {
  return useContext(PlatformCapsContext)
}
