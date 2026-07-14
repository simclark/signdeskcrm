import {
  Button,
  FileButton,
  Group,
  Modal,
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
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'
import { useAuth } from '../auth/AuthContext'

type Listing = {
  id: number
  address: string
  city: string
  state: string
  postal_code: string
  mls_number: string
  price: string
  full_address: string
  source: string
  created_at: string
}

export function ListingsPage() {
  const { tenant, membership } = useAuth()
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const form = useForm({
    initialValues: {
      address: '',
      city: '',
      state: '',
      postal_code: '',
      mls_number: '',
      price: '',
      description: '',
    },
  })

  const listingsEnabled = Boolean(tenant?.listings_enabled)
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  const { data } = useQuery({
    queryKey: ['listings'],
    queryFn: () => api<{ results: Listing[] }>('/api/listings/'),
    enabled: listingsEnabled,
  })

  const create = useMutation({
    mutationFn: (values: typeof form.values) =>
      api<Listing>('/api/listings/', { method: 'POST', json: { ...values, source: 'manual' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] })
      close()
      form.reset()
      notifications.show({ color: 'forest', message: 'Listing created' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not create listing', message: err.message }),
  })

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('source', 'csv')
      return api<{ created: number; updated: number; errors: string[] }>(
        '/api/listings/import-csv/',
        { method: 'POST', formData: fd },
      )
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['listings'] })
      notifications.show({
        color: 'forest',
        message: `Imported ${result.created} new, updated ${result.updated}${
          result.errors.length ? ` (${result.errors.length} row errors)` : ''
        }`,
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'CSV import failed', message: err.message }),
  })

  if (!listingsEnabled) {
    return (
      <Stack>
        <Title order={2}>Listings</Title>
        <Text c="dimmed" maw={560}>
          Prefill records are turned off for this workspace.
          {isAdmin
            ? ' Enable them under Settings → Modules when your team needs listing-style merge data.'
            : ' Ask a workspace admin to enable Prefill records if you need them.'}
        </Text>
        {isAdmin ? (
          <Button component={Link} to="/app/administration/settings" w="fit-content">
            Open Settings
          </Button>
        ) : (
          <Button component={Link} to="/app" variant="light" w="fit-content">
            Back to dashboard
          </Button>
        )}
      </Stack>
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Listings</Title>
          <Text c="dimmed">
            Prefill records for merge fields on envelopes. Import a CSV export or add records
            manually.
          </Text>
        </div>
        <Group>
          <FileButton
            onChange={(file) => file && importCsv.mutate(file)}
            accept=".csv,text/csv"
          >
            {(props) => (
              <Button {...props} variant="light" loading={importCsv.isPending}>
                Import CSV
              </Button>
            )}
          </FileButton>
          <Button onClick={open}>Add listing</Button>
        </Group>
      </Group>

      {(data?.results || []).length === 0 ? (
        <Text c="dimmed">No listings yet.</Text>
      ) : (
        <DataTable>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Address</DataTable.Th>
              <DataTable.Th>MLS #</DataTable.Th>
              <DataTable.Th>Price</DataTable.Th>
              <DataTable.Th>Source</DataTable.Th>
              <DataTable.Th>Added</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {(data?.results || []).map((l) => (
              <DataTable.Tr key={l.id}>
                <DataTable.Td className="sd-table-primary">{l.full_address}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{l.mls_number || '—'}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{l.price || '—'}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{l.source || '—'}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{formatDate(l.created_at, true)}</DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      )}

      <Modal opened={opened} onClose={close} title="Add listing">
        <Stack>
          <TextInput label="Address" required {...form.getInputProps('address')} />
          <Group grow>
            <TextInput label="City" {...form.getInputProps('city')} />
            <TextInput label="State" {...form.getInputProps('state')} />
            <TextInput label="Postal code" {...form.getInputProps('postal_code')} />
          </Group>
          <Group grow>
            <TextInput label="MLS number" {...form.getInputProps('mls_number')} />
            <TextInput label="Price" {...form.getInputProps('price')} />
          </Group>
          <Textarea label="Description" minRows={2} {...form.getInputProps('description')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate(form.values)} loading={create.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
