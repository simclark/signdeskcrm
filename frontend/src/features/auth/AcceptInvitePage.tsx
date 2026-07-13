import {
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, getTenantSlug, isApexHost, setTokens } from '../../shared/api'
import { useAuth } from './AuthContext'

type InviteInfo = {
  email: string
  role: string
  tenant_name: string
  tenant_slug: string
  expires_at: string
  user_exists: boolean
}

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading, refreshMe } = useAuth()

  const inviteQuery = useQuery({
    queryKey: ['invitation', token],
    enabled: Boolean(token) && !isApexHost(),
    queryFn: () =>
      api<InviteInfo>(`/api/auth/invitations/${token}/`, { public: true }),
    retry: false,
  })

  const form = useForm({
    initialValues: {
      first_name: '',
      last_name: '',
      password: '',
      confirm_password: '',
    },
    validate: {
      password: (value, values) => {
        if (inviteQuery.data?.user_exists) return null
        if (!value || value.length < 8) return 'Password must be at least 8 characters'
        if (value !== values.confirm_password) return 'Passwords do not match'
        return null
      },
      confirm_password: (value, values) => {
        if (inviteQuery.data?.user_exists) return null
        if (value !== values.password) return 'Passwords do not match'
        return null
      },
    },
  })

  const accept = useMutation({
    mutationFn: (values: typeof form.values) => {
      const body = inviteQuery.data?.user_exists
        ? {}
        : {
            first_name: values.first_name,
            last_name: values.last_name,
            password: values.password,
          }
      return api<{
        tokens: { access: string; refresh: string }
        tenant: { slug: string }
      }>(`/api/auth/invitations/${token}/accept/`, {
        method: 'POST',
        json: body,
        public: true,
      })
    },
    onSuccess: async (data) => {
      setTokens(data.tokens.access, data.tokens.refresh)
      await refreshMe()
      notifications.show({
        color: 'forest',
        title: 'Welcome aboard',
        message: `You're in ${data.tenant.slug}.`,
      })
      navigate('/app')
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? String(
              (err.data as { detail?: string; password?: string[] })?.detail ||
                (err.data as { password?: string[] })?.password?.[0] ||
                err.message,
            )
          : 'Could not accept invitation'
      notifications.show({ color: 'red', title: 'Invite failed', message })
    },
  })

  if (isApexHost()) {
    return (
      <Container size={480} py={80}>
        <Title order={2} mb="md">
          Open your workspace invite
        </Title>
        <Text c="dimmed">
          Invitations must be opened from your workspace subdomain (for example{' '}
          <code>acme.localhost:5173/invite/…</code>).
        </Text>
      </Container>
    )
  }

  if (!token) return <Navigate to="/login" replace />

  if (inviteQuery.isLoading || authLoading) {
    return (
      <Container size={420} py={80}>
        <Text c="dimmed">Loading invitation…</Text>
      </Container>
    )
  }

  if (inviteQuery.isError) {
    const status = inviteQuery.error instanceof ApiError ? inviteQuery.error.status : 0
    return (
      <Container size={480} py={80}>
        <Title order={2} mb="md">
          {status === 410 ? 'Invitation expired' : 'Invitation unavailable'}
        </Title>
        <Text c="dimmed" mb="lg">
          {inviteQuery.error instanceof Error
            ? inviteQuery.error.message
            : 'This invite link is not valid.'}
        </Text>
        {user ? (
          <Button onClick={() => navigate('/app')}>Go to app</Button>
        ) : (
          <Button onClick={() => navigate('/login')}>Log in</Button>
        )}
      </Container>
    )
  }

  const invite = inviteQuery.data!

  return (
    <Container size={420} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Join {invite.tenant_name}</Title>
        <Text c="dimmed">
          Invited as <Text span tt="capitalize" fw={600}>{invite.role}</Text> · {invite.email}
        </Text>
        <Text size="sm" c="dimmed">
          {getTenantSlug()}.localhost
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.85)' }}>
        <form onSubmit={form.onSubmit((values) => accept.mutate(values))}>
          <Stack>
            {invite.user_exists ? (
              <Text size="sm">
                You already have a SignDesk account. Click below to join this workspace with your
                existing password.
              </Text>
            ) : (
              <>
                <Group grow>
                  <TextInput label="First name" {...form.getInputProps('first_name')} />
                  <TextInput label="Last name" {...form.getInputProps('last_name')} />
                </Group>
                <PasswordInput
                  label="Create password"
                  description="At least 8 characters"
                  required
                  {...form.getInputProps('password')}
                />
                <PasswordInput
                  label="Confirm password"
                  required
                  {...form.getInputProps('confirm_password')}
                />
              </>
            )}
            <Button type="submit" fullWidth loading={accept.isPending}>
              {invite.user_exists ? 'Join workspace' : 'Create account'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
