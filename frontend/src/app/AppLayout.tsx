import { AppShell, Burger, Group, NavLink, Text, Button, Avatar, Menu } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconLayoutDashboard,
  IconUsers,
  IconFileText,
  IconSend,
  IconSettings,
  IconBuilding,
  IconLogout,
  IconTemplate,
} from '@tabler/icons-react'
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const links = [
  { to: '/app', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/app/envelopes', label: 'Envelopes', icon: IconSend },
  { to: '/app/documents', label: 'Documents', icon: IconFileText },
  { to: '/app/templates', label: 'Templates', icon: IconTemplate },
  { to: '/app/contacts', label: 'Contacts', icon: IconUsers },
  { to: '/app/companies', label: 'Companies', icon: IconBuilding },
  { to: '/app/settings', label: 'Settings', icon: IconSettings },
]

export function AppLayout() {
  const [opened, { toggle }] = useDisclosure()
  const { user, tenant, loading, logout } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user || !tenant) return <Navigate to="/login" replace />

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header
        style={{
          borderBottom: '1px solid rgba(16,42,35,0.08)',
          background: 'rgba(247,245,240,0.9)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text
              fw={700}
              style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22 }}
            >
              SignDesk
            </Text>
            <Text c="dimmed" size="sm">
              {tenant.name}
            </Text>
          </Group>
          <Group>
            <Button component={Link} to="/app/envelopes/new" variant="filled">
              Send for signature
            </Button>
            <Menu>
              <Menu.Target>
                <Avatar radius="xl" color="forest" style={{ cursor: 'pointer' }}>
                  {user.full_name.slice(0, 1).toUpperCase()}
                </Avatar>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={logout}>
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" style={{ background: 'transparent' }}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            component={Link}
            to={link.to}
            label={link.label}
            leftSection={<link.icon size={18} />}
            active={
              location.pathname === link.to ||
              (link.to !== '/app' && location.pathname.startsWith(link.to))
            }
            mb={4}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
