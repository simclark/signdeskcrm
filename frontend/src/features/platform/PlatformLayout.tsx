import {
  AppShell,
  Badge,
  Button,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  IconActivity,
  IconBuilding,
  IconFileSearch,
  IconHeartbeat,
  IconLogout,
  IconMail,
  IconRefresh,
  IconUsersGroup,
} from '@tabler/icons-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { isPlatformHost } from '../../shared/host'
import { RedirectToPlatformHost } from './RedirectToPlatformHost'
import { PlatformCapsProvider, usePlatformCaps } from './platformCaps'

function PlatformShell() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const { can, role } = usePlatformCaps()

  if (!isPlatformHost()) {
    return <RedirectToPlatformHost />
  }

  if (!loading && (!user || !user.is_staff)) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm' }} padding="md">
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Text fw={700} style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
              SignDesk
            </Text>
            <Text c="dimmed" size="sm">
              Platform
            </Text>
            {role ? (
              <Badge size="sm" variant="light" tt="capitalize">
                {role}
              </Badge>
            ) : null}
          </Group>
          <Group gap="sm">
            <Text size="sm" c="dimmed">
              {user?.email}
            </Text>
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<IconLogout size={16} />}
              onClick={() => {
                void logout()
              }}
            >
              Log out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs">
          <Title order={6} c="dimmed" tt="uppercase" fw={600}>
            Operations
          </Title>
          <NavLink
            component={Link}
            to="/"
            label="Tenants"
            leftSection={<IconBuilding size={18} />}
            active={location.pathname === '/' || location.pathname.startsWith('/tenants')}
          />
          <NavLink
            component={Link}
            to="/health"
            label="Health"
            leftSection={<IconHeartbeat size={18} />}
            active={location.pathname === '/health'}
          />
          <NavLink
            component={Link}
            to="/email"
            label="Email events"
            leftSection={<IconMail size={18} />}
            active={location.pathname === '/email'}
          />
          {can('operate') ? (
            <NavLink
              component={Link}
              to="/media"
              label="Media orphans"
              leftSection={<IconFileSearch size={18} />}
              active={location.pathname === '/media'}
            />
          ) : null}
          <NavLink
            component={Link}
            to="/audit"
            label="Audit log"
            leftSection={<IconActivity size={18} />}
            active={location.pathname === '/audit'}
          />
          {can('operate') ? (
            <NavLink
              component={Link}
              to="/demo"
              label="Demo workspace"
              leftSection={<IconRefresh size={18} />}
              active={location.pathname === '/demo'}
            />
          ) : null}
          {can('admin') ? (
            <>
              <Title order={6} c="dimmed" tt="uppercase" fw={600} mt="md">
                Administration
              </Title>
              <NavLink
                component={Link}
                to="/team"
                label="Team"
                leftSection={<IconUsersGroup size={18} />}
                active={location.pathname === '/team'}
              />
            </>
          ) : null}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}

export function PlatformLayout() {
  return (
    <PlatformCapsProvider>
      <PlatformShell />
    </PlatformCapsProvider>
  )
}
