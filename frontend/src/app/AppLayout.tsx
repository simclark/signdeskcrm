import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  Text,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import {
  IconBuilding,
  IconFileText,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconSend,
  IconSettings,
  IconTemplate,
  IconUsers,
} from '@tabler/icons-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { CreateEnvelopeProvider, useCreateEnvelope } from '../features/envelopes/CreateEnvelopeContext'

const NAV_EXPANDED = 260
const NAV_COLLAPSED = 76

const links = [
  { to: '/app', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/app/envelopes', label: 'Envelopes', icon: IconSend },
  { to: '/app/documents', label: 'Documents', icon: IconFileText },
  { to: '/app/templates', label: 'Templates', icon: IconTemplate },
  { to: '/app/contacts', label: 'Contacts', icon: IconUsers },
  { to: '/app/companies', label: 'Companies', icon: IconBuilding },
  { to: '/app/settings', label: 'Settings', icon: IconSettings },
]

function AppShellContent() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure()
  const [desktopCollapsed, setDesktopCollapsed] = useLocalStorage({
    key: 'sd-nav-collapsed',
    defaultValue: false,
  })
  const { user, tenant, logout } = useAuth()
  const location = useLocation()
  const { openCreateEnvelope } = useCreateEnvelope()

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: desktopCollapsed ? NAV_COLLAPSED : NAV_EXPANDED,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
      transitionDuration={200}
      transitionTimingFunction="ease"
    >
      <AppShell.Header
        style={{
          borderBottom: '1px solid rgba(16,42,35,0.08)',
          background: 'rgba(247,245,240,0.9)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Tooltip
              label={desktopCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              position="bottom"
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                visibleFrom="sm"
                onClick={() => setDesktopCollapsed((value) => !value)}
                aria-label={desktopCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {desktopCollapsed ? (
                  <IconLayoutSidebarLeftExpand size={18} stroke={1.5} />
                ) : (
                  <IconLayoutSidebarLeftCollapse size={18} stroke={1.5} />
                )}
              </ActionIcon>
            </Tooltip>
            <Text fw={700} style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22 }}>
              SignDesk
            </Text>
            <Text c="dimmed" size="sm" visibleFrom="sm">
              {tenant!.name}
            </Text>
          </Group>
          <Group>
            <Button variant="filled" onClick={() => openCreateEnvelope()}>
              Send for signature
            </Button>
            <Menu>
              <Menu.Target>
                <Avatar radius="xl" color="forest" style={{ cursor: 'pointer' }}>
                  {user!.full_name.slice(0, 1).toUpperCase()}
                </Avatar>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user!.email}</Menu.Label>
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={logout}>
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p={desktopCollapsed ? 'sm' : 'md'}
        style={{ background: 'transparent' }}
        className={desktopCollapsed ? 'sd-nav-collapsed' : undefined}
      >
        {links.map((link) => {
          const active =
            location.pathname === link.to ||
            (link.to !== '/app' && location.pathname.startsWith(link.to))

          const item = (
            <NavLink
              component={Link}
              to={link.to}
              label={desktopCollapsed ? undefined : link.label}
              leftSection={<link.icon size={20} stroke={1.5} />}
              active={active}
              mb={4}
              aria-label={link.label}
              styles={
                desktopCollapsed
                  ? {
                      root: {
                        padding: '10px',
                        justifyContent: 'center',
                        borderRadius: 10,
                      },
                      section: { marginInlineEnd: 0 },
                    }
                  : undefined
              }
            />
          )

          if (!desktopCollapsed) {
            return <div key={link.to}>{item}</div>
          }

          return (
            <Tooltip key={link.to} label={link.label} position="right" withArrow offset={10}>
              {item}
            </Tooltip>
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}

export function AppLayout() {
  const { user, tenant, loading } = useAuth()

  if (loading) return null
  if (!user || !tenant) return <Navigate to="/login" replace />

  return (
    <CreateEnvelopeProvider>
      <AppShellContent />
    </CreateEnvelopeProvider>
  )
}
