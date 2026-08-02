import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  TagsInput,
  Divider,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../../shared/api'
import { PageBreadcrumbs } from '../../shared/PageBreadcrumbs'
import { useCreateEnvelope } from '../envelopes/CreateEnvelopeContext'
import { ActivityFeed, type Activity } from './ActivityFeed'
import { RelatedEnvelopesCard, type RelatedEnvelope } from './RelatedEnvelopesCard'
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
  company_name?: string | null
  notes: string
  stage: string
  tags: string[]
  next_follow_up_at: string | null
}

const STAGE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'closed', label: 'Closed' },
  { value: 'inactive', label: 'Inactive' },
]

function formatFollowUp(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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

export function ContactDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const [followOpened, { open: openFollow, close: closeFollow }] = useDisclosure(false)
  const { openCreateEnvelope } = useCreateEnvelope()
  const companyOptions = useCompaniesOptions()

  const { data: contact } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => api<Contact>(`/api/contacts/${id}/`),
    enabled: !!id,
  })

  const { data: activities } = useQuery({
    queryKey: ['contact-activities', id],
    queryFn: () => api<Activity[]>(`/api/contacts/${id}/activities/`),
    enabled: !!id,
  })

  const { data: relatedEnvelopes } = useQuery({
    queryKey: ['contact-envelopes', id],
    queryFn: () => api<RelatedEnvelope[]>(`/api/contacts/${id}/envelopes/`),
    enabled: !!id,
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
      stage: 'lead',
      tags: [] as string[],
    },
  })

  const followForm = useForm({
    initialValues: {
      title: 'Follow up',
      due_at: '',
      notes: '',
    },
  })

  const openEditModal = () => {
    if (!contact) return
    form.setValues({
      first_name: contact.first_name,
      last_name: contact.last_name || '',
      email: contact.email,
      phone: contact.phone || '',
      title: contact.title || '',
      company: contact.company != null ? String(contact.company) : null,
      notes: contact.notes || '',
      stage: contact.stage || 'lead',
      tags: contact.tags || [],
    })
    openEdit()
  }

  const update = useMutation({
    mutationFn: (values: typeof form.values) =>
      api(`/api/contacts/${id}/`, {
        method: 'PATCH',
        json: {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone,
          title: values.title,
          notes: values.notes,
          stage: values.stage,
          tags: values.tags,
          company: values.company ? Number(values.company) : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', id] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact-activities', id] })
      closeEdit()
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
        title: 'Could not update contact',
        message: err instanceof ApiError ? err.message : 'Could not update contact',
      })
    },
  })

  const scheduleFollowUp = useMutation({
    mutationFn: (values: typeof followForm.values) => {
      if (!values.due_at) throw new Error('Choose a due date')
      return api(`/api/contacts/${id}/schedule-follow-up/`, {
        method: 'POST',
        json: {
          title: values.title,
          due_at: new Date(values.due_at).toISOString(),
          notes: values.notes,
        },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', id] })
      qc.invalidateQueries({ queryKey: ['contact-activities', id] })
      qc.invalidateQueries({ queryKey: ['follow-ups'] })
      closeFollow()
      followForm.reset()
      notifications.show({ color: 'forest', message: 'Follow-up scheduled' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not schedule', message: err.message }),
  })

  if (!contact) return null

  return (
    <Stack>
      <PageBreadcrumbs
        items={[
          { label: 'Contacts', to: '/app/contacts' },
          { label: contact.full_name },
        ]}
      />
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm" align="center" mb={4}>
            <Title order={2}>{contact.full_name}</Title>
            <Badge tt="none" variant="light">
              {STAGE_OPTIONS.find((s) => s.value === contact.stage)?.label ||
                contact.stage ||
                'Lead'}
            </Badge>
          </Group>
          <Text c="dimmed" size="sm">
            {contact.email}
          </Text>
        </div>
        <Group>
          <Button variant="light" onClick={openFollow}>
            Schedule follow-up
          </Button>
          <Button variant="light" onClick={openEditModal}>
            Edit
          </Button>
          <Button
            onClick={() =>
              openCreateEnvelope({
                contact: contact.id,
                email: contact.email,
                name: contact.full_name,
              })
            }
          >
            Send for signature
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="lg" p="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" verticalSpacing="sm">
          <SummaryField label="Title">
            <Text size="sm" c={contact.title ? undefined : 'dimmed'}>
              {contact.title || '—'}
            </Text>
          </SummaryField>
          <SummaryField label="Phone">
            <Text size="sm" c={contact.phone ? undefined : 'dimmed'}>
              {contact.phone || '—'}
            </Text>
          </SummaryField>
          <SummaryField label="Company">
            {contact.company && contact.company_name ? (
              <Text
                component={Link}
                to={`/app/companies/${contact.company}`}
                className="sd-table-primary"
                size="sm"
              >
                {contact.company_name}
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                —
              </Text>
            )}
          </SummaryField>
          <SummaryField label="Next follow-up">
            <Text size="sm" c={contact.next_follow_up_at ? undefined : 'dimmed'}>
              {formatFollowUp(contact.next_follow_up_at) || '—'}
            </Text>
          </SummaryField>
          <SummaryField label="Tags">
            {(contact.tags || []).length ? (
              <Group gap={6}>
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="outline" tt="none" size="sm">
                    {tag}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                —
              </Text>
            )}
          </SummaryField>
        </SimpleGrid>
        {contact.notes ? (
          <Stack gap={4} mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
              Notes
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {contact.notes}
            </Text>
          </Stack>
        ) : null}
      </Card>

      <RelatedEnvelopesCard envelopes={relatedEnvelopes} />

      <ActivityFeed
        activities={activities}
        onAddNote={async (message) => {
          await api(`/api/contacts/${id}/notes/`, { method: 'POST', json: { message } })
          await qc.invalidateQueries({ queryKey: ['contact-activities', id] })
        }}
      />

      <Modal
        opened={editOpened}
        onClose={closeEdit}
        title="Edit contact"
        size="lg"
        centered
      >
        <form onSubmit={form.onSubmit((v) => update.mutate(v))}>
          <Stack gap="md">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4} mb="xs">
                Identity
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput
                  label="First name"
                  required
                  {...form.getInputProps('first_name')}
                />
                <TextInput label="Last name" {...form.getInputProps('last_name')} />
                <TextInput
                  label="Email"
                  type="email"
                  required
                  {...form.getInputProps('email')}
                />
                <TextInput label="Phone" {...form.getInputProps('phone')} />
              </SimpleGrid>
            </div>

            <Divider />

            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4} mb="xs">
                Role
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput label="Title" {...form.getInputProps('title')} />
                <Select
                  label="Company"
                  data={companyOptions}
                  clearable
                  searchable
                  {...form.getInputProps('company')}
                />
              </SimpleGrid>
            </div>

            <Divider />

            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4} mb="xs">
                Pipeline
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Select
                  label="Stage"
                  data={STAGE_OPTIONS}
                  {...form.getInputProps('stage')}
                />
                <TagsInput
                  label="Tags"
                  placeholder="Add tag"
                  {...form.getInputProps('tags')}
                />
              </SimpleGrid>
            </div>

            <Textarea
              label="Notes"
              minRows={3}
              autosize
              maxRows={6}
              {...form.getInputProps('notes')}
            />

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={closeEdit} disabled={update.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending}>
                Save changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={followOpened} onClose={closeFollow} title="Schedule follow-up">
        <Stack>
          <TextInput label="Title" {...followForm.getInputProps('title')} />
          <TextInput
            label="Due at"
            type="datetime-local"
            {...followForm.getInputProps('due_at')}
          />
          <Textarea label="Notes" {...followForm.getInputProps('notes')} />
          <Button
            onClick={() => scheduleFollowUp.mutate(followForm.values)}
            loading={scheduleFollowUp.isPending}
          >
            Schedule
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
