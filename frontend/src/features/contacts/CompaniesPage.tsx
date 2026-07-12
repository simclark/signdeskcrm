import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconTrash } from '@tabler/icons-react'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'

type Company = { id: number; name: string; website: string; notes: string }

export function CompaniesPage() {
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const { data } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<{ results: Company[] }>('/api/companies/'),
  })
  const form = useForm({ initialValues: { name: '', website: '', notes: '' } })
  const create = useMutation({
    mutationFn: (values: typeof form.values) =>
      api('/api/companies/', { method: 'POST', json: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      close()
      form.reset()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/companies/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Companies</Title>
          <Text c="dimmed">Organizations linked to your contacts.</Text>
        </div>
        <Button onClick={open}>Add company</Button>
      </Group>
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Name</DataTable.Th>
            <DataTable.Th>Website</DataTable.Th>
            <DataTable.Th className="sd-table-actions" />
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {(data?.results || []).map((c) => (
            <DataTable.Tr key={c.id}>
              <DataTable.Td className="sd-table-primary">{c.name}</DataTable.Td>
              <DataTable.Td className="sd-table-muted">{c.website || '—'}</DataTable.Td>
              <DataTable.Td className="sd-table-actions">
                <ActionIcon color="red" variant="subtle" onClick={() => remove.mutate(c.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </DataTable.Td>
            </DataTable.Tr>
          ))}
        </DataTable.Tbody>
      </DataTable>
      <Modal opened={opened} onClose={close} title="New company">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack>
            <TextInput label="Name" required {...form.getInputProps('name')} />
            <TextInput label="Website" {...form.getInputProps('website')} />
            <TextInput label="Notes" {...form.getInputProps('notes')} />
            <Button type="submit">Save</Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}
