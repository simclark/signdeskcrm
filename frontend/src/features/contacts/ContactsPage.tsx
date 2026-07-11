import {
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  ActionIcon,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconTrash } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'

type Contact = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  email: string
  phone: string
  title: string
  company: number | null
  company_name?: string
}

export function ContactsPage() {
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const { data } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api<{ results: Contact[] }>('/api/contacts/'),
  })
  const form = useForm({
    initialValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      title: '',
    },
  })
  const create = useMutation({
    mutationFn: (values: typeof form.values) =>
      api('/api/contacts/', { method: 'POST', json: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      close()
      form.reset()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/contacts/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Contacts</Title>
          <Text c="dimmed">People you send documents to.</Text>
        </div>
        <Button onClick={open}>Add contact</Button>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Company</Table.Th>
            <Table.Th>Title</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.results || []).map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td>
                <Text component={Link} to={`/app/contacts/${c.id}`} fw={500}>
                  {c.full_name}
                </Text>
              </Table.Td>
              <Table.Td>{c.email}</Table.Td>
              <Table.Td>{c.company_name || '—'}</Table.Td>
              <Table.Td>{c.title || '—'}</Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end">
                  <Button
                    size="xs"
                    variant="light"
                    component={Link}
                    to={`/app/envelopes/new?contact=${c.id}&email=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.full_name)}`}
                  >
                    Send for signature
                  </Button>
                  <ActionIcon color="red" variant="subtle" onClick={() => remove.mutate(c.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title="New contact">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack>
            <TextInput label="First name" required {...form.getInputProps('first_name')} />
            <TextInput label="Last name" {...form.getInputProps('last_name')} />
            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <TextInput label="Phone" {...form.getInputProps('phone')} />
            <TextInput label="Title" {...form.getInputProps('title')} />
            <Button type="submit" loading={create.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}
