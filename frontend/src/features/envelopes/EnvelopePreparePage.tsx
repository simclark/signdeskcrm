import { Button, Divider, Group, Modal, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PdfFieldMapper } from '../documents/PdfFieldMapper'
import {
  draftsSnapshot,
  fieldsFromLayout,
  layoutFromFields,
  type RoleDraft,
} from '../documents/pdfFieldMapperUtils'
import type { TemplateListItem } from '../documents/templateTypes'
import { api } from '../../shared/api'
import { PageBreadcrumbs } from '../../shared/PageBreadcrumbs'
import { newFieldId, type EnvelopeDetail, type FieldDraft, type FieldType } from './types'

function validatePrepareDrafts(signers: RoleDraft[], fields: FieldDraft[]): string | null {
  for (const s of signers) {
    if (!s.name.trim() || !s.email.trim()) {
      return 'Each signer needs a name and email'
    }
  }
  if (!fields.length) {
    return 'Place at least one field on the document'
  }
  for (let i = 0; i < signers.length; i++) {
    const hasSignature = fields.some(
      (f) => f.recipientIndex === i && f.field_type === 'signature',
    )
    if (!hasSignature) {
      const label = signers[i].name.trim() || signers[i].email.trim() || `Signer ${i + 1}`
      return `${label} needs at least one signature field`
    }
  }
  return null
}

function recipientsToDrafts(envelope: EnvelopeDetail, params: URLSearchParams): RoleDraft[] {
  if (envelope.recipients?.length) {
    return envelope.recipients.map((r, idx) => ({
      name: r.name,
      email: r.email,
      role: (r.role as 'signer' | 'cc') || 'signer',
      routing_order: r.routing_order || idx + 1,
      contact: r.contact ?? null,
    }))
  }
  return [
    {
      name: params.get('name') || '',
      email: params.get('email') || '',
      role: 'signer',
      routing_order: 1,
      contact: params.get('contact') ? Number(params.get('contact')) : null,
    },
  ]
}

function fieldsToDrafts(envelope: EnvelopeDetail): FieldDraft[] {
  if (!envelope.fields?.length || !envelope.recipients?.length) return []
  const indexById = new Map(envelope.recipients.map((r, i) => [r.id, i]))
  return envelope.fields.map((f) => ({
    id: newFieldId(),
    recipientIndex: indexById.get(f.recipient) ?? 0,
    field_type: f.field_type as FieldType,
    page: f.page,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    required: f.required,
    label: f.label,
  }))
}

export function EnvelopePreparePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [signers, setSigners] = useState<RoleDraft[]>([])
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const allowLeaveRef = useRef(false)

  const [applyOpened, { open: openApply, close: closeApply }] = useDisclosure(false)
  const [saveTplOpened, { open: openSaveTpl, close: closeSaveTpl }] = useDisclosure(false)
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')

  const { data: envelope, isLoading } = useQuery({
    queryKey: ['envelope', id],
    queryFn: () => api<EnvelopeDetail>(`/api/envelopes/${id}/`),
    enabled: !!id,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api<{ results: TemplateListItem[] }>('/api/templates/?active=true'),
  })

  const isDirty = hydrated && draftsSnapshot(signers, fields) !== savedSnapshot

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeaveRef.current) return false
    return isDirty && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (!envelope || hydrated) return
    const nextSigners = recipientsToDrafts(envelope, params)
    const nextFields = fieldsToDrafts(envelope)
    setSigners(nextSigners)
    setFields(nextFields)
    setSavedSnapshot(draftsSnapshot(nextSigners, nextFields))
    setHydrated(true)
  }, [envelope, hydrated, params])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm('You have unsaved changes. Leave without saving?')
    if (leave) {
      allowLeaveRef.current = true
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  const save = useMutation({
    mutationFn: async ({ continueAfter }: { continueAfter: boolean }) => {
      if (!id) throw new Error('Missing envelope')
      const error = validatePrepareDrafts(signers, fields)
      if (error) {
        if (continueAfter) throw new Error(error)
        for (const s of signers) {
          if (!s.name.trim() || !s.email.trim()) {
            throw new Error('Each signer needs a name and email')
          }
        }
      }

      const createdRecipients = await api<Array<{ id: number }>>(`/api/envelopes/${id}/recipients/`, {
        method: 'PUT',
        json: signers.map((s, idx) => ({
          name: s.name.trim(),
          email: s.email.trim(),
          role: s.role,
          routing_order: s.routing_order || idx + 1,
          contact: s.contact || null,
        })),
      })

      const payload = fields.map((f) => ({
        recipient: createdRecipients[Math.min(f.recipientIndex, createdRecipients.length - 1)].id,
        field_type: f.field_type,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        required: f.required,
        label: f.label,
      }))

      await api(`/api/envelopes/${id}/fields/`, { method: 'PUT', json: payload })
      return { envelopeId: id, continueAfter, snapshot: draftsSnapshot(signers, fields) }
    },
    onSuccess: ({ envelopeId, continueAfter, snapshot }) => {
      setSavedSnapshot(snapshot)
      qc.invalidateQueries({ queryKey: ['envelope', envelopeId] })
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      if (continueAfter) {
        notifications.show({ color: 'forest', message: 'Envelope prepared' })
        allowLeaveRef.current = true
        navigate(`/app/envelopes/${envelopeId}`)
      } else {
        notifications.show({ color: 'forest', message: 'Progress saved' })
      }
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: err.message }),
  })

  const applyTemplate = useMutation({
    mutationFn: async () => {
      if (!applyTemplateId) throw new Error('Choose a template')
      const template = templatesData?.results.find((t) => String(t.id) === applyTemplateId)
      if (!template) throw new Error('Template not found')
      const layout = Array.isArray(template.field_layout) ? template.field_layout : []
      if (!layout.length) throw new Error('Template has no field layout yet')

      const tplPages = template.page_count
      const envPages = envelope?.page_count
      if (tplPages && envPages && tplPages !== envPages) {
        notifications.show({
          color: 'yellow',
          title: 'Page count differs',
          message: `Template has ${tplPages} page(s); this PDF has ${envPages}. Review field placement.`,
        })
      }

      const nextFields = fieldsFromLayout(layout, newFieldId)
      const maxIndex = nextFields.reduce((max, f) => Math.max(max, f.recipientIndex), 0)
      let nextSigners = [...signers]
      while (nextSigners.length <= maxIndex) {
        nextSigners.push({
          name: '',
          email: '',
          role: 'signer',
          routing_order: nextSigners.length + 1,
          contact: null,
        })
      }
      return { nextFields, nextSigners, templateName: template.name }
    },
    onSuccess: ({ nextFields, nextSigners, templateName: name }) => {
      setSigners(nextSigners)
      setFields(nextFields)
      closeApply()
      setApplyTemplateId(null)
      notifications.show({
        color: 'forest',
        message: `Applied “${name}” field layout — adjust as needed on this PDF`,
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not apply template', message: err.message }),
  })

  const saveAsTemplate = useMutation({
    mutationFn: async () => {
      if (!envelope?.document) throw new Error('Envelope has no document')
      const name = templateName.trim()
      if (!name) throw new Error('Enter a template name')
      if (!fields.length) throw new Error('Place at least one field first')
      return api<TemplateListItem>('/api/templates/', {
        method: 'POST',
        json: {
          name,
          document: envelope.document,
          field_layout: layoutFromFields(fields),
        },
      })
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      closeSaveTpl()
      setTemplateName('')
      notifications.show({
        color: 'forest',
        message: `Template “${created.name}” saved`,
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not save template', message: err.message }),
  })

  if (isLoading || !envelope || !hydrated) return null

  if (envelope.status !== 'draft') {
    return (
      <Stack>
        <PageBreadcrumbs
          items={[
            { label: 'Envelopes', to: '/app/envelopes' },
            { label: envelope.title, to: `/app/envelopes/${id}` },
            { label: 'Prepare' },
          ]}
        />
        <Title order={2}>Prepare envelope</Title>
        <Text c="dimmed">Only draft envelopes can be prepared.</Text>
        <Button variant="light" onClick={() => navigate(`/app/envelopes/${id}`)}>
          Back to envelope
        </Button>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <PageBreadcrumbs
        items={[
          { label: 'Envelopes', to: '/app/envelopes' },
          { label: envelope.title, to: `/app/envelopes/${id}` },
          { label: 'Prepare' },
        ]}
      />
      <div>
        <Title order={2}>Prepare: {envelope.title}</Title>
        <Text c="dimmed">
          Set signers and place signature, initials, date, text, and checkbox fields.
        </Text>
      </div>

      <PdfFieldMapper
        documentFileUrl={envelope.document_file_url}
        initialPageCount={envelope.page_count || 1}
        roles={signers}
        fields={fields}
        onRolesChange={setSigners}
        onFieldsChange={setFields}
        editableContacts
        sidebarActions={
          <Stack gap="xs">
            <Button
              fullWidth
              onClick={() => save.mutate({ continueAfter: true })}
              loading={save.isPending && save.variables?.continueAfter === true}
            >
              Save & continue
            </Button>
            <Group gap="xs" grow>
              <Button variant="default" onClick={() => navigate(`/app/envelopes/${id}`)}>
                Cancel
              </Button>
              <Button
                variant="light"
                onClick={() => save.mutate({ continueAfter: false })}
                loading={save.isPending && save.variables?.continueAfter === false}
              >
                Save
              </Button>
            </Group>
          </Stack>
        }
        sidebarExtra={
          <>
            <Divider />
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Templates
              </Text>
              <Text size="xs" c="dimmed">
                Overlay a saved layout onto this PDF, or save the current layout as a reusable
                template.
              </Text>
              <Button
                size="xs"
                variant="light"
                onClick={openApply}
                disabled={!(templatesData?.results || []).length}
              >
                Apply template…
              </Button>
              <Button size="xs" variant="light" onClick={openSaveTpl}>
                Save as template…
              </Button>
            </Stack>
          </>
        }
      />

      <Modal opened={applyOpened} onClose={closeApply} title="Apply template">
        <Stack>
          <Text size="sm" c="dimmed">
            Field positions from the template are overlaid on this envelope’s PDF. The PDF file
            itself is unchanged.
          </Text>
          <Select
            label="Template"
            placeholder="Choose a template"
            data={(templatesData?.results || []).map((t) => ({
              value: String(t.id),
              label: `${t.name}${t.page_count ? ` (${t.page_count}p)` : ''}`,
            }))}
            value={applyTemplateId}
            onChange={setApplyTemplateId}
            searchable
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeApply}>
              Cancel
            </Button>
            <Button
              onClick={() => applyTemplate.mutate()}
              loading={applyTemplate.isPending}
              disabled={!applyTemplateId}
            >
              Apply layout
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={saveTplOpened} onClose={closeSaveTpl} title="Save as template">
        <Stack>
          <Text size="sm" c="dimmed">
            Creates a reusable field layout linked to this PDF. You can apply it to other documents
            later.
          </Text>
          <TextInput
            label="Template name"
            required
            value={templateName}
            onChange={(e) => setTemplateName(e.currentTarget.value)}
            placeholder={envelope.title}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSaveTpl}>
              Cancel
            </Button>
            <Button onClick={() => saveAsTemplate.mutate()} loading={saveAsTemplate.isPending}>
              Save template
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
