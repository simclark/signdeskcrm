import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
  Anchor,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { notifications } from '@mantine/notifications'
import { PdfViewerDialog } from '../documents/PdfViewerDialog'

const EVENT_BADGE_COLOR: Record<string, string> = {
  signed: 'forest',
  completed: 'forest',
  voided: 'red',
  declined: 'red',
  downloaded: 'blue',
  consent_accepted: 'teal',
  sent: 'blue',
}

function formatEventLabel(eventType: string) {
  return eventType
    .split('_')
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(' ')
}

function formatAuditTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function EnvelopeDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [pdfViewer, setPdfViewer] = useState<{
    url: string
    title: string
    downloadFileName: string
  } | null>(null)
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
            <>
              <Button component={Link} to={`/app/envelopes/${id}/prepare`} variant="light">
                Prepare / edit fields
              </Button>
              <Button onClick={() => send.mutate()} loading={send.isPending}>
                Send
              </Button>
            </>
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
        {(envelope.recipients || []).length === 0 ? (
          <Text c="dimmed" size="sm">
            No recipients yet. Open Prepare to add signers and place fields.
          </Text>
        ) : (
          <DataTable embedded>
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Name</DataTable.Th>
                <DataTable.Th>Email</DataTable.Th>
                <DataTable.Th>Role</DataTable.Th>
                <DataTable.Th>Status</DataTable.Th>
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {(envelope.recipients || []).map((r: any) => (
                <DataTable.Tr key={r.id}>
                  <DataTable.Td className="sd-table-primary">{r.name}</DataTable.Td>
                  <DataTable.Td className="sd-table-muted">{r.email}</DataTable.Td>
                  <DataTable.Td>
                    <Text tt="capitalize" size="sm">
                      {r.role}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge variant="light" tt="capitalize">
                      {r.status.replaceAll('_', ' ')}
                    </Badge>
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        )}
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Documents
        </Title>
        <Stack gap="xs" align="flex-start">
          {envelope.document_file_url && (
            <Anchor
              component="button"
              type="button"
              onClick={() =>
                setPdfViewer({
                  url: envelope.document_file_url,
                  title: 'Original PDF',
                  downloadFileName: `${envelope.title || 'document'}-original.pdf`,
                })
              }
            >
              View original PDF
            </Anchor>
          )}
          {envelope.signed_file_url && (
            <Anchor
              component="button"
              type="button"
              onClick={() =>
                setPdfViewer({
                  url: envelope.signed_file_url,
                  title: 'Signed PDF',
                  downloadFileName: `${envelope.title || 'document'}-signed.pdf`,
                })
              }
            >
              View signed PDF
            </Anchor>
          )}
          {envelope.certificate_file_url && (
            <Anchor
              component="button"
              type="button"
              onClick={() =>
                setPdfViewer({
                  url: envelope.certificate_file_url,
                  title: 'Certificate of Completion',
                  downloadFileName: `${envelope.title || 'document'}-certificate.pdf`,
                })
              }
            >
              View Certificate of Completion
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
        {(audit || []).length === 0 ? (
          <Text c="dimmed" size="sm">
            No audit events yet.
          </Text>
        ) : (
          <DataTable embedded>
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Event</DataTable.Th>
                <DataTable.Th>Actor</DataTable.Th>
                <DataTable.Th>IP address</DataTable.Th>
                <DataTable.Th>Time</DataTable.Th>
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {(audit || []).map((e) => (
                <DataTable.Tr key={e.id}>
                  <DataTable.Td>
                    <Badge
                      variant="light"
                      color={EVENT_BADGE_COLOR[e.event_type] || 'gray'}
                      tt="none"
                    >
                      {formatEventLabel(e.event_type)}
                    </Badge>
                  </DataTable.Td>
                  <DataTable.Td className="sd-table-primary">
                    {e.actor_name || e.actor_email || 'System'}
                  </DataTable.Td>
                  <DataTable.Td className="sd-table-muted">
                    {e.ip_address || '—'}
                  </DataTable.Td>
                  <DataTable.Td className="sd-table-muted">
                    {formatAuditTime(e.created_at)}
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        )}
      </Card>

      <PdfViewerDialog
        opened={!!pdfViewer}
        onClose={() => setPdfViewer(null)}
        fileUrl={pdfViewer?.url}
        title={pdfViewer?.title}
        downloadFileName={pdfViewer?.downloadFileName}
      />
    </Stack>
  )
}
