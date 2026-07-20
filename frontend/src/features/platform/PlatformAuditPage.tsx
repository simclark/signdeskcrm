import { Code, Stack, Text, TextInput, Title, Group, Button } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'

type OpsEvent = {
  id: number
  actor_email: string
  action: string
  tenant_id: number | null
  tenant_slug: string
  metadata: Record<string, unknown>
  created_at: string
}

export function PlatformAuditPage() {
  const [slug, setSlug] = useState('')
  const [action, setAction] = useState('')
  const [debouncedSlug] = useDebouncedValue(slug, 300)
  const [debouncedAction] = useDebouncedValue(action, 300)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-ops-events', debouncedSlug, debouncedAction],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSlug.trim()) params.set('slug', debouncedSlug.trim())
      if (debouncedAction.trim()) params.set('action', debouncedAction.trim())
      const qs = params.toString()
      return api<OpsEvent[] | { results: OpsEvent[] }>(
        `/api/platform/ops-events/${qs ? `?${qs}` : ''}`,
      )
    },
  })

  const rows = Array.isArray(data) ? data : data?.results || []

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>Ops audit log</Title>
          <Text c="dimmed" size="sm">
            Append-only record of staff platform actions.
          </Text>
        </Stack>
        <Button variant="light" onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      </Group>

      <Group>
        <TextInput
          placeholder="Filter by tenant slug"
          value={slug}
          onChange={(e) => setSlug(e.currentTarget.value)}
          w={220}
        />
        <TextInput
          placeholder="Filter by action (e.g. provision)"
          value={action}
          onChange={(e) => setAction(e.currentTarget.value)}
          w={260}
        />
      </Group>

      <DataTable embedded>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>When</DataTable.Th>
            <DataTable.Th>Action</DataTable.Th>
            <DataTable.Th>Tenant</DataTable.Th>
            <DataTable.Th>Actor</DataTable.Th>
            <DataTable.Th>Metadata</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {isLoading ? (
            <DataTable.Tr>
              <DataTable.Td colSpan={5}>
                <Text c="dimmed">Loading…</Text>
              </DataTable.Td>
            </DataTable.Tr>
          ) : rows.length === 0 ? (
            <DataTable.Tr>
              <DataTable.Td colSpan={5}>
                <Text c="dimmed">No events yet.</Text>
              </DataTable.Td>
            </DataTable.Tr>
          ) : (
            rows.map((ev) => (
              <DataTable.Tr key={ev.id}>
                <DataTable.Td className="sd-table-muted">
                  {new Date(ev.created_at).toLocaleString()}
                </DataTable.Td>
                <DataTable.Td>
                  <Code>{ev.action}</Code>
                </DataTable.Td>
                <DataTable.Td>{ev.tenant_slug || '—'}</DataTable.Td>
                <DataTable.Td>{ev.actor_email || '—'}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">
                  <Code style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
                    {JSON.stringify(ev.metadata || {})}
                  </Code>
                </DataTable.Td>
              </DataTable.Tr>
            ))
          )}
        </DataTable.Tbody>
      </DataTable>
    </Stack>
  )
}
