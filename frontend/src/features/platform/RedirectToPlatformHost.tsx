import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Text } from '@mantine/core'
import { platformUrl } from '../../shared/host'

/** Apex `/platform/*` bookmarks → `platform.{BASE_DOMAIN}` (tokens are origin-scoped). */
export function RedirectToPlatformHost() {
  const location = useLocation()

  useEffect(() => {
    const rest = location.pathname.replace(/^\/platform/, '') || '/'
    const target = platformUrl(`${rest}${location.search}${location.hash}`)
    window.location.replace(target)
  }, [location.pathname, location.search, location.hash])

  return (
    <Text c="dimmed" p="xl">
      Redirecting to platform…
    </Text>
  )
}
