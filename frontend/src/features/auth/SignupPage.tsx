import {
  Anchor,
  Button,
  Container,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  Group,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { api, setTokens } from '../../shared/api'
import { useState } from 'react'

export function SignupPage() {
  const [checking, setChecking] = useState(false)
  const form = useForm({
    initialValues: {
      company_name: '',
      slug: '',
      email: '',
      password: '',
      first_name: '',
      last_name: '',
    },
  })

  const suggestSlug = async (name: string) => {
    if (!name) return
    setChecking(true)
    try {
      const data = await api<{ slug: string }>(
        `/api/auth/suggest-slug/?name=${encodeURIComponent(name)}`,
      )
      form.setFieldValue('slug', data.slug)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Container size={520} py={80}>
      <Stack gap="xs" mb="xl">
        <Text
          style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 40, fontWeight: 700 }}
        >
          SignDesk
        </Text>
        <Title order={2}>Create your workspace</Title>
        <Text c="dimmed">
          Choose a subdomain like <code>acme-esign.localhost</code> for your team.
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.8)' }}>
        <form
          onSubmit={form.onSubmit(async (values) => {
            try {
              const data = await api<{
                tokens: { access: string; refresh: string }
                redirect_host: string
                tenant: { slug: string }
              }>('/api/auth/signup/', { method: 'POST', json: values })
              setTokens(data.tokens.access, data.tokens.refresh)
              notifications.show({
                color: 'forest',
                title: 'Workspace ready',
                message: `Opening ${data.tenant.slug}.localhost…`,
              })
              const proto = window.location.protocol
              const port = window.location.port ? `:${window.location.port}` : ''
              window.location.href = `${proto}//${data.tenant.slug}.localhost${port}/app`
            } catch (err: unknown) {
              notifications.show({
                color: 'red',
                title: 'Signup failed',
                message: err instanceof Error ? err.message : 'Unable to sign up',
              })
            }
          })}
        >
          <Stack>
            <TextInput
              label="Company name"
              placeholder="Acme Esign, Inc"
              required
              {...form.getInputProps('company_name')}
              onBlur={(e) => {
                form.getInputProps('company_name').onBlur(e)
                if (!form.values.slug) suggestSlug(e.currentTarget.value)
              }}
            />
            <TextInput
              label="Subdomain slug"
              description="Your workspace URL"
              rightSectionWidth={140}
              rightSection={
                <Text size="xs" c="dimmed" pr="sm">
                  .localhost
                </Text>
              }
              required
              {...form.getInputProps('slug')}
            />
            <Group grow>
              <TextInput label="First name" {...form.getInputProps('first_name')} />
              <TextInput label="Last name" {...form.getInputProps('last_name')} />
            </Group>
            <TextInput label="Work email" type="email" required {...form.getInputProps('email')} />
            <TextInput
              label="Password"
              type="password"
              required
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={checking} fullWidth>
              Create workspace
            </Button>
            <Text size="sm" ta="center">
              Already have an account? <Anchor component={Link} to="/login">Log in</Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
