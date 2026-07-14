import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Button,
  Group,
  Image,
  Menu,
  NavLink,
  Text,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import {
  IconBuilding,
  IconCalendarDue,
  IconFileText,
  IconHome,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconRepeat,
  IconSend,
  IconSettings,
  IconTemplate,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { toAppMediaUrl } from '../shared/mediaUrl'
import { setDocumentFavicon } from '../shared/favicon'
import { useAuth } from '../features/auth/AuthContext'
import { ProfileDialog } from '../features/auth/ProfileDialog'
import { CreateEnvelopeProvider, useCreateEnvelope } from '../features/envelopes/CreateEnvelopeContext'

const NAV_EXPANDED = 260
const NAV_COLLAPSED = 76

type NavItem = {
  to: string
  label: string
  icon: typeof IconLayoutDashboard
  children?: { to: string; label: string }[]
}

/** Shared workspace navigation for every member. */
const MEMBER_LINKS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/app/envelopes', label: 'Envelopes', icon: IconSend },
  { to: '/app/documents', label: 'Documents', icon: IconFileText },
  { to: '/app/templates', label: 'Templates', icon: IconTemplate },
  { to: '/app/listings', label: 'Listings', icon: IconHome },
  { to: '/app/contacts', label: 'Contacts', icon: IconUsers },
  { to: '/app/companies', label: 'Companies', icon: IconBuilding },
  { to: '/app/follow-ups', label: 'Follow-ups', icon: IconCalendarDue },
  { to: '/app/cadences', label: 'Cadences', icon: IconRepeat },
]

/** Extra navigation only for tenant owners and admins. */
const ADMIN_LINKS: NavItem[] = [
  { to: '/app/administration/settings', label: 'Settings', icon: IconSettings },
]

function isPathActive(pathname: string, to: string) {
  return pathname === to || (to !== '/app' && pathname.startsWith(to))
}

function AppShellContent() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure()
  const [profileOpened, { open: openProfile, close: closeProfile }] = useDisclosure()
  const [desktopCollapsed, setDesktopCollapsed] = useLocalStorage({
    key: 'sd-nav-collapsed',
    defaultValue: false,
  })
  const { user, tenant, membership, logout } = useAuth()
  const location = useLocation()
  const { openCreateEnvelope } = useCreateEnvelope()

  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'
  const iconUrl = toAppMediaUrl(tenant?.icon)
  const listingsEnabled = Boolean(tenant?.listings_enabled)

  const memberLinks = MEMBER_LINKS.filter(
    (link) => listingsEnabled || link.to !== '/app/listings',
  )

  useEffect(() => {
    setDocumentFavicon(iconUrl)
    return () => setDocumentFavicon(null)
  }, [iconUrl])

  const renderLink = (link: NavItem) => {
    const childActive = link.children?.some((child) => isPathActive(location.pathname, child.to))
    const active = isPathActive(location.pathname, link.to) || Boolean(childActive)

    if (link.children?.length && !desktopCollapsed) {
      return (
        <NavLink
          key={link.to}
          label={link.label}
          leftSection={<link.icon size={20} stroke={1.5} />}
          active={active}
          defaultOpened={active}
          mb={4}
          aria-label={link.label}
        >
          {link.children.map((child) => (
            <NavLink
              key={child.to}
              component={Link}
              to={child.to}
              label={child.label}
              leftSection={<IconSettings size={16} stroke={1.5} />}
              active={isPathActive(location.pathname, child.to)}
            />
          ))}
        </NavLink>
      )
    }

    const target = link.children?.[0]?.to || link.to
    const item = (
      <NavLink
        component={Link}
        to={target}
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
  }

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
            <Group gap="sm">
              {iconUrl ? (
                <Image src={iconUrl} alt="" w={28} h={28} radius="sm" fit="contain" />
              ) : (
                <Text fw={700} style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22 }}>
                  SignDesk
                </Text>
              )}
              <Text
                fw={iconUrl ? 600 : undefined}
                c={iconUrl ? undefined : 'dimmed'}
                size={iconUrl ? 'md' : 'sm'}
                visibleFrom="sm"
                style={
                  iconUrl ? { fontFamily: 'Fraunces, Georgia, serif', fontSize: 18 } : undefined
                }
              >
                {tenant!.name}
              </Text>
            </Group>
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
                <Menu.Label>
                  <Text size="sm" fw={600} c="dark">
                    {user!.full_name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {user!.email}
                  </Text>
                </Menu.Label>
                <Menu.Item leftSection={<IconUser size={14} />} onClick={openProfile}>
                  Profile
                </Menu.Item>
                <Menu.Divider />
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
        {desktopCollapsed && iconUrl ? (
          <Group justify="center" mb="md">
            <Image src={iconUrl} alt={tenant!.name} w={32} h={32} radius="sm" fit="contain" />
          </Group>
        ) : null}
        {memberLinks.map((link) => renderLink(link))}
        {isAdmin && (
          <>
            {!desktopCollapsed ? (
              <>
                <Text
                  size="xs"
                  c="dimmed"
                  fw={600}
                  tt="uppercase"
                  mt="md"
                  mb={6}
                  px={12}
                  style={{ letterSpacing: '0.04em' }}
                >
                  Administration
                </Text>
                {ADMIN_LINKS.map((link) => renderLink(link))}
              </>
            ) : (
              ADMIN_LINKS.map((link) => renderLink(link))
            )}
          </>
        )}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <ProfileDialog opened={profileOpened} onClose={closeProfile} />
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
