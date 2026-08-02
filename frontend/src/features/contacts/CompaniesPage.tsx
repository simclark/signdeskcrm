import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconSearch, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../shared/api'
import { useConfirm } from '../../shared/confirm'
import { DataTable } from '../../shared/DataTable'

type Company = { id: number; name: string; website: string; notes: string }

export function CompaniesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [opened, { open, close }] = useDisclosure(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 300)

  const listUrl =
    debouncedSearch.trim().length > 0
      ? `/api/companies/?search=${encodeURIComponent(debouncedSearch.trim())}`
      : '/api/companies/'

  const { data } = useQuery({
    queryKey: ['companies', { search: debouncedSearch.trim() }],
    queryFn: () => api<{ results: Company[] }>(listUrl),
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
    onError: (err) => {
      notifications.show({
        color: 'red',
        title: 'Could not create company',
        message: err instanceof ApiError ? err.message : 'Could not create company',
      })
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/companies/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })

  async function confirmRemove(company: Company) {
    const ok = await confirm({
      title: 'Delete company',
      message: `Delete “${company.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) remove.mutate(company.id)
  }

  const rows = data?.results || []

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Companies</Title>
          <Text c="dimmed">Organizations linked to your contacts.</Text>
        </div>
        <Button onClick={open}>Add company</Button>
      </Group>

      <TextInput
        placeholder="Search companies…"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Name</DataTable.Th>
            <DataTable.Th>Website</DataTable.Th>
            <DataTable.Th className="sd-table-actions" />
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {rows.length === 0 ? (
            <DataTable.Tr>
              <DataTable.Td colSpan={3}>
                <Text c="dimmed" size="sm">
                  No companies yet.
                </Text>
              </DataTable.Td>
            </DataTable.Tr>
          ) : (
            rows.map((c) => (
              <DataTable.Tr key={c.id}>
                <DataTable.Td>
                  <Text component={Link} to={`/app/companies/${c.id}`} className="sd-table-primary">
                    {c.name}
                  </Text>
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{c.website || '—'}</DataTable.Td>
                <DataTable.Td className="sd-table-actions">
                  <ActionIcon color="red" variant="subtle" onClick={() => void confirmRemove(c)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </DataTable.Td>
              </DataTable.Tr>
            ))
          )}
        </DataTable.Tbody>
      </DataTable>

      <Modal opened={opened} onClose={close} title="New company">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack>
            <TextInput label="Name" required {...form.getInputProps('name')} />
            <TextInput label="Website" {...form.getInputProps('website')} />
            <Textarea label="Notes" minRows={3} {...form.getInputProps('notes')} />
            <Button type="submit" loading={create.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}
