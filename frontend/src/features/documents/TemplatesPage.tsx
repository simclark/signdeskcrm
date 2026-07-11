import {
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  JsonInput,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api'

type Template = {
  id: number
  name: string
  document: number | null
  field_layout: unknown[]
  created_at: string
}

export function TemplatesPage() {
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const { data } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api<{ results: Template[] }>('/api/templates/'),
  })
  const form = useForm({
    initialValues: { name: '', field_layout: '[]' },
  })
  const create = useMutation({
    mutationFn: (values: { name: string; field_layout: string }) =>
      api('/api/templates/', {
        method: 'POST',
        json: { name: values.name, field_layout: JSON.parse(values.field_layout || '[]') },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      close()
      form.reset()
    },
  })

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Templates</Title>
          <Text c="dimmed">Reusable field layouts for faster sending.</Text>
        </div>
        <Button onClick={open}>New template</Button>
      </Group>
      {(data?.results || []).length === 0 ? (
        <Text c="dimmed">No templates yet. Save a layout to reuse across envelopes.</Text>
      ) : (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Fields</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.results || []).map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.name}</Table.Td>
                <Table.Td>{Array.isArray(t.field_layout) ? t.field_layout.length : 0}</Table.Td>
                <Table.Td>{new Date(t.created_at).toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal opened={opened} onClose={close} title="New template">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack>
            <TextInput label="Name" required {...form.getInputProps('name')} />
            <JsonInput
              label="Field layout JSON"
              validationError="Invalid JSON"
              formatOnBlur
              autosize
              minRows={4}
              {...form.getInputProps('field_layout')}
            />
            <Button type="submit">Save</Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}
