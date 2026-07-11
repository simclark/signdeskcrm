import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconTrash } from '@tabler/icons-react'
import { api } from '../../shared/api'

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
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Website</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.results || []).map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td>{c.name}</Table.Td>
              <Table.Td>{c.website || '—'}</Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="subtle" onClick={() => remove.mutate(c.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
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
