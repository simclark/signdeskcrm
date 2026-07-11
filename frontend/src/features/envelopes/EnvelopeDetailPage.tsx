import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
  Timeline,
  Anchor,
  Table,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '../../shared/api'
import { notifications } from '@mantine/notifications'

export function EnvelopeDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: envelope } = useQuery({
    queryKey: ['envelope', id],
    queryFn: () => api<any>(`/api/envelopes/${id}/`),
  })
  const { data: audit } = useQuery({
    queryKey: ['envelope-audit', id],
    queryFn: () => api<any[]>(`/api/envelopes/${id}/audit/`),
    enabled: !!id,
  })

  const send = useMutation({
    mutationFn: () => api(`/api/envelopes/${id}/send/`, { method: 'POST', json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelope', id] })
      qc.invalidateQueries({ queryKey: ['envelope-audit', id] })
      notifications.show({ color: 'forest', message: 'Envelope sent — check Mailpit' })
    },
    onError: (err: any) =>
      notifications.show({
        color: 'red',
        title: 'Send failed',
        message: err?.data?.errors?.join?.(', ') || err.message,
      }),
  })

  const voidEnvelope = useMutation({
    mutationFn: () =>
      api(`/api/envelopes/${id}/void/`, { method: 'POST', json: { reason: 'Voided by sender' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelope', id] }),
  })

  const resend = useMutation({
    mutationFn: () => api(`/api/envelopes/${id}/resend/`, { method: 'POST', json: {} }),
    onSuccess: () => notifications.show({ message: 'Reminders queued' }),
  })

  const duplicate = useMutation({
    mutationFn: () => api<any>(`/api/envelopes/${id}/duplicate/`, { method: 'POST', json: {} }),
    onSuccess: (data) => {
      notifications.show({ message: 'Duplicated' })
      window.location.href = `/app/envelopes/${data.id}`
    },
  })

  if (!envelope) return null

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group>
            <Title order={2}>{envelope.title}</Title>
            <Badge>{envelope.status}</Badge>
          </Group>
          <Text c="dimmed">{envelope.message || 'No message'}</Text>
        </div>
        <Group>
          {envelope.status === 'draft' && (
            <Button onClick={() => send.mutate()} loading={send.isPending}>
              Send
            </Button>
          )}
          {['sent', 'in_progress'].includes(envelope.status) && (
            <>
              <Button variant="light" onClick={() => resend.mutate()}>
                Resend invites
              </Button>
              <Button color="red" variant="light" onClick={() => voidEnvelope.mutate()}>
                Void
              </Button>
            </>
          )}
          <Button variant="default" onClick={() => duplicate.mutate()}>
            Duplicate
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Recipients
        </Title>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(envelope.recipients || []).map((r: any) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.name}</Table.Td>
                <Table.Td>{r.email}</Table.Td>
                <Table.Td>{r.role}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{r.status}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Documents
        </Title>
        <Stack gap="xs">
          {envelope.signed_file_url && (
            <Anchor href={envelope.signed_file_url} target="_blank">
              Download signed PDF
            </Anchor>
          )}
          {envelope.certificate_file_url && (
            <Anchor href={envelope.certificate_file_url} target="_blank">
              Download Certificate of Completion
            </Anchor>
          )}
          {envelope.pre_sign_sha256 && (
            <Text size="sm" c="dimmed">
              Pre-sign hash: {envelope.pre_sign_sha256}
            </Text>
          )}
          {envelope.post_sign_sha256 && (
            <Text size="sm" c="dimmed">
              Post-sign hash: {envelope.post_sign_sha256}
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Audit trail
        </Title>
        <Timeline active={audit?.length || 0}>
          {(audit || []).map((e) => (
            <Timeline.Item key={e.id} title={e.event_type}>
              <Text size="sm">
                {e.actor_name || e.actor_email || 'System'}
                {e.ip_address ? ` · ${e.ip_address}` : ''}
              </Text>
              <Text size="xs" c="dimmed">
                {new Date(e.created_at).toLocaleString()}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      </Card>
    </Stack>
  )
}
