import {
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, BASE_DOMAIN, getTenantSlug, isApexHost } from '../../shared/api'

type ResetInfo = {
  email: string
  tenant_name: string
  tenant_slug: string
  expires_at: string
}

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const resetQuery = useQuery({
    queryKey: ['password-reset', token],
    enabled: Boolean(token) && !isApexHost(),
    queryFn: () => api<ResetInfo>(`/api/auth/password-reset/${token}/`, { public: true }),
    retry: false,
  })

  const form = useForm({
    initialValues: {
      password: '',
      confirm_password: '',
    },
    validate: {
      password: (value) =>
        !value || value.length < 8 ? 'Password must be at least 8 characters' : null,
      confirm_password: (value, values) =>
        value !== values.password ? 'Passwords do not match' : null,
    },
  })

  const confirm = useMutation({
    mutationFn: (values: { password: string }) =>
      api<{ ok: boolean }>(`/api/auth/password-reset/${token}/confirm/`, {
        method: 'POST',
        json: { password: values.password },
        public: true,
      }),
    onSuccess: () => {
      notifications.show({
        color: 'forest',
        title: 'Password updated',
        message: 'You can log in with your new password.',
      })
      navigate('/login')
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? String(
              (err.data as { detail?: string; password?: string[] })?.detail ||
                (err.data as { password?: string[] })?.password?.[0] ||
                err.message,
            )
          : 'Could not reset password'
      notifications.show({ color: 'red', title: 'Reset failed', message })
    },
  })

  if (isApexHost()) {
    return (
      <Container size={480} py={80}>
        <Title order={2} mb="md">
          Open your workspace reset link
        </Title>
        <Text c="dimmed">
          Password reset links must be opened from your workspace subdomain (for example{' '}
          <code>acme.{BASE_DOMAIN}:5173/reset-password/…</code>).
        </Text>
      </Container>
    )
  }

  if (!token) return <Navigate to="/login" replace />

  if (resetQuery.isLoading) {
    return (
      <Container size={420} py={80}>
        <Text c="dimmed">Loading reset link…</Text>
      </Container>
    )
  }

  if (resetQuery.isError) {
    const status = resetQuery.error instanceof ApiError ? resetQuery.error.status : 0
    return (
      <Container size={480} py={80}>
        <Title order={2} mb="md">
          {status === 410 ? 'Reset link expired' : 'Reset link unavailable'}
        </Title>
        <Text c="dimmed" mb="lg">
          {resetQuery.error instanceof Error
            ? resetQuery.error.message
            : 'This reset link is not valid.'}
        </Text>
        <Button component={Link} to="/forgot-password">
          Request a new link
        </Button>
      </Container>
    )
  }

  const info = resetQuery.data!

  return (
    <Container size={420} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Choose a new password</Title>
        <Text c="dimmed">
          {info.tenant_name} · {info.email}
        </Text>
        <Text size="sm" c="dimmed">
          {getTenantSlug()}.{BASE_DOMAIN}
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.85)' }}>
        <form
          onSubmit={form.onSubmit((values) =>
            confirm.mutate({ password: values.password }),
          )}
        >
          <Stack>
            <PasswordInput
              label="New password"
              description="At least 8 characters"
              required
              {...form.getInputProps('password')}
            />
            <PasswordInput
              label="Confirm password"
              required
              {...form.getInputProps('confirm_password')}
            />
            <Button type="submit" fullWidth loading={confirm.isPending}>
              Update password
            </Button>
            <Anchor component={Link} to="/login" size="sm">
              Back to login
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
