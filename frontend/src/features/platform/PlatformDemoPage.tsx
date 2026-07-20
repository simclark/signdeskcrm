import { Button, Code, CopyButton, Group, Modal, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '../../shared/api'

type ResetResult = {
  owner_email: string
  password_set: boolean
  login_url: string
  workspace_url: string
}

export function PlatformDemoPage() {
  const [result, setResult] = useState<ResetResult | null>(null)
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
  const [confirmText, setConfirmText] = useState('')
  const form = useForm({
    initialValues: {
      owner_email: '',
      owner_password: '',
    },
  })

  const reset = useMutation({
    mutationFn: (values: typeof form.values) =>
      api<ResetResult>('/api/platform/demo/reset/', {
        method: 'POST',
        json: {
          owner_email: values.owner_email || undefined,
          owner_password: values.owner_password || undefined,
        },
      }),
    onSuccess: (data) => {
      setResult(data)
      closeConfirm()
      setConfirmText('')
      notifications.show({ color: 'forest', message: 'Demo workspace reset' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not reset demo',
      })
    },
  })

  return (
    <Stack gap="lg" maw={560}>
      <Stack gap={4}>
        <Title order={2}>Demo workspace</Title>
        <Text c="dimmed" size="sm">
          Resets the reserved <Code>demo</Code> tenant to a single Sample Purchase Agreement and
          Buyer/Seller contacts. Safe to run between pitches (local or production).
        </Text>
      </Stack>

      <Paper p="lg" withBorder radius="md">
        <Stack gap="md">
          <TextInput
            label="Owner email (optional)"
            placeholder="owner@demo.signdeskcrm.test"
            {...form.getInputProps('owner_email')}
          />
          <TextInput
            label="Owner password (optional)"
            type="password"
            description="Set or reset the demo owner password"
            {...form.getInputProps('owner_password')}
          />
          <Button color="red" variant="light" onClick={openConfirm}>
            Reset demo workspace
          </Button>
        </Stack>
      </Paper>

      {result ? (
        <Paper p="md" withBorder radius="md" bg="var(--mantine-color-gray-0)">
          <Stack gap="sm">
            <Text fw={600}>Last reset</Text>
            <Group gap="xs" align="flex-start">
              <Text size="sm" style={{ flex: 1 }}>
                Login: <Code style={{ wordBreak: 'break-all' }}>{result.login_url}</Code>
              </Text>
              <CopyButton value={result.login_url}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" variant="light" onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Group gap="xs" align="flex-start">
              <Text size="sm" style={{ flex: 1 }}>
                Owner: <Code>{result.owner_email}</Code>
                {result.password_set ? ' (password was set)' : ''}
              </Text>
              <CopyButton value={result.owner_email}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" variant="light" onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Group>
              <Button
                component="a"
                href={result.login_url}
                target="_blank"
                rel="noreferrer"
                variant="light"
              >
                Open demo login
              </Button>
              <Button
                component="a"
                href={result.workspace_url}
                target="_blank"
                rel="noreferrer"
              >
                Open demo workspace
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : null}

      <Text size="sm" c="dimmed">
        Break-glass CLI: <Code>python manage.py reset_demo_tenant</Code>
      </Text>

      <Modal opened={confirmOpened} onClose={closeConfirm} title="Confirm demo reset" centered>
        <Stack gap="md">
          <Text size="sm">
            This wipes envelopes, contacts, and documents on the <Code>demo</Code> tenant. Type{' '}
            <Code>RESET</Code> to confirm.
          </Text>
          <TextInput
            label="Confirmation"
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder="RESET"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={confirmText.trim() !== 'RESET'}
              loading={reset.isPending}
              onClick={() => reset.mutate(form.values)}
            >
              Reset demo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
