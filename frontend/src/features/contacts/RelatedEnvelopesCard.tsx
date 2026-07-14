import { Badge, Card, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { DataTable } from '../../shared/DataTable'

export type RelatedEnvelope = {
  id: number
  title: string
  status: string
  sent_at: string | null
  completed_at: string | null
  created_at: string
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ')
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type Props = {
  envelopes: RelatedEnvelope[] | undefined
  emptyMessage?: string
}

export function RelatedEnvelopesCard({
  envelopes,
  emptyMessage = 'No related envelopes yet.',
}: Props) {
  const items = envelopes || []

  return (
    <Card withBorder radius="lg" p="lg">
      <Title order={4} mb="md">
        Envelopes
      </Title>
      {items.length === 0 ? (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      ) : (
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Title</DataTable.Th>
              <DataTable.Th>Status</DataTable.Th>
              <DataTable.Th>Sent</DataTable.Th>
              <DataTable.Th>Completed</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {items.map((envelope) => (
              <DataTable.Tr key={envelope.id}>
                <DataTable.Td>
                  <Text
                    component={Link}
                    to={`/app/envelopes/${envelope.id}`}
                    className="sd-table-primary"
                  >
                    {envelope.title}
                  </Text>
                </DataTable.Td>
                <DataTable.Td>
                  <Badge variant="light" tt="capitalize">
                    {formatStatus(envelope.status)}
                  </Badge>
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">
                  {formatDate(envelope.sent_at)}
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">
                  {formatDate(envelope.completed_at)}
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      )}
    </Card>
  )
}
