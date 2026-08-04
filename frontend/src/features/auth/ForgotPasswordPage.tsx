import {
  Anchor,
  Button,
  Container,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  api,
  ApiError,
  BASE_DOMAIN,
  getTenantSlug,
  isApexHost,
  isPlatformHost,
} from '../../shared/api'

export function ForgotPasswordPage() {
  const platform = isPlatformHost()
  const form = useForm({
    initialValues: { email: '' },
    validate: {
      email: (v) => (!v ? 'Email is required' : null),
    },
  })

  const requestReset = useMutation({
    mutationFn: (values: { email: string }) =>
      api<{ detail: string }>('/api/auth/password-reset/', {
        method: 'POST',
        json: values,
        public: true,
      }),
    onSuccess: (data) => {
      notifications.show({
        color: 'forest',
        title: 'Check your email',
        message: data.detail,
      })
      form.reset()
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? String((err.data as { detail?: string })?.detail || err.message)
          : 'Could not request password reset'
      notifications.show({ color: 'red', title: 'Request failed', message })
    },
  })

  if (isApexHost()) {
    return (
      <Container size={480} py={80}>
        <Title order={2} mb="md">
          Reset password from your workspace
        </Title>
        <Text c="dimmed" mb="lg">
          Open your workspace subdomain (for example{' '}
          <code>acme.{BASE_DOMAIN}</code>) and use Forgot password there.
        </Text>
        <Anchor component={Link} to="/login">
          Back to login
        </Anchor>
      </Container>
    )
  }

  return (
    <Container size={420} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Forgot password</Title>
        <Text c="dimmed">
          {platform ? 'Platform staff' : `${getTenantSlug()}.${BASE_DOMAIN}`}
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.85)' }}>
        <form onSubmit={form.onSubmit((values) => requestReset.mutate(values))}>
          <Stack>
            <Text size="sm" c="dimmed">
              {platform
                ? "Enter your staff email and we'll send a reset link if you have platform access."
                : "Enter your email and we'll send a reset link if you have access to this workspace."}
            </Text>
            <TextInput
              label={platform ? 'Staff email' : 'Email'}
              type="email"
              required
              {...form.getInputProps('email')}
            />
            <Button type="submit" fullWidth loading={requestReset.isPending}>
              Send reset link
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
