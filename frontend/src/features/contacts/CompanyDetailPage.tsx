import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
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

function SummaryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
        {label}
      </Text>
      {children}
    </Stack>
  )
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
    <Stack gap="md">
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

      <Card withBorder radius="lg" p="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="sm">
          <SummaryField label="Website">
            {websiteHref ? (
              <Anchor href={websiteHref} target="_blank" rel="noreferrer" size="sm">
                {company.website}
              </Anchor>
            ) : (
              <Text size="sm" c="dimmed">
                —
              </Text>
            )}
          </SummaryField>
          <SummaryField label="Contacts">
            <Text size="sm">{contacts.length}</Text>
          </SummaryField>
        </SimpleGrid>
        {company.notes ? (
          <Stack
            gap={4}
            mt="md"
            pt="md"
            style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}
          >
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
              Notes
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {company.notes}
            </Text>
          </Stack>
        ) : null}
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder radius="lg" p="md">
          <Group justify="space-between" align="center" mb={contacts.length ? 'sm' : 0}>
            <Group gap="xs">
              <Title order={5}>Contacts</Title>
              <Badge size="sm" variant="light">
                {contacts.length}
              </Badge>
            </Group>
            <Button
              component={Link}
              to={`/app/contacts?company=${id}`}
              variant="subtle"
              size="compact-sm"
            >
              View all
            </Button>
          </Group>
          {contacts.length === 0 ? (
            <Text c="dimmed" size="sm" mt="xs">
              No contacts linked yet.
            </Text>
          ) : (
            <DataTable embedded verticalSpacing="sm" horizontalSpacing="sm">
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Name</DataTable.Th>
                  <DataTable.Th>Title</DataTable.Th>
                  <DataTable.Th className="sd-table-actions" />
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {contacts.map((c) => (
                  <DataTable.Tr key={c.id}>
                    <DataTable.Td>
                      <Stack gap={2}>
                        <Text
                          component={Link}
                          to={`/app/contacts/${c.id}`}
                          className="sd-table-primary"
                          size="sm"
                        >
                          {c.full_name}
                        </Text>
                        <Text size="xs" c="dimmed" className="sd-table-muted">
                          {c.email}
                        </Text>
                      </Stack>
                    </DataTable.Td>
                    <DataTable.Td className="sd-table-muted">
                      <Text size="sm">{c.title || '—'}</Text>
                    </DataTable.Td>
                    <DataTable.Td className="sd-table-actions">
                      <Button
                        size="compact-xs"
                        variant="light"
                        onClick={() =>
                          openCreateEnvelope({
                            contact: c.id,
                            email: c.email,
                            name: c.full_name,
                          })
                        }
                      >
                        Send
                      </Button>
                    </DataTable.Td>
                  </DataTable.Tr>
                ))}
              </DataTable.Tbody>
            </DataTable>
          )}
        </Card>

        <RelatedEnvelopesCard envelopes={relatedEnvelopes} />
      </SimpleGrid>

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
