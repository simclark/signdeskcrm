import { Badge, Button, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'

type FollowUp = {
  id: number
  contact: number
  contact_name: string
  title: string
  due_at: string
  status: string
  notes: string
}

export function FollowUpsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['follow-ups', 'due'],
    queryFn: () => api<{ results: FollowUp[] }>('/api/follow-ups/?due=true'),
  })
  const { data: openData } = useQuery({
    queryKey: ['follow-ups', 'open'],
    queryFn: () => api<{ results: FollowUp[] }>('/api/follow-ups/?status=open'),
  })

  const complete = useMutation({
    mutationFn: (id: number) =>
      api(`/api/follow-ups/${id}/complete/`, { method: 'POST', json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      notifications.show({ color: 'forest', message: 'Follow-up completed' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not complete', message: err.message }),
  })

  const rows = openData?.results || data?.results || []

  return (
    <Stack>
      <div>
        <Title order={2}>Follow-ups</Title>
        <Text c="dimmed">
          Outreach tasks for contacts who are not ready to sign yet. Schedule from a contact detail
          page.
        </Text>
      </div>
      {rows.length === 0 ? (
        <Text c="dimmed">No open follow-ups.</Text>
      ) : (
        <DataTable>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Contact</DataTable.Th>
              <DataTable.Th>Task</DataTable.Th>
              <DataTable.Th>Due</DataTable.Th>
              <DataTable.Th>Status</DataTable.Th>
              <DataTable.Th className="sd-table-actions" />
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {rows.map((t) => (
              <DataTable.Tr key={t.id}>
                <DataTable.Td className="sd-table-primary">
                  <Text component={Link} to={`/app/contacts/${t.contact}`} className="sd-table-primary">
                    {t.contact_name}
                  </Text>
                </DataTable.Td>
                <DataTable.Td>{t.title}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{formatDate(t.due_at, true)}</DataTable.Td>
                <DataTable.Td>
                  <Badge variant="light" color={t.status === 'open' ? 'orange' : 'gray'}>
                    {t.status}
                  </Badge>
                </DataTable.Td>
                <DataTable.Td className="sd-table-actions">
                  {t.status === 'open' ? (
                    <Button size="xs" variant="light" onClick={() => complete.mutate(t.id)}>
                      Complete
                    </Button>
                  ) : null}
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      )}
    </Stack>
  )
}
