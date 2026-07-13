import { Anchor, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { useAuth } from './AuthContext'
import { getTenantSlug, isApexHost } from '../../shared/api'

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const form = useForm({
    initialValues: { email: '', password: '' },
  })

  if (!loading && user) return <Navigate to="/app" replace />

  if (isApexHost()) {
    return (
      <Container size={480} py={80}>
        <Title order={2} mb="md">
          Log in on your workspace
        </Title>
        <Text c="dimmed" mb="lg">
          Open <code>your-slug.localhost:5173/login</code>, or{' '}
          <Anchor component={Link} to="/signup">
            create a workspace
          </Anchor>
          .
        </Text>
      </Container>
    )
  }

  return (
    <Container size={420} py={80}>
      <Stack gap="xs" mb="xl">
        <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36, fontWeight: 700 }}>
          SignDesk
        </Text>
        <Title order={2}>Welcome back</Title>
        <Text c="dimmed">{getTenantSlug()}.localhost</Text>
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
            <Button type="submit" fullWidth>
              Log in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
