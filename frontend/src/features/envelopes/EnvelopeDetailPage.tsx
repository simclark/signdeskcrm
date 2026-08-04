import {
  Badge,
  Button,
  Card,
  Group,
  Select,
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
import { PageBreadcrumbs } from '../../shared/PageBreadcrumbs'
import { notifications } from '@mantine/notifications'
import { PdfViewerDialog } from '../documents/PdfViewerDialog'

const EVENT_BADGE_COLOR: Record<string, string> = {
  signed: 'forest',
  completed: 'forest',
  voided: 'red',
  declined: 'red',
  expired: 'orange',
  downloaded: 'blue',
  consent_accepted: 'teal',
  field_completed: 'teal',
  sent: 'blue',
}

const RECIPIENT_STATUS_COLOR: Record<string, string> = {
  signed: 'forest',
  sent: 'blue',
  viewed: 'teal',
  pending: 'gray',
  not_required: 'gray',
  declined: 'red',
}

function formatRecipientStatus(status: string) {
  if (status === 'not_required') return 'Not required'
  return status.replaceAll('_', ' ')
}

function formatEventLabel(eventType: string, payload?: Record<string, unknown> | null) {
  if (eventType === 'field_completed') {
    const label = typeof payload?.label === 'string' ? payload.label.trim() : ''
    const fieldType = typeof payload?.field_type === 'string' ? payload.field_type : ''
    if (label) return `Field · ${label}`
    if (fieldType) return `Field · ${fieldType}`
  }
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
  const { data: plans } = useQuery({
    queryKey: ['follow-up-plans'],
    queryFn: () =>
      api<{ results: { id: number; name: string; trigger: string; is_active: boolean }[] }>(
        '/api/follow-up-plans/',
      ),
  })
  const { data: enrollments } = useQuery({
    queryKey: ['follow-up-plan-enrollments', id],
    queryFn: () =>
      api<{
        results: {
          id: number
          status: string
          next_run_at: string | null
          emails_sent: number
          recipient_name: string
          current_step_order: number
        }[]
      }>(`/api/follow-up-plan-enrollments/?envelope=${id}`),
    enabled: !!id,
  })

  const setPlan = useMutation({
    mutationFn: (planId: number | null) =>
      api(`/api/envelopes/${id}/`, {
        method: 'PATCH',
        json: { follow_up_plan: planId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelope', id] })
      qc.invalidateQueries({ queryKey: ['follow-up-plan-enrollments', id] })
      notifications.show({ color: 'forest', message: 'Follow-up plan updated' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not update plan', message: err.message }),
  })

  const send = useMutation({
    mutationFn: () => api(`/api/envelopes/${id}/send/`, { method: 'POST', json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelope', id] })
      qc.invalidateQueries({ queryKey: ['envelope-audit', id] })
      notifications.show({ color: 'forest', message: 'Invites sent to signers' })
    },
    onError: (err: any) =>
      notifications.show({
        color: 'red',
        title: 'Could not send for signature',
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

  const regenerateCertificate = useMutation({
    mutationFn: () =>
      api(`/api/envelopes/${id}/regenerate-certificate/`, { method: 'POST', json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelope', id] })
      notifications.show({ color: 'forest', message: 'Certificate regenerated' })
    },
    onError: (err: any) =>
      notifications.show({
        color: 'red',
        title: 'Could not regenerate certificate',
        message: err?.data?.detail || err.message,
      }),
  })

  if (!envelope) return null

  return (
    <Stack>
      <PageBreadcrumbs
        items={[
          { label: 'Envelopes', to: '/app/envelopes' },
          { label: envelope.title },
        ]}
      />
      <Group justify="space-between" align="flex-start">
        <div>
          <Group>
            <Title order={2}>{envelope.title}</Title>
            <Badge>{envelope.status}</Badge>
            {envelope.routing ? (
              <Badge variant="outline" tt="capitalize">
                {envelope.routing}
              </Badge>
            ) : null}
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
                Send for signature
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
          {envelope.status === 'completed' && (
            <Button
              variant="light"
              onClick={() => regenerateCertificate.mutate()}
              loading={regenerateCertificate.isPending}
            >
              Regenerate certificate
            </Button>
          )}
          <Button variant="default" onClick={() => duplicate.mutate()}>
            Duplicate
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="sm">
          Follow-up plan
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Optional. Stalled plans replace tenant reminder emails for this envelope. Manage plans in{' '}
          <Anchor component={Link} to="/app/follow-up-plans">
            Follow-up plans
          </Anchor>
          .
        </Text>
        <Select
          label="Active plan"
          clearable
          placeholder="None — use tenant reminders only"
          data={(plans?.results || [])
            .filter((p) => p.is_active)
            .map((p) => ({
              value: String(p.id),
              label: `${p.name} (${p.trigger})`,
            }))}
          value={envelope.follow_up_plan != null ? String(envelope.follow_up_plan) : null}
          onChange={(value) => setPlan.mutate(value ? Number(value) : null)}
          disabled={setPlan.isPending || envelope.status === 'voided'}
          mb="md"
        />
        {(enrollments?.results || []).length > 0 ? (
          <Stack gap="xs">
            {(enrollments?.results || []).map((e) => (
              <Group key={e.id} gap="xs">
                <Badge variant="light" color={e.status === 'active' ? 'orange' : 'gray'}>
                  {e.recipient_name || 'Recipient'} · {e.status}
                </Badge>
                <Text size="sm" c="dimmed">
                  Step {e.current_step_order} · {e.emails_sent} sent
                  {e.next_run_at
                    ? ` · next ${new Date(e.next_run_at).toLocaleString()}`
                    : ''}
                </Text>
              </Group>
            ))}
          </Stack>
        ) : envelope.follow_up_plan ? (
          <Text size="sm" c="dimmed">
            {envelope.status === 'draft'
              ? 'Plan will start for signers when this envelope is sent.'
              : 'No active enrollments yet.'}
          </Text>
        ) : null}
      </Card>

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
                  <DataTable.Td className="sd-table-muted">{r.email || '—'}</DataTable.Td>
                  <DataTable.Td>
                    <Text tt="capitalize" size="sm">
                      {r.role}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge
                      variant="light"
                      tt="capitalize"
                      color={RECIPIENT_STATUS_COLOR[r.status] || undefined}
                    >
                      {formatRecipientStatus(r.status)}
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
                      {formatEventLabel(e.event_type, e.payload)}
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
