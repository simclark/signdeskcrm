import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'

type CadenceStep = {
  offset_days: number
  subject: string
  body: string
  order: number
}

type Cadence = {
  id: number
  name: string
  description: string
  is_active: boolean
  steps: CadenceStep[]
}

export function CadencesPage() {
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const form = useForm({
    initialValues: {
      name: '',
      description: '',
      step1_days: 0,
      step1_subject: 'Just checking in',
      step1_body: 'Hi {{contact_first_name}},\n\nWanted to check in. Let me know if you have questions.\n',
      step2_days: 14,
      step2_subject: 'Still here if you need me',
      step2_body: 'Hi {{contact_first_name}},\n\nFollowing up again — happy to help whenever you are ready.\n',
    },
  })

  const { data } = useQuery({
    queryKey: ['cadences'],
    queryFn: () => api<{ results: Cadence[] }>('/api/cadences/'),
  })

  const create = useMutation({
    mutationFn: (values: typeof form.values) =>
      api<Cadence>('/api/cadences/', {
        method: 'POST',
        json: {
          name: values.name,
          description: values.description,
          is_active: true,
          steps: [
            {
              order: 1,
              offset_days: values.step1_days,
              subject: values.step1_subject,
              body: values.step1_body,
            },
            {
              order: 2,
              offset_days: values.step2_days,
              subject: values.step2_subject,
              body: values.step2_body,
            },
          ],
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadences'] })
      close()
      form.reset()
      notifications.show({ color: 'forest', message: 'Cadence created' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not create cadence', message: err.message }),
  })

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Cadences</Title>
          <Text c="dimmed">
            Lightweight nurture sequences. Enroll contacts from their detail page. Placeholders:{' '}
            {'{{contact_first_name}}'}, {'{{contact_full_name}}'}.
          </Text>
        </div>
        <Button onClick={open}>New cadence</Button>
      </Group>

      {(data?.results || []).length === 0 ? (
        <Text c="dimmed">No cadences yet.</Text>
      ) : (
        <DataTable>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Steps</DataTable.Th>
              <DataTable.Th>Description</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {(data?.results || []).map((c) => (
              <DataTable.Tr key={c.id}>
                <DataTable.Td className="sd-table-primary">{c.name}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{c.steps?.length ?? 0}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{c.description || '—'}</DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      )}

      <Modal opened={opened} onClose={close} title="New cadence" size="lg">
        <Stack>
          <TextInput label="Name" required {...form.getInputProps('name')} />
          <Textarea label="Description" {...form.getInputProps('description')} />
          <Text fw={600} size="sm">
            Step 1
          </Text>
          <NumberInput label="Offset days" min={0} {...form.getInputProps('step1_days')} />
          <TextInput label="Subject" {...form.getInputProps('step1_subject')} />
          <Textarea label="Body" minRows={3} {...form.getInputProps('step1_body')} />
          <Text fw={600} size="sm">
            Step 2
          </Text>
          <NumberInput label="Offset days" min={0} {...form.getInputProps('step2_days')} />
          <TextInput label="Subject" {...form.getInputProps('step2_subject')} />
          <Textarea label="Body" minRows={3} {...form.getInputProps('step2_body')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate(form.values)} loading={create.isPending}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
