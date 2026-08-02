import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
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
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../../shared/api'
import { useConfirm } from '../../shared/confirm'
import { DataTable } from '../../shared/DataTable'
import { useCreateEnvelope } from '../envelopes/CreateEnvelopeContext'
import { useCompaniesOptions } from './useCompaniesOptions'

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

function contactsListUrl(search: string, company: string | null) {
  const params = new URLSearchParams()
  if (search.trim()) params.set('search', search.trim())
  if (company) params.set('company', company)
  const qs = params.toString()
  return qs ? `/api/contacts/?${qs}` : '/api/contacts/'
}

export function ContactsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [searchParams] = useSearchParams()
  const [opened, { open, close }] = useDisclosure(false)
  const { openCreateEnvelope } = useCreateEnvelope()
  const companyOptions = useCompaniesOptions()
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 300)
  const [companyFilter, setCompanyFilter] = useState<string | null>(
    () => searchParams.get('company'),
  )

  const { data } = useQuery({
    queryKey: ['contacts', { search: debouncedSearch.trim(), company: companyFilter }],
    queryFn: () =>
      api<{ results: Contact[] }>(contactsListUrl(debouncedSearch, companyFilter)),
  })

  const form = useForm({
    initialValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      title: '',
      company: null as string | null,
      notes: '',
    },
  })

  const create = useMutation({
    mutationFn: (values: typeof form.values) =>
      api('/api/contacts/', {
        method: 'POST',
        json: {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone,
          title: values.title,
          notes: values.notes,
          company: values.company ? Number(values.company) : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      close()
      form.reset()
    },
    onError: (err) => {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, unknown>
        const fieldErrors: Record<string, string> = {}
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value) && value[0]) fieldErrors[key] = String(value[0])
        }
        if (Object.keys(fieldErrors).length) form.setErrors(fieldErrors)
      }
      notifications.show({
        color: 'red',
        title: 'Could not create contact',
        message: err instanceof ApiError ? err.message : 'Could not create contact',
      })
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/contacts/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })

  async function confirmRemove(contact: Contact) {
    const ok = await confirm({
      title: 'Delete contact',
      message: `Delete “${contact.full_name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) remove.mutate(contact.id)
  }

  const rows = data?.results || []

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Contacts</Title>
          <Text c="dimmed">People you send documents to.</Text>
        </div>
        <Button onClick={open}>Add contact</Button>
      </Group>

      <Group align="flex-end" grow>
        <TextInput
          placeholder="Search contacts…"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          placeholder="Filter by company"
          data={companyOptions}
          value={companyFilter}
          onChange={setCompanyFilter}
          clearable
          searchable
        />
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
          {rows.length === 0 ? (
            <DataTable.Tr>
              <DataTable.Td colSpan={5}>
                <Text c="dimmed" size="sm">
                  No contacts yet.
                </Text>
              </DataTable.Td>
            </DataTable.Tr>
          ) : (
            rows.map((c) => (
              <DataTable.Tr key={c.id}>
                <DataTable.Td>
                  <Text component={Link} to={`/app/contacts/${c.id}`} className="sd-table-primary">
                    {c.full_name}
                  </Text>
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{c.email}</DataTable.Td>
                <DataTable.Td>
                  {c.company && c.company_name ? (
                    <Text
                      component={Link}
                      to={`/app/companies/${c.company}`}
                      className="sd-table-primary"
                    >
                      {c.company_name}
                    </Text>
                  ) : (
                    '—'
                  )}
                </DataTable.Td>
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
                    <ActionIcon color="red" variant="subtle" onClick={() => void confirmRemove(c)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </DataTable.Td>
              </DataTable.Tr>
            ))
          )}
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
            <Select
              label="Company"
              data={companyOptions}
              clearable
              searchable
              {...form.getInputProps('company')}
            />
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
