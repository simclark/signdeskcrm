import {
  Anchor,
  Button,
  Card,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { PageBreadcrumbs } from '../../shared/PageBreadcrumbs'
import { useCreateEnvelope } from '../envelopes/CreateEnvelopeContext'
import { ActivityFeed, type Activity } from './ActivityFeed'
import { RelatedEnvelopesCard, type RelatedEnvelope } from './RelatedEnvelopesCard'

type Company = {
  id: number
  name: string
  website: string
  notes: string
}

type Contact = {
  id: number
  full_name: string
  email: string
  title: string
}

export function CompanyDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const { openCreateEnvelope } = useCreateEnvelope()

  const { data: company } = useQuery({
    queryKey: ['company', id],
    queryFn: () => api<Company>(`/api/companies/${id}/`),
    enabled: !!id,
  })

  const { data: contactsData } = useQuery({
    queryKey: ['contacts', { company: id }],
    queryFn: () => api<{ results: Contact[] }>(`/api/contacts/?company=${id}`),
    enabled: !!id,
  })

  const { data: activities } = useQuery({
    queryKey: ['company-activities', id],
    queryFn: () => api<Activity[]>(`/api/companies/${id}/activities/`),
    enabled: !!id,
  })

  const { data: relatedEnvelopes } = useQuery({
    queryKey: ['company-envelopes', id],
    queryFn: () => api<RelatedEnvelope[]>(`/api/companies/${id}/envelopes/`),
    enabled: !!id,
  })

  const form = useForm({
    initialValues: { name: '', website: '', notes: '' },
  })

  const openEditModal = () => {
    if (!company) return
    form.setValues({
      name: company.name,
      website: company.website || '',
      notes: company.notes || '',
    })
    openEdit()
  }

  const update = useMutation({
    mutationFn: (values: typeof form.values) =>
      api(`/api/companies/${id}/`, { method: 'PATCH', json: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', id] })
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-activities', id] })
      closeEdit()
    },
  })

  if (!company) return null

  const contacts = contactsData?.results || []
  const websiteHref =
    company.website &&
    (company.website.startsWith('http') ? company.website : `https://${company.website}`)

  return (
    <Stack>
      <PageBreadcrumbs
        items={[
          { label: 'Companies', to: '/app/companies' },
          { label: company.name },
        ]}
      />
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{company.name}</Title>
          {websiteHref ? (
            <Anchor href={websiteHref} target="_blank" rel="noreferrer" c="dimmed" size="sm">
              {company.website}
            </Anchor>
          ) : (
            <Text c="dimmed" size="sm">
              No website
            </Text>
          )}
        </div>
        <Button variant="light" onClick={openEditModal}>
          Edit
        </Button>
      </Group>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Summary
        </Title>
        <Text size="sm" c="dimmed" mb="xs">
          Website
        </Text>
        <Text mb="md">{company.website || '—'}</Text>
        <Text size="sm" c="dimmed" mb="xs">
          Notes
        </Text>
        <Text>{company.notes || 'No notes yet.'}</Text>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Contacts
        </Title>
        {contacts.length === 0 ? (
          <Text c="dimmed" size="sm">
            No contacts linked to this company yet.
          </Text>
        ) : (
          <DataTable embedded>
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Name</DataTable.Th>
                <DataTable.Th>Email</DataTable.Th>
                <DataTable.Th>Title</DataTable.Th>
                <DataTable.Th className="sd-table-actions" />
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {contacts.map((c) => (
                <DataTable.Tr key={c.id}>
                  <DataTable.Td>
                    <Text
                      component={Link}
                      to={`/app/contacts/${c.id}`}
                      className="sd-table-primary"
                    >
                      {c.full_name}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td className="sd-table-muted">{c.email}</DataTable.Td>
                  <DataTable.Td className="sd-table-muted">{c.title || '—'}</DataTable.Td>
                  <DataTable.Td className="sd-table-actions">
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
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        )}
      </Card>

      <RelatedEnvelopesCard envelopes={relatedEnvelopes} />

      <ActivityFeed
        activities={activities}
        onAddNote={async (message) => {
          await api(`/api/companies/${id}/notes/`, { method: 'POST', json: { message } })
          await qc.invalidateQueries({ queryKey: ['company-activities', id] })
        }}
      />

      <Modal opened={editOpened} onClose={closeEdit} title="Edit company">
        <form onSubmit={form.onSubmit((v) => update.mutate(v))}>
          <Stack>
            <TextInput label="Name" required {...form.getInputProps('name')} />
            <TextInput label="Website" {...form.getInputProps('website')} />
            <Textarea label="Notes" minRows={3} {...form.getInputProps('notes')} />
            <Button type="submit" loading={update.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}
