import { Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { usePlatformCaps } from './platformCaps'

type StaffRow = {
  id: number
  email: string
  full_name: string
  is_superuser: boolean
  platform_role: string
  is_active: boolean
}

export function PlatformStaffPage() {
  const { can } = usePlatformCaps()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['platform-staff'],
    queryFn: () => api<StaffRow[]>('/api/platform/staff/'),
    enabled: can('admin'),
  })

  const saveRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api('/api/platform/staff/', {
        method: 'PATCH',
        json: { user_id: userId, platform_role: role },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-staff'] })
      notifications.show({ color: 'forest', message: 'Role updated' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not update role',
      })
    },
  })

  if (!can('admin')) {
    return <Text c="dimmed">Admin role required to manage platform staff.</Text>
  }

  const rows = data || []

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Platform team</Title>
        <Text c="dimmed" size="sm">
          Assign Viewer, Support, Operator, or Admin. See docs/ops/PLATFORM_OPS.md.
        </Text>
      </div>
      <Paper withBorder p="md" radius="md">
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Email</DataTable.Th>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Role</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {isLoading ? (
              <DataTable.Tr>
                <DataTable.Td colSpan={3}>
                  <Text c="dimmed">Loading…</Text>
                </DataTable.Td>
              </DataTable.Tr>
            ) : (
              rows.map((row) => (
                <DataTable.Tr key={row.id}>
                  <DataTable.Td>{row.email}</DataTable.Td>
                  <DataTable.Td>{row.full_name}</DataTable.Td>
                  <DataTable.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Select
                        size="xs"
                        w={140}
                        data={[
                          { value: 'viewer', label: 'Viewer' },
                          { value: 'support', label: 'Support' },
                          { value: 'operator', label: 'Operator' },
                          { value: 'admin', label: 'Admin' },
                        ]}
                        value={drafts[row.id] ?? row.platform_role}
                        disabled={row.is_superuser}
                        onChange={(v) => {
                          if (!v) return
                          setDrafts((d) => ({ ...d, [row.id]: v }))
                        }}
                      />
                      <Button
                        size="compact-xs"
                        disabled={
                          row.is_superuser ||
                          (drafts[row.id] ?? row.platform_role) === row.platform_role
                        }
                        loading={saveRole.isPending}
                        onClick={() =>
                          saveRole.mutate({
                            userId: row.id,
                            role: drafts[row.id] ?? row.platform_role,
                          })
                        }
                      >
                        Save
                      </Button>
                    </Group>
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
