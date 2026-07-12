import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
  JsonInput,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'

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
          <Text size="sm" c="dimmed" mt={4}>
            Layout items: field_type, page, x, y, w, h, required, label, recipient_index (0-based).
          </Text>
        </div>
        <Button onClick={open}>New template</Button>
      </Group>
      {(data?.results || []).length === 0 ? (
        <Text c="dimmed">No templates yet. Save a layout to reuse across envelopes.</Text>
      ) : (
        <DataTable>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th className="sd-table-numeric">Fields</DataTable.Th>
              <DataTable.Th>Created</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {(data?.results || []).map((t) => (
              <DataTable.Tr key={t.id}>
                <DataTable.Td className="sd-table-primary">{t.name}</DataTable.Td>
                <DataTable.Td className="sd-table-numeric sd-table-muted">
                  {Array.isArray(t.field_layout) ? t.field_layout.length : 0}
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{formatDate(t.created_at, true)}</DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
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
