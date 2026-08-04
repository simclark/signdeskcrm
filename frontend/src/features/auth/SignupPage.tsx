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
import { api, ApiError, BASE_DOMAIN, marketingHomeUrl } from '../../shared/api'
import { useState } from 'react'

export function SignupPage() {
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [workspaceHost, setWorkspaceHost] = useState<string | null>(null)
  const form = useForm({
    initialValues: {
      company_name: '',
      slug: '',
      email: '',
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

  if (sentTo) {
    return (
      <Container size={520} py={80}>
        <Stack gap="xs" mb="xl">
          <Text
            component="a"
            href={marketingHomeUrl()}
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 40,
              fontWeight: 700,
              textDecoration: 'none',
              color: 'inherit',
              display: 'inline-block',
            }}
          >
            SignDesk
          </Text>
          <Title order={2}>Check your email</Title>
          <Text c="dimmed">
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it to confirm your
            address and set a password for{' '}
            {workspaceHost ? <code>{workspaceHost}</code> : 'your workspace'}.
          </Text>
        </Stack>
        <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.8)' }}>
          <Stack>
            <Text size="sm" c="dimmed">
              The link expires in 24 hours. After you set your password you&apos;ll land in your
              workspace.
            </Text>
            <Anchor component={Link} to="/login" size="sm">
              Back to login
            </Anchor>
          </Stack>
        </Paper>
      </Container>
    )
  }

  return (
    <Container size={520} py={80}>
      <Stack gap="xs" mb="xl">
        <Text
          component="a"
          href={marketingHomeUrl()}
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 40,
            fontWeight: 700,
            textDecoration: 'none',
            color: 'inherit',
            display: 'inline-block',
          }}
        >
          SignDesk
        </Text>
        <Title order={2}>Create your workspace</Title>
        <Text c="dimmed">
          Choose a subdomain like <code>acme-esign.{BASE_DOMAIN}</code> for your team. We&apos;ll
          email you a link to confirm your address and set a password.
        </Text>
      </Stack>
      <Paper p="xl" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.8)' }}>
        <form
          onSubmit={form.onSubmit(async (values) => {
            setSubmitting(true)
            try {
              const data = await api<{
                detail: string
                email: string
                redirect_host: string
                tenant: { slug: string }
              }>('/api/auth/signup/', { method: 'POST', json: values, public: true })
              const host =
                data.redirect_host ||
                `${data.tenant.slug}.${BASE_DOMAIN}${window.location.port ? `:${window.location.port}` : ''}`
              setWorkspaceHost(host)
              setSentTo(data.email)
              notifications.show({
                color: 'forest',
                title: 'Confirm your email',
                message: data.detail,
              })
            } catch (err: unknown) {
              const message =
                err instanceof ApiError
                  ? String(
                      (err.data as { detail?: string; email?: string[]; slug?: string[] })
                        ?.detail ||
                        (err.data as { email?: string[] })?.email?.[0] ||
                        (err.data as { slug?: string[] })?.slug?.[0] ||
                        err.message,
                    )
                  : err instanceof Error
                    ? err.message
                    : 'Unable to sign up'
              notifications.show({
                color: 'red',
                title: 'Signup failed',
                message,
              })
            } finally {
              setSubmitting(false)
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
              rightSectionWidth={180}
              rightSection={
                <Text size="xs" c="dimmed" pr="sm">
                  .{BASE_DOMAIN}
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
            <Text size="xs" c="dimmed">
              By creating a workspace you agree to the{' '}
              <Anchor component={Link} to="/terms" size="xs">
                Terms of Service
              </Anchor>{' '}
              and{' '}
              <Anchor component={Link} to="/privacy" size="xs">
                Privacy Policy
              </Anchor>
              .
            </Text>
            <Button type="submit" loading={checking || submitting} fullWidth>
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
