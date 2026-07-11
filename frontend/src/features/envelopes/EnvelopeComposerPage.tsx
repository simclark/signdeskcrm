import {
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  ColorSwatch,
  SimpleGrid,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../shared/api'
import { notifications } from '@mantine/notifications'

type Document = { id: number; title: string; current_version?: { page_count: number } }
type RecipientDraft = {
  name: string
  email: string
  role: string
  routing_order: number
  contact?: number | null
}
type FieldDraft = {
  recipientIndex: number
  field_type: string
  page: number
  x: number
  y: number
  w: number
  h: number
  required: boolean
  label: string
}

const COLORS = ['#0B6E4F', '#E07A5F', '#3D5A80', '#9B5DE5', '#F4A261']

export function EnvelopeComposerPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: docs } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ results: Document[] }>('/api/documents/'),
  })

  const initialRecipient: RecipientDraft = {
    name: params.get('name') || '',
    email: params.get('email') || '',
    role: 'signer',
    routing_order: 1,
    contact: params.get('contact') ? Number(params.get('contact')) : null,
  }

  const form = useForm({
    initialValues: {
      title: '',
      message: '',
      routing: 'sequential',
      document: '',
    },
  })
  const [recipients, setRecipients] = useState<RecipientDraft[]>(
    initialRecipient.email ? [initialRecipient] : [{ name: '', email: '', role: 'signer', routing_order: 1 }],
  )
  const [fields, setFields] = useState<FieldDraft[]>([])

  const selectedDoc = useMemo(
    () => docs?.results.find((d) => String(d.id) === form.values.document),
    [docs, form.values.document],
  )

  const create = useMutation({
    mutationFn: async () => {
      const createdRecipients = recipients.map((r, idx) => ({
        name: r.name,
        email: r.email,
        role: r.role,
        routing_order: r.routing_order || idx + 1,
        contact: r.contact || null,
      }))
      // Create envelope first without nested fields (need recipient IDs)
      const envelope = await api<any>('/api/envelopes/', {
        method: 'POST',
        json: {
          title: form.values.title,
          message: form.values.message,
          routing: form.values.routing,
          document: Number(form.values.document),
          recipients: createdRecipients,
        },
      })
      const mappedFields = fields.map((f) => ({
        recipient: envelope.recipients[f.recipientIndex].id,
        field_type: f.field_type,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        required: f.required,
        label: f.label,
      }))
      await api(`/api/envelopes/${envelope.id}/fields/`, {
        method: 'PUT',
        json: mappedFields,
      })
      return envelope
    },
    onSuccess: (envelope) => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      notifications.show({ color: 'forest', message: 'Draft envelope saved' })
      navigate(`/app/envelopes/${envelope.id}`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: err.message }),
  })

  return (
    <Stack>
      <Title order={2}>New envelope</Title>
      <Card withBorder radius="lg" p="lg">
        <Stack>
          <TextInput label="Title" required {...form.getInputProps('title')} />
          <Textarea label="Message to signers" {...form.getInputProps('message')} />
          <Select
            label="Document"
            required
            data={(docs?.results || []).map((d) => ({
              value: String(d.id),
              label: d.title,
            }))}
            {...form.getInputProps('document')}
          />
          <Select
            label="Routing"
            data={[
              { value: 'sequential', label: 'Sequential' },
              { value: 'parallel', label: 'Parallel' },
            ]}
            {...form.getInputProps('routing')}
          />
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={4}>Recipients</Title>
          <Button
            variant="light"
            onClick={() =>
              setRecipients((r) => [
                ...r,
                { name: '', email: '', role: 'signer', routing_order: r.length + 1 },
              ])
            }
          >
            Add recipient
          </Button>
        </Group>
        <Stack>
          {recipients.map((r, idx) => (
            <Group key={idx} align="flex-end" wrap="nowrap">
              <ColorSwatch color={COLORS[idx % COLORS.length]} size={18} />
              <TextInput
                label="Name"
                value={r.name}
                onChange={(e) => {
                  const next = [...recipients]
                  next[idx] = { ...next[idx], name: e.currentTarget.value }
                  setRecipients(next)
                }}
                style={{ flex: 1 }}
              />
              <TextInput
                label="Email"
                value={r.email}
                onChange={(e) => {
                  const next = [...recipients]
                  next[idx] = { ...next[idx], email: e.currentTarget.value }
                  setRecipients(next)
                }}
                style={{ flex: 1 }}
              />
              <Select
                label="Role"
                data={[
                  { value: 'signer', label: 'Signer' },
                  { value: 'cc', label: 'CC' },
                ]}
                value={r.role}
                onChange={(v) => {
                  const next = [...recipients]
                  next[idx] = { ...next[idx], role: v || 'signer' }
                  setRecipients(next)
                }}
                w={120}
              />
              <NumberInput
                label="Order"
                value={r.routing_order}
                onChange={(v) => {
                  const next = [...recipients]
                  next[idx] = { ...next[idx], routing_order: Number(v) || 1 }
                  setRecipients(next)
                }}
                w={90}
              />
            </Group>
          ))}
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={4}>Fields</Title>
            <Text size="sm" c="dimmed">
              Place fields with normalized coordinates (0–1). Pages:{' '}
              {selectedDoc?.current_version?.page_count ?? '—'}
            </Text>
          </div>
          <Button
            variant="light"
            onClick={() =>
              setFields((f) => [
                ...f,
                {
                  recipientIndex: 0,
                  field_type: 'signature',
                  page: 1,
                  x: 0.15,
                  y: 0.15,
                  w: 0.28,
                  h: 0.06,
                  required: true,
                  label: 'Signature',
                },
              ])
            }
          >
            Add signature field
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {fields.map((f, idx) => (
            <Card key={idx} withBorder padding="sm">
              <Stack gap="xs">
                <Select
                  label="Signer"
                  data={recipients.map((r, i) => ({
                    value: String(i),
                    label: r.name || r.email || `Recipient ${i + 1}`,
                  }))}
                  value={String(f.recipientIndex)}
                  onChange={(v) => {
                    const next = [...fields]
                    next[idx] = { ...next[idx], recipientIndex: Number(v) }
                    setFields(next)
                  }}
                />
                <Select
                  label="Type"
                  data={['signature', 'initials', 'date', 'text', 'checkbox']}
                  value={f.field_type}
                  onChange={(v) => {
                    const next = [...fields]
                    next[idx] = { ...next[idx], field_type: v || 'signature' }
                    setFields(next)
                  }}
                />
                <Group grow>
                  <NumberInput
                    label="Page"
                    value={f.page}
                    min={1}
                    onChange={(v) => {
                      const next = [...fields]
                      next[idx] = { ...next[idx], page: Number(v) || 1 }
                      setFields(next)
                    }}
                  />
                  <NumberInput
                    label="X"
                    value={f.x}
                    decimalScale={3}
                    step={0.01}
                    onChange={(v) => {
                      const next = [...fields]
                      next[idx] = { ...next[idx], x: Number(v) }
                      setFields(next)
                    }}
                  />
                  <NumberInput
                    label="Y"
                    value={f.y}
                    decimalScale={3}
                    step={0.01}
                    onChange={(v) => {
                      const next = [...fields]
                      next[idx] = { ...next[idx], y: Number(v) }
                      setFields(next)
                    }}
                  />
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Card>

      <Group>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          Save draft
        </Button>
      </Group>
    </Stack>
  )
}
