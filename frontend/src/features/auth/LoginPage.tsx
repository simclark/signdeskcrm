import {
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  api,
  BASE_DOMAIN,
  getTenantSlug,
  isApexHost,
  isPlatformHost,
  platformUrl,
} from '../../shared/api'

function workspaceHost(slug: string) {
  const port = window.location.port ? `:${window.location.port}` : ''
  return `${slug}.${BASE_DOMAIN}${port}`
}

function normalizeSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function PlatformStaffLogin() {
  const { login, user, loading, isStaff } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm({
    initialValues: { email: '', password: '' },
  })

  if (!loading && user && isStaff) {
    return <Navigate to="/" replace />
  }

  return (
    <Container size={420} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Platform login</Title>
        <Text c="dimmed">Staff access for tenant ops and demo reset.</Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.85)' }}>
        <form
          onSubmit={form.onSubmit(async (values) => {
            setSubmitting(true)
            try {
              await login(values.email, values.password)
              navigate('/')
            } catch (err: unknown) {
              notifications.show({
                color: 'red',
                title: 'Login failed',
                message: err instanceof Error ? err.message : 'Invalid credentials',
              })
            } finally {
              setSubmitting(false)
            }
          })}
        >
          <Stack>
            <TextInput label="Staff email" type="email" required {...form.getInputProps('email')} />
            <PasswordInput label="Password" required {...form.getInputProps('password')} />
            <Button type="submit" fullWidth loading={submitting}>
              Log in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}

function ApexWorkspaceLogin() {
  const [loading, setLoading] = useState(false)
  const form = useForm({
    initialValues: { slug: '' },
    validate: {
      slug: (value) => {
        const slug = normalizeSlug(value)
        if (!slug) return 'Enter your workspace name'
        if (slug.length < 2) return 'Workspace name is too short'
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          return 'Use lowercase letters, numbers, and hyphens'
        }
        return null
      },
    },
  })

  const slugPreview = normalizeSlug(form.values.slug)
  const hostPreview = slugPreview
    ? workspaceHost(slugPreview)
    : `<workspace>.${BASE_DOMAIN}${window.location.port ? `:${window.location.port}` : ''}`

  return (
    <Container size={480} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Log in to your workspace</Title>
        <Text c="dimmed">
          Enter your workspace subdomain to continue. Example:{' '}
          <Text span ff="monospace" size="sm">
            acme-esign.{BASE_DOMAIN}
            {window.location.port ? `:${window.location.port}` : ''}
          </Text>
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.85)' }}>
        <form
          onSubmit={form.onSubmit(async (values) => {
            const slug = normalizeSlug(values.slug)
            setLoading(true)
            try {
              const check = await api<{ slug: string; available: boolean }>(
                `/api/auth/slug-check/?slug=${encodeURIComponent(slug)}`,
                { public: true },
              )
              if (check.available) {
                form.setFieldError(
                  'slug',
                  'No workspace found with that name. Check the spelling or create one.',
                )
                return
              }
              const host = workspaceHost(slug)
              window.location.href = `${window.location.protocol}//${host}/login`
            } catch (err: unknown) {
              notifications.show({
                color: 'red',
                title: 'Could not continue',
                message: err instanceof Error ? err.message : 'Try again',
              })
            } finally {
              setLoading(false)
            }
          })}
        >
          <Stack>
            <TextInput
              label="Workspace name"
              placeholder="acme-esign"
              description="This becomes your login URL"
              rightSectionWidth={Math.min(220, 24 + BASE_DOMAIN.length * 8)}
              rightSection={
                <Text size="xs" c="dimmed" pr="sm" style={{ whiteSpace: 'nowrap' }}>
                  .{BASE_DOMAIN}
                </Text>
              }
              required
              autoFocus
              {...form.getInputProps('slug')}
              onBlur={(e) => {
                form.getInputProps('slug').onBlur(e)
                const normalized = normalizeSlug(e.currentTarget.value)
                if (normalized !== form.values.slug) {
                  form.setFieldValue('slug', normalized)
                }
              }}
            />
            <Text size="sm" c="dimmed" ff="monospace">
              {hostPreview}/login
            </Text>
            <Button type="submit" fullWidth loading={loading}>
              Continue to login
            </Button>
            <Text size="sm" ta="center">
              New here?{' '}
              <Anchor component={Link} to="/signup">
                Create a workspace
              </Anchor>
            </Text>
            <Text size="sm" ta="center" c="dimmed">
              SignDesk staff?{' '}
              <Anchor href={platformUrl('/login')}>Open platform login</Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const form = useForm({
    initialValues: { email: '', password: '' },
  })

  if (isPlatformHost()) {
    return <PlatformStaffLogin />
  }

  if (!loading && user) {
    return <Navigate to="/app" replace />
  }

  if (isApexHost()) {
    return <ApexWorkspaceLogin />
  }

  return (
    <Container size={420} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Welcome back</Title>
        <Text c="dimmed">
          {getTenantSlug()}.{BASE_DOMAIN}
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.85)' }}>
        <form
          onSubmit={form.onSubmit(async (values) => {
            try {
              await login(values.email, values.password)
              navigate('/app')
            } catch (err: unknown) {
              notifications.show({
                color: 'red',
                title: 'Login failed',
                message: err instanceof Error ? err.message : 'Invalid credentials',
              })
            }
          })}
        >
          <Stack>
            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <PasswordInput
              label="Password"
              required
              {...form.getInputProps('password')}
            />
            <Anchor component={Link} to="/forgot-password" size="sm">
              Forgot password?
            </Anchor>
            <Button type="submit" fullWidth>
              Log in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
