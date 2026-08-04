import { Alert, Button, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ApiError, api, setTokens } from '../../shared/api'
import { useAuth } from '../auth/AuthContext'

type ExchangeResponse = {
  access: string
  refresh: string
  user: {
    id: number
    email: string
    first_name: string
    last_name: string
    full_name: string
    is_staff?: boolean
  }
  impersonation: {
    actor_email: string
    tenant_slug: string
    expires_at: string
  }
}

export function SupportImpersonatePage() {
  const { token } = useParams()
  const { refreshMe } = useAuth()

  const exchange = useMutation({
    mutationFn: () =>
      api<ExchangeResponse>(`/api/auth/support-impersonate/${token}/`, {
        method: 'POST',
      }),
    onSuccess: async (data) => {
      setTokens(data.access, data.refresh)
      sessionStorage.setItem(
        'signdesk_impersonation',
        JSON.stringify(data.impersonation),
      )
      notifications.show({
        color: 'orange',
        message: `Support session as ${data.user.email} (started by ${data.impersonation.actor_email})`,
      })
      await refreshMe()
      window.location.assign('/app')
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Impersonation failed',
      })
    },
  })

  return (
    <Stack maw={480} mx="auto" mt="xl" gap="md" p="md">
      <Title order={2}>Support access</Title>
      <Alert color="orange">
        This one-time link signs you into a workspace member account for support. Actions
        are audited. The link expires after one hour or first use.
      </Alert>
      <Text size="sm" c="dimmed">
        Token: {token?.slice(0, 8)}…
      </Text>
      <Button loading={exchange.isPending} onClick={() => exchange.mutate()}>
        Continue into workspace
      </Button>
    </Stack>
  )
}
