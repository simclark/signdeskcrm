import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  TagsInput,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../shared/api'
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

type Cadence = { id: number; name: string }

const STAGE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'active', label: 'Active' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'closed', label: 'Closed' },
  { value: 'inactive', label: 'Inactive' },
]

export function ContactDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const [followOpened, { open: openFollow, close: closeFollow }] = useDisclosure(false)
  const [cadenceOpened, { open: openCadence, close: closeCadence }] = useDisclosure(false)
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

  const { data: cadences } = useQuery({
    queryKey: ['cadences'],
    queryFn: () => api<{ results: Cadence[] }>('/api/cadences/'),
    enabled: cadenceOpened,
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

  const [cadenceId, setCadenceId] = useState<string | null>(null)

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

  const enrollCadence = useMutation({
    mutationFn: () => {
      if (!cadenceId) throw new Error('Choose a cadence')
      return api(`/api/cadences/${cadenceId}/enroll/`, {
        method: 'POST',
        json: { contact: Number(id) },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-activities', id] })
      closeCadence()
      setCadenceId(null)
      notifications.show({ color: 'forest', message: 'Enrolled in cadence' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not enroll', message: err.message }),
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
          <Title order={2}>{contact.full_name}</Title>
          <Text c="dimmed">{contact.email}</Text>
        </div>
        <Group>
          <Button variant="light" onClick={openFollow}>
            Schedule follow-up
          </Button>
          <Button variant="light" onClick={openCadence}>
            Enroll in cadence
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

      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Summary
        </Title>
        <Text size="sm" c="dimmed" mb="xs">
          Stage
        </Text>
        <Badge mb="md" tt="none" variant="light">
          {STAGE_OPTIONS.find((s) => s.value === contact.stage)?.label || contact.stage || 'Lead'}
        </Badge>
        <Text size="sm" c="dimmed" mb="xs">
          Tags
        </Text>
        <Group gap="xs" mb="md">
          {(contact.tags || []).length ? (
            contact.tags.map((tag) => (
              <Badge key={tag} variant="outline" tt="none">
                {tag}
              </Badge>
            ))
          ) : (
            <Text c="dimmed">—</Text>
          )}
        </Group>
        <Text size="sm" c="dimmed" mb="xs">
          Next follow-up
        </Text>
        <Text mb="md" c={contact.next_follow_up_at ? undefined : 'dimmed'}>
          {contact.next_follow_up_at
            ? new Date(contact.next_follow_up_at).toLocaleString()
            : '—'}
        </Text>
        {contact.title ? (
          <>
            <Text size="sm" c="dimmed" mb="xs">
              Title
            </Text>
            <Badge mb="md" tt="none">
              {contact.title}
            </Badge>
          </>
        ) : null}
        <Text size="sm" c="dimmed" mb="xs">
          Phone
        </Text>
        <Text mb="md" c={contact.phone ? undefined : 'dimmed'}>
          {contact.phone || '—'}
        </Text>
        <Text size="sm" c="dimmed" mb="xs">
          Company
        </Text>
        {contact.company && contact.company_name ? (
          <Text
            component={Link}
            to={`/app/companies/${contact.company}`}
            className="sd-table-primary"
            mb="md"
          >
            {contact.company_name}
          </Text>
        ) : (
          <Text mb="md" c="dimmed">
            —
          </Text>
        )}
        <Text size="sm" c="dimmed" mb="xs">
          Notes
        </Text>
        <Text c={contact.notes ? undefined : 'dimmed'}>
          {contact.notes || 'No notes yet.'}
        </Text>
      </Card>

      <RelatedEnvelopesCard envelopes={relatedEnvelopes} />

      <ActivityFeed
        activities={activities}
        onAddNote={async (message) => {
          await api(`/api/contacts/${id}/notes/`, { method: 'POST', json: { message } })
          await qc.invalidateQueries({ queryKey: ['contact-activities', id] })
        }}
      />

      <Modal opened={editOpened} onClose={closeEdit} title="Edit contact">
        <form onSubmit={form.onSubmit((v) => update.mutate(v))}>
          <Stack>
            <TextInput label="First name" required {...form.getInputProps('first_name')} />
            <TextInput label="Last name" {...form.getInputProps('last_name')} />
            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <TextInput label="Phone" {...form.getInputProps('phone')} />
            <TextInput label="Title" {...form.getInputProps('title')} />
            <Select label="Stage" data={STAGE_OPTIONS} {...form.getInputProps('stage')} />
            <TagsInput label="Tags" {...form.getInputProps('tags')} />
            <Select
              label="Company"
              data={companyOptions}
              clearable
              searchable
              {...form.getInputProps('company')}
            />
            <Textarea label="Notes" minRows={3} {...form.getInputProps('notes')} />
            <Button type="submit" loading={update.isPending}>
              Save
            </Button>
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

      <Modal opened={cadenceOpened} onClose={closeCadence} title="Enroll in cadence">
        <Stack>
          <Select
            label="Cadence"
            data={(cadences?.results || []).map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
            value={cadenceId}
            onChange={setCadenceId}
          />
          <Button onClick={() => enrollCadence.mutate()} loading={enrollCadence.isPending}>
            Enroll
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
