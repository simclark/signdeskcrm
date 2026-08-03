import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PdfFieldMapper } from '../documents/PdfFieldMapper'
import {
  draftsSnapshot,
  fieldsFromLayout,
  layoutFromFields,
  rolesFromLayout,
  type RoleDraft,
} from '../documents/pdfFieldMapperUtils'
import type { TemplateListItem } from '../documents/templateTypes'
import { api } from '../../shared/api'
import { PageBreadcrumbs } from '../../shared/PageBreadcrumbs'
import { useAuth } from '../auth/AuthContext'
import { newFieldId, type EnvelopeDetail, type FieldDraft, type FieldType } from './types'

function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@draft.local')
}

function validatePrepareDrafts(signers: RoleDraft[], fields: FieldDraft[]): string | null {
  for (const s of signers) {
    if (!s.name.trim() || !s.email.trim()) {
      return 'Each recipient needs a name and email'
    }
    if (isPlaceholderEmail(s.email)) {
      return 'Replace placeholder emails with real addresses'
    }
  }
  const signerIndexes = signers
    .map((s, i) => (s.role === 'signer' ? i : -1))
    .filter((i) => i >= 0)
  if (!signerIndexes.length) {
    return 'Add at least one signer'
  }
  if (!fields.length) {
    return 'Place at least one field on the document'
  }
  for (const f of fields) {
    if ((f.fill_mode || 'signer') === 'document') {
      if (f.recipientIndex != null) {
        return 'Document data fields must not be assigned to a signer'
      }
      continue
    }
    if (f.recipientIndex == null) {
      return 'Signer fields need an assigned recipient'
    }
    if (signers[f.recipientIndex]?.role === 'cc') {
      return 'Fields cannot be assigned to CC recipients'
    }
  }
  for (const i of signerIndexes) {
    const hasSignerTasks = fields.some(
      (f) => f.recipientIndex === i && (f.fill_mode || 'signer') === 'signer',
    )
    if (!hasSignerTasks) continue
    const hasSignature = fields.some(
      (f) => f.recipientIndex === i && f.field_type === 'signature',
    )
    if (!hasSignature) {
      const label = signers[i].name.trim() || signers[i].email.trim() || `Signer ${i + 1}`
      return `${label} needs at least one signature field`
    }
  }
  const hasAnySignerTasks = fields.some((f) => (f.fill_mode || 'signer') === 'signer')
  if (!hasAnySignerTasks) {
    return 'Add at least one signer field to complete'
  }
  return null
}

function recipientsToDrafts(envelope: EnvelopeDetail, params: URLSearchParams): RoleDraft[] {
  if (envelope.recipients?.length) {
    return envelope.recipients.map((r, idx) => ({
      name: r.name,
      // Strip legacy template placeholders so prepare shows an empty email field.
      email: isPlaceholderEmail(r.email || '') ? '' : r.email || '',
      role: (r.role as 'signer' | 'cc') || 'signer',
      routing_order: r.routing_order || idx + 1,
      contact: r.contact ?? null,
      role_key: r.role_key || '',
    }))
  }
  return [
    {
      name: params.get('name') || '',
      email: params.get('email') || '',
      role: 'signer',
      routing_order: 1,
      contact: params.get('contact') ? Number(params.get('contact')) : null,
      role_key: '',
    },
  ]
}

function fieldsToDrafts(envelope: EnvelopeDetail): FieldDraft[] {
  if (!envelope.fields?.length) return []
  const indexById = new Map((envelope.recipients || []).map((r, i) => [r.id, i]))
  return envelope.fields.map((f) => {
    const fillMode = f.fill_mode === 'document' ? 'document' : 'signer'
    return {
      id: newFieldId(),
      recipientIndex:
        fillMode === 'document' || f.recipient == null
          ? null
          : (indexById.get(f.recipient) ?? 0),
      field_type: f.field_type as FieldType,
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      required: f.required,
      label: f.label,
      merge_token: f.merge_token || '',
      fill_mode: fillMode,
      value: f.value || '',
    }
  })
}

function buildMergeDataFromState(
  fields: FieldDraft[],
  customEntries: Array<{ key: string; value: string }>,
): Record<string, string | Record<string, string>> {
  const merge: Record<string, string | Record<string, string>> = {}

  for (const f of fields) {
    if ((f.fill_mode || 'signer') !== 'document') continue
    const token = (f.merge_token || '').trim()
    const value = (f.value || '').trim()
    if (!token || !value) continue
    if (token.startsWith('deal.')) {
      const key = token.slice('deal.'.length)
      if (key && key !== 'custom') merge[key] = value
    }
  }

  const custom: Record<string, string> = {}
  for (const entry of customEntries) {
    const key = entry.key.trim().replace(/\s+/g, '_').toLowerCase()
    if (!key) continue
    custom[key] = entry.value
  }
  for (const f of fields) {
    if ((f.fill_mode || 'signer') !== 'document') continue
    const token = (f.merge_token || '').trim()
    const value = (f.value || '').trim()
    if (!token.startsWith('custom.') || !value) continue
    const key = token.slice('custom.'.length)
    if (key) custom[key] = value
  }
  if (Object.keys(custom).length) merge.custom = custom
  return merge
}

export function EnvelopePreparePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { tenant } = useAuth()
  const listingsEnabled = Boolean(tenant?.listings_enabled)

  const [signers, setSigners] = useState<RoleDraft[]>([])
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [routing, setRouting] = useState<'sequential' | 'parallel'>('sequential')
  const [savedRouting, setSavedRouting] = useState<'sequential' | 'parallel'>('sequential')
  const [hydrated, setHydrated] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const allowLeaveRef = useRef(false)

  const [applyOpened, { open: openApply, close: closeApply }] = useDisclosure(false)
  const [saveTplOpened, { open: openSaveTpl, close: closeSaveTpl }] = useDisclosure(false)
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [listingId, setListingId] = useState<string | null>(null)
  const [customEntries, setCustomEntries] = useState<Array<{ key: string; value: string }>>([])

  const { data: envelope, isLoading } = useQuery({
    queryKey: ['envelope', id],
    queryFn: () => api<EnvelopeDetail>(`/api/envelopes/${id}/`),
    enabled: !!id,
  })

  const { data: listingsData } = useQuery({
    queryKey: ['listings'],
    queryFn: () =>
      api<{ results: Array<{ id: number; full_address: string; mls_number: string }> }>(
        '/api/listings/',
      ),
    enabled: listingsEnabled,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api<{ results: TemplateListItem[] }>('/api/templates/?active=true'),
  })

  const isDirty =
    hydrated &&
    (draftsSnapshot(signers, fields) !== savedSnapshot || routing !== savedRouting)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeaveRef.current) return false
    return isDirty && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (!envelope || hydrated) return
    const nextSigners = recipientsToDrafts(envelope, params)
    const nextFields = fieldsToDrafts(envelope)
    const nextRouting =
      envelope.routing === 'parallel' ? 'parallel' : ('sequential' as const)
    setSigners(nextSigners)
    setFields(nextFields)
    setRouting(nextRouting)
    setSavedRouting(nextRouting)
    setSavedSnapshot(draftsSnapshot(nextSigners, nextFields))
    setListingId(
      listingsEnabled && envelope.listing != null ? String(envelope.listing) : null,
    )
    const md = envelope.merge_data || {}
    const customBag = md.custom
    if (customBag && typeof customBag === 'object' && !Array.isArray(customBag)) {
      setCustomEntries(
        Object.entries(customBag).map(([key, value]) => ({
          key,
          value: String(value ?? ''),
        })),
      )
    } else {
      setCustomEntries([])
    }
    setHydrated(true)
  }, [envelope, hydrated, listingsEnabled, params])

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
      // Full validation (incl. emails) only when leaving prepare / sending onward.
      // Draft progress may keep blank emails for unfilled secondary signers.
      if (continueAfter) {
        const error = validatePrepareDrafts(signers, fields)
        if (error) throw new Error(error)
      } else {
        for (const s of signers) {
          if (isPlaceholderEmail(s.email)) {
            throw new Error('Replace placeholder emails with real addresses')
          }
        }
      }

      await api(`/api/envelopes/${id}/`, {
        method: 'PATCH',
        json: {
          routing,
          listing: listingsEnabled && listingId ? Number(listingId) : null,
          merge_data: buildMergeDataFromState(fields, customEntries),
        },
      })

      const createdRecipients = await api<Array<{ id: number }>>(`/api/envelopes/${id}/recipients/`, {
        method: 'PUT',
        json: signers.map((s, idx) => ({
          name: s.name.trim(),
          email: s.email.trim(),
          role: s.role,
          role_key: s.role_key || '',
          routing_order: s.routing_order || idx + 1,
          contact: s.contact || null,
        })),
      })

      const payload = fields.map((f) => {
        const fillMode =
          f.field_type === 'signature' ||
          f.field_type === 'initials' ||
          f.field_type === 'checkbox'
            ? 'signer'
            : f.fill_mode || 'signer'
        let recipient: number | null = null
        if (fillMode !== 'document') {
          const idx = Math.min(
            Math.max(f.recipientIndex ?? 0, 0),
            createdRecipients.length - 1,
          )
          recipient = createdRecipients[idx].id
        }
        return {
          recipient,
          field_type: f.field_type,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          required: f.required,
          label: f.label,
          merge_token: f.merge_token || '',
          fill_mode: fillMode,
          value: f.value || '',
        }
      })

      await api(`/api/envelopes/${id}/fields/`, { method: 'PUT', json: payload })
      return {
        envelopeId: id,
        continueAfter,
        snapshot: draftsSnapshot(signers, fields),
        routing,
      }
    },
    onSuccess: ({ envelopeId, continueAfter, snapshot, routing: nextRouting }) => {
      setSavedSnapshot(snapshot)
      setSavedRouting(nextRouting)
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
      let nextSigners = signers
      if (template.roles?.length) {
        const named = rolesFromLayout(layout, template.roles)
        nextSigners = named.map((r, idx) => ({
          ...r,
          name: signers[idx]?.name || r.name,
          email: signers[idx]?.email || '',
          contact: signers[idx]?.contact ?? null,
        }))
      } else {
        const maxIndex = nextFields.reduce((max, f) => {
          if (f.recipientIndex == null) return max
          return Math.max(max, f.recipientIndex)
        }, 0)
        nextSigners = [...signers]
        while (nextSigners.length <= maxIndex) {
          nextSigners.push({
            name: '',
            email: '',
            role: 'signer',
            routing_order: nextSigners.length + 1,
            contact: null,
          })
        }
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
          roles: signers.map((s, idx) => ({
            key: (s.role_key || `signer_${idx + 1}`).toLowerCase().replace(/\s+/g, '_'),
            label: s.name.trim() || `Signer ${idx + 1}`,
            order: s.routing_order || idx + 1,
          })),
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

  const prefill = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Missing envelope')
      // Persist recipients/fields first so role keys are available for merge
      await save.mutateAsync({ continueAfter: false })
      const contactId = signers.find((s) => s.contact)?.contact || null
      const body: {
        contact: number | null
        deal: Record<string, string | Record<string, string>>
        listing?: number | null
      } = {
        contact: contactId,
        deal: buildMergeDataFromState(fields, customEntries),
      }
      if (listingsEnabled) {
        body.listing = listingId ? Number(listingId) : null
      }
      return api<{
        updated_fields: number
        envelope: EnvelopeDetail
      }>(`/api/envelopes/${id}/prefill/`, {
        method: 'POST',
        json: body,
      })
    },
    onSuccess: ({ updated_fields, envelope: next }) => {
      const nextFields = fieldsToDrafts(next)
      setFields(nextFields)
      const customBag = next.merge_data?.custom
      if (customBag && typeof customBag === 'object' && !Array.isArray(customBag)) {
        setCustomEntries(
          Object.entries(customBag).map(([key, value]) => ({
            key,
            value: String(value ?? ''),
          })),
        )
      }
      setSavedSnapshot(draftsSnapshot(signers, nextFields))
      qc.invalidateQueries({ queryKey: ['envelope', id] })
      notifications.show({
        color: 'forest',
        message: `Prefill applied to ${updated_fields} field(s)`,
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Prefill failed', message: err.message }),
  })

  const hasUsableCustomEntries = customEntries.some((e) => e.key.trim())
  const hasContactPrefill = signers.some((s) => s.contact)
  const documentDataFields = fields.filter((f) => (f.fill_mode || 'signer') === 'document')
  const hasResolvableNonListingTokens = documentDataFields.some((f) => {
    const token = (f.merge_token || '').trim()
    return (
      token.startsWith('custom.') ||
      token.startsWith('deal.') ||
      token.startsWith('role.') ||
      token.startsWith('contact.') ||
      token.startsWith('company.')
    )
  })
  const canApplyPrefill =
    listingsEnabled ||
    hasUsableCustomEntries ||
    hasContactPrefill ||
    hasResolvableNonListingTokens
  const prefillDisabledHint = canApplyPrefill
    ? null
    : 'No custom values set. Add a custom key above to Apply prefill, or type values into the document data fields. Listing tokens (e.g. listing.full_address) need the Listings module.'

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
          Set signers and CC recipients, choose routing, and place signature fields.
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
        rolesTitle="Recipients"
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
                Signing order
              </Text>
              <SegmentedControl
                fullWidth
                size="xs"
                value={routing}
                onChange={(v) => setRouting(v as 'sequential' | 'parallel')}
                data={[
                  { label: 'Sequential', value: 'sequential' },
                  { label: 'Parallel', value: 'parallel' },
                ]}
              />
              <Text size="xs" c="dimmed">
                {routing === 'sequential'
                  ? 'Signers are invited one at a time in list order.'
                  : 'All signers are invited at once.'}
              </Text>
            </Stack>
            <Divider />
            <Stack gap="xs">
              <div>
                <Text size="sm" fw={600}>
                  Document data
                </Text>
                <Text size="xs" c="dimmed">
                  Shared values stamped into the PDF on send.
                </Text>
              </div>
              {listingsEnabled ? (
                <Select
                  size="xs"
                  label="Prefill record"
                  placeholder="Optional record to pull values from"
                  clearable
                  searchable
                  data={(listingsData?.results || []).map((l) => ({
                    value: String(l.id),
                    label: l.mls_number
                      ? `${l.full_address} (${l.mls_number})`
                      : l.full_address,
                  }))}
                  value={listingId}
                  onChange={setListingId}
                />
              ) : null}
              <Accordion
                multiple
                variant="contained"
                defaultValue={['fields', 'custom']}
                styles={{
                  item: { background: 'var(--mantine-color-body)' },
                  control: { paddingBlock: 8, paddingInline: 10 },
                  content: { padding: '0 10px 10px' },
                  label: { fontSize: 'var(--mantine-font-size-xs)', fontWeight: 600 },
                }}
              >
                <Accordion.Item value="fields">
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" gap="xs" pr="xs">
                      <Text size="xs" fw={600}>
                        Fields
                      </Text>
                      <Badge size="xs" variant="light" color="gray">
                        {documentDataFields.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {documentDataFields.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No document-data fields yet. Set a text/date field to “Document data” in
                        the mapper.
                      </Text>
                    ) : (
                      <ScrollArea.Autosize mah={220} offsetScrollbars type="auto">
                        <Stack gap="sm" pr={4}>
                          {documentDataFields.map((f) => (
                            <Stack key={f.id} gap={4}>
                              <Group justify="space-between" gap={6} wrap="nowrap">
                                <Text size="xs" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                                  {f.label || f.merge_token || 'Document field'}
                                </Text>
                                {f.merge_token ? (
                                  <Text
                                    size="xs"
                                    c="dimmed"
                                    truncate
                                    title={f.merge_token}
                                    style={{ maxWidth: '42%', flexShrink: 0 }}
                                  >
                                    {f.merge_token}
                                  </Text>
                                ) : null}
                              </Group>
                              <TextInput
                                size="xs"
                                placeholder="Value stamped on send"
                                value={f.value || ''}
                                onChange={(e) => {
                                  const v = e.currentTarget.value
                                  setFields((prev) =>
                                    prev.map((row) =>
                                      row.id === f.id ? { ...row, value: v } : row,
                                    ),
                                  )
                                }}
                              />
                            </Stack>
                          ))}
                        </Stack>
                      </ScrollArea.Autosize>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="custom">
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" gap="xs" pr="xs">
                      <Text size="xs" fw={600}>
                        Custom values
                      </Text>
                      <Badge size="xs" variant="light" color="gray">
                        {customEntries.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      <Text size="xs" c="dimmed">
                        Bind a field to <Text span fw={600} inherit>custom.key</Text>, set the
                        value here, then Apply prefill.
                      </Text>
                      {customEntries.length === 0 ? (
                        <Text size="xs" c="dimmed" fs="italic">
                          No custom values set.
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {customEntries.map((entry, idx) => (
                            <Stack
                              key={idx}
                              gap={6}
                              p="xs"
                              style={{
                                border: '1px solid var(--mantine-color-gray-3)',
                                borderRadius: 'var(--mantine-radius-sm)',
                                background: 'var(--mantine-color-gray-0)',
                              }}
                            >
                              <Group gap={6} wrap="nowrap" align="flex-end">
                                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                  <Text size="xs" c="dimmed">
                                    Key
                                  </Text>
                                  <Group
                                    gap={0}
                                    wrap="nowrap"
                                    px={8}
                                    style={{
                                      border: '1px solid var(--mantine-color-gray-4)',
                                      borderRadius: 'var(--mantine-radius-sm)',
                                      background: 'var(--mantine-color-body)',
                                      minHeight: 30,
                                    }}
                                  >
                                    <Text
                                      size="xs"
                                      c="dimmed"
                                      style={{ flexShrink: 0, lineHeight: 1 }}
                                    >
                                      custom.
                                    </Text>
                                    <TextInput
                                      size="xs"
                                      variant="unstyled"
                                      placeholder="lender_name"
                                      value={entry.key}
                                      style={{ flex: 1 }}
                                      styles={{
                                        input: {
                                          minHeight: 28,
                                          paddingInline: 0,
                                          height: 28,
                                        },
                                      }}
                                      onChange={(e) => {
                                        const key = e.currentTarget.value
                                        setCustomEntries((prev) =>
                                          prev.map((row, i) =>
                                            i === idx ? { ...row, key } : row,
                                          ),
                                        )
                                      }}
                                    />
                                  </Group>
                                </Stack>
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="red"
                                  mb={2}
                                  aria-label={`Remove custom value ${idx + 1}`}
                                  onClick={() =>
                                    setCustomEntries((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Group>
                              <TextInput
                                size="xs"
                                label="Value"
                                placeholder="First National Bank"
                                value={entry.value}
                                onChange={(e) => {
                                  const value = e.currentTarget.value
                                  setCustomEntries((prev) =>
                                    prev.map((row, i) =>
                                      i === idx ? { ...row, value } : row,
                                    ),
                                  )
                                  const key = entry.key
                                    .trim()
                                    .replace(/\s+/g, '_')
                                    .toLowerCase()
                                  if (!key) return
                                  const token = `custom.${key}`
                                  setFields((prev) =>
                                    prev.map((f) =>
                                      f.merge_token === token &&
                                      (f.fill_mode || 'signer') === 'document'
                                        ? { ...f, value }
                                        : f,
                                    ),
                                  )
                                }}
                              />
                            </Stack>
                          ))}
                        </Stack>
                      )}
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconPlus size={14} />}
                        onClick={() =>
                          setCustomEntries((prev) => [...prev, { key: '', value: '' }])
                        }
                      >
                        Add custom value
                      </Button>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
              <Button
                size="xs"
                variant="light"
                onClick={() => prefill.mutate()}
                loading={prefill.isPending}
                disabled={!canApplyPrefill || save.isPending}
              >
                Apply prefill
              </Button>
              {prefillDisabledHint ? (
                <Text size="xs" c="dimmed">
                  {prefillDisabledHint}
                </Text>
              ) : null}
            </Stack>
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
