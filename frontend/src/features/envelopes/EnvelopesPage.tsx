import { Badge, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'

type Envelope = {
  id: number
  title: string
  status: string
  recipient_count: number
  created_at: string
}

export function EnvelopesPage() {
  const { data } = useQuery({
    queryKey: ['envelopes'],
    queryFn: () => api<{ results: Envelope[] }>('/api/envelopes/'),
  })

  return (
    <Stack>
      <div>
        <Title order={2}>Envelopes</Title>
        <Text c="dimmed">Draft, send, and track signature requests.</Text>
      </div>
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Title</DataTable.Th>
            <DataTable.Th>Status</DataTable.Th>
            <DataTable.Th className="sd-table-numeric">Recipients</DataTable.Th>
            <DataTable.Th>Created</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {(data?.results || []).map((e) => (
            <DataTable.Tr key={e.id}>
              <DataTable.Td>
                <Text component={Link} to={`/app/envelopes/${e.id}`} className="sd-table-primary">
                  {e.title}
                </Text>
              </DataTable.Td>
              <DataTable.Td>
                <Badge variant="light" tt="capitalize">
                  {e.status.replaceAll('_', ' ')}
                </Badge>
              </DataTable.Td>
              <DataTable.Td className="sd-table-numeric sd-table-muted">{e.recipient_count}</DataTable.Td>
              <DataTable.Td className="sd-table-muted">{formatDate(e.created_at, true)}</DataTable.Td>
            </DataTable.Tr>
          ))}
        </DataTable.Tbody>
      </DataTable>
    </Stack>
  )
}
