import {
  Button,
  Group,
  Modal,
  Stack,
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
import { DataTable } from '../../shared/DataTable'
import { useCreateEnvelope } from '../envelopes/CreateEnvelopeContext'

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
  const { openCreateEnvelope } = useCreateEnvelope()
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
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Name</DataTable.Th>
            <DataTable.Th>Email</DataTable.Th>
            <DataTable.Th>Company</DataTable.Th>
            <DataTable.Th>Title</DataTable.Th>
            <DataTable.Th className="sd-table-actions" />
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {(data?.results || []).map((c) => (
            <DataTable.Tr key={c.id}>
              <DataTable.Td>
                <Text component={Link} to={`/app/contacts/${c.id}`} className="sd-table-primary">
                  {c.full_name}
                </Text>
              </DataTable.Td>
              <DataTable.Td className="sd-table-muted">{c.email}</DataTable.Td>
              <DataTable.Td>{c.company_name || '—'}</DataTable.Td>
              <DataTable.Td className="sd-table-muted">{c.title || '—'}</DataTable.Td>
              <DataTable.Td className="sd-table-actions">
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      openCreateEnvelope({
                        contact: c.id,
                        email: c.email,
                        name: c.full_name,
                      })
                    }
                  >
                    Send for signature
                  </Button>
                  <ActionIcon color="red" variant="subtle" onClick={() => remove.mutate(c.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </DataTable.Td>
            </DataTable.Tr>
          ))}
        </DataTable.Tbody>
      </DataTable>

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
