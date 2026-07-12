import { Button, Card, NumberInput, Stack, TextInput, Title, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { useAuth } from '../auth/AuthContext'
import { notifications } from '@mantine/notifications'

export function SettingsPage() {
  const { tenant, membership, refreshMe } = useAuth()
  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ results?: any[] } | any[]>('/api/tenant/members/'),
  })
  const form = useForm({
    initialValues: {
      name: tenant?.name || '',
      accent_color: tenant?.accent_color || '#0B6E4F',
      timezone: tenant?.timezone || 'UTC',
      default_expiration_days: tenant?.default_expiration_days || 14,
    },
  })

  const save = useMutation({
    mutationFn: (values: typeof form.values) =>
      api('/api/tenant/settings/', { method: 'PATCH', json: values }),
    onSuccess: async () => {
      await refreshMe()
      notifications.show({ color: 'forest', message: 'Settings saved' })
    },
  })

  const memberRows = Array.isArray(members) ? members : members?.results || []

  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <Text c="dimmed">Workspace branding and defaults. Role: {membership?.role}</Text>
      <Card withBorder radius="lg" p="lg">
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack>
            <TextInput label="Workspace name" {...form.getInputProps('name')} />
            <TextInput label="Accent color" {...form.getInputProps('accent_color')} />
            <TextInput label="Timezone" {...form.getInputProps('timezone')} />
            <NumberInput
              label="Default expiration (days)"
              {...form.getInputProps('default_expiration_days')}
            />
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Card>
      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Members
        </Title>
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Email</DataTable.Th>
              <DataTable.Th>Role</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {memberRows.map((m: any) => (
              <DataTable.Tr key={m.id}>
                <DataTable.Td className="sd-table-primary">{m.full_name}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{m.email}</DataTable.Td>
                <DataTable.Td>
                  <Text tt="capitalize" size="sm">
                    {m.role}
                  </Text>
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      </Card>
    </Stack>
  )
}
