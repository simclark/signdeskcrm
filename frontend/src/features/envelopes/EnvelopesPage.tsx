import { Badge, Button, Group, Stack, Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'

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
      <Group justify="space-between">
        <div>
          <Title order={2}>Envelopes</Title>
          <Text c="dimmed">Draft, send, and track signature requests.</Text>
        </div>
        <Button component={Link} to="/app/envelopes/new">
          New envelope
        </Button>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Recipients</Table.Th>
            <Table.Th>Created</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.results || []).map((e) => (
            <Table.Tr key={e.id}>
              <Table.Td>
                <Text component={Link} to={`/app/envelopes/${e.id}`} fw={500}>
                  {e.title}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge variant="light">{e.status}</Badge>
              </Table.Td>
              <Table.Td>{e.recipient_count}</Table.Td>
              <Table.Td>{new Date(e.created_at).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}
