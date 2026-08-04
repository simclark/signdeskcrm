import { Badge, Paper, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'

type EmailEvent = {
  id: number
  event_type: string
  recipient: string
  tenant_slug: string
  subject: string
  description: string
  created_at: string | null
}

export function PlatformEmailEventsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-email-events'],
    queryFn: () => api<EmailEvent[]>('/api/platform/email-events/'),
  })

  const rows = data || []

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Email events</Title>
        <Text c="dimmed" size="sm">
          Postmark delivery, bounce, and complaint webhooks. Configure{' '}
          <code>POSTMARK_WEBHOOK_SECRET</code> and point Postmark at{' '}
          <code>/api/webhooks/postmark/</code>.
        </Text>
      </div>
      <Paper withBorder p="md" radius="md">
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>When</DataTable.Th>
              <DataTable.Th>Type</DataTable.Th>
              <DataTable.Th>Recipient</DataTable.Th>
              <DataTable.Th>Tenant</DataTable.Th>
              <DataTable.Th>Subject</DataTable.Th>
              <DataTable.Th>Detail</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {isLoading ? (
              <DataTable.Tr>
                <DataTable.Td colSpan={6}>
                  <Text c="dimmed">Loading…</Text>
                </DataTable.Td>
              </DataTable.Tr>
            ) : rows.length === 0 ? (
              <DataTable.Tr>
                <DataTable.Td colSpan={6}>
                  <Text c="dimmed">No email events yet.</Text>
                </DataTable.Td>
              </DataTable.Tr>
            ) : (
              rows.map((row) => (
                <DataTable.Tr key={row.id}>
                  <DataTable.Td className="sd-table-muted">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge
                      variant="light"
                      color={
                        row.event_type === 'bounce' || row.event_type === 'complaint'
                          ? 'red'
                          : 'gray'
                      }
                    >
                      {row.event_type}
                    </Badge>
                  </DataTable.Td>
                  <DataTable.Td>{row.recipient || '—'}</DataTable.Td>
                  <DataTable.Td>{row.tenant_slug || '—'}</DataTable.Td>
                  <DataTable.Td>{row.subject || '—'}</DataTable.Td>
                  <DataTable.Td className="sd-table-muted">
                    {row.description || '—'}
                  </DataTable.Td>
                </DataTable.Tr>
              ))
            )}
          </DataTable.Tbody>
        </DataTable>
      </Paper>
    </Stack>
  )
}
