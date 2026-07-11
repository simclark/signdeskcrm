import { Button, Card, NumberInput, Stack, TextInput, Title, Text, Table } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
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
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {memberRows.map((m: any) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.full_name}</Table.Td>
                <Table.Td>{m.email}</Table.Td>
                <Table.Td>{m.role}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}
