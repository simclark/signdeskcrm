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
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
}

export function ContactDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false)
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
    </Stack>
  )
}
