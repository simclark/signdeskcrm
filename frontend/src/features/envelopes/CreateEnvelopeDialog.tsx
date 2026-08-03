import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { Dropzone, PDF_MIME_TYPE } from '@mantine/dropzone'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconFileTypePdf, IconUpload, IconX } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TemplateListItem } from '../documents/templateTypes'
import { api } from '../../shared/api'
import { applyTemplateLayout } from './applyTemplate'
import type { CreateEnvelopePrefill } from './CreateEnvelopeContext'

type DocumentRow = {
  id: number
  title: string
  current_version?: { page_count: number }
}

type DocumentCreated = {
  id: number
  title: string
  current_version?: { page_count: number }
}

type EnvelopeCreated = {
  id: number
  title: string
}

type PdfSource = 'upload' | 'template' | 'existing'

type Props = {
  opened: boolean
  onClose: () => void
  prefill?: CreateEnvelopePrefill
}

/** Prefer the template built from this document; fall back to an exact name match. */
function pairedTemplateId(
  documentId: number,
  templates: TemplateListItem[],
  documentTitle?: string,
): string {
  const linked = templates.filter((t) => t.document === documentId)
  if (linked.length === 1) return String(linked[0].id)
  if (linked.length > 1) {
    const title = documentTitle?.trim().toLowerCase()
    if (title) {
      const byName = linked.find((t) => t.name.trim().toLowerCase() === title)
      if (byName) return String(byName.id)
    }
    return String(linked[0].id)
  }
  const title = documentTitle?.trim().toLowerCase()
  if (!title) return ''
  const byName = templates.find((t) => t.name.trim().toLowerCase() === title)
  return byName ? String(byName.id) : ''
}

export function CreateEnvelopeDialog({ opened, onClose, prefill }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [pdfSource, setPdfSource] = useState<PdfSource>('upload')
  /** Document id we already auto-paired a template for (avoids fighting manual overrides). */
  const pairedForDocRef = useRef<string | null>(null)

  const form = useForm({
    initialValues: {
      title: '',
      message: '',
      template: '',
      document: '',
    },
  })

  useEffect(() => {
    if (opened) {
      form.reset()
      setFile(null)
      pairedForDocRef.current = null
      if (prefill?.templateId) {
        setPdfSource('template')
        form.setValues({
          title: prefill.title || '',
          message: '',
          template: String(prefill.templateId),
          document: prefill.documentId ? String(prefill.documentId) : '',
        })
      } else if (prefill?.documentId) {
        setPdfSource('existing')
        form.setValues({
          title: prefill.title || '',
          message: '',
          template: '',
          document: String(prefill.documentId),
        })
      } else {
        setPdfSource('upload')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when dialog opens
  }, [opened])

  const { data: templates } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api<{ results: TemplateListItem[] }>('/api/templates/?active=true'),
    enabled: opened,
  })

  const { data: documents } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ results: DocumentRow[] }>('/api/documents/'),
    enabled: opened && pdfSource === 'existing',
  })

  // From-template mode: keep document in sync with the chosen template's source PDF.
  useEffect(() => {
    if (!opened || pdfSource !== 'template') return
    const templateId = form.values.template
    if (!templateId || !templates?.results) return
    const template = templates.results.find((t) => String(t.id) === templateId)
    if (!template) return
    const docId = String(template.document)
    if (form.values.document !== docId) {
      form.setFieldValue('document', docId)
    }
    if (!form.values.title.trim() && !prefill?.title) {
      form.setFieldValue('title', template.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when template selection changes
  }, [opened, pdfSource, form.values.template, templates?.results])

  // Existing-document mode: default the matching template once per document choice.
  useEffect(() => {
    if (!opened || pdfSource !== 'existing') return
    const documentId = form.values.document
    if (!documentId) {
      pairedForDocRef.current = null
      return
    }
    if (!templates || documents === undefined) return
    if (pairedForDocRef.current === documentId) return
    const selected = documents.results.find((d) => String(d.id) === documentId)
    const next = pairedTemplateId(
      Number(documentId),
      templates.results,
      selected?.title || prefill?.title,
    )
    pairedForDocRef.current = documentId
    form.setFieldValue('template', next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pair once per document selection
  }, [opened, pdfSource, form.values.document, templates, documents])

  const create = useMutation({
    mutationFn: async () => {
      let documentId: number
      let docPages: number | undefined
      let title: string
      let templateId: number | null = form.values.template ? Number(form.values.template) : null

      if (pdfSource === 'upload') {
        if (!file) throw new Error('Choose a PDF to upload')
        title = form.values.title.trim() || file.name.replace(/\.pdf$/i, '')
        const fd = new FormData()
        fd.append('file', file)
        fd.append('title', title)
        const document = await api<DocumentCreated>('/api/documents/', {
          method: 'POST',
          formData: fd,
        })
        documentId = document.id
        docPages = document.current_version?.page_count
      } else if (pdfSource === 'template') {
        if (!form.values.template) throw new Error('Choose a template')
        const template = templates?.results.find((t) => t.id === Number(form.values.template))
        if (!template) throw new Error('Template not found')
        documentId = template.document
        templateId = template.id
        title = form.values.title.trim() || template.name
        docPages = template.page_count ?? undefined
      } else {
        if (!form.values.document) throw new Error('Choose an existing document')
        documentId = Number(form.values.document)
        const selected = documents?.results.find((d) => d.id === documentId)
        title = form.values.title.trim() || selected?.title || 'Envelope'
        docPages = selected?.current_version?.page_count
      }

      const envelope = await api<EnvelopeCreated>('/api/envelopes/', {
        method: 'POST',
        json: {
          title,
          message: form.values.message,
          document: documentId,
          ...(templateId ? { template: templateId } : {}),
        },
      })

      if (templateId) {
        const template = templates?.results.find((t) => t.id === templateId)
        const layout = Array.isArray(template?.field_layout) ? template.field_layout : []
        const tplPages = template?.page_count
        if (tplPages && docPages && tplPages !== docPages) {
          notifications.show({
            color: 'yellow',
            title: 'Page count differs',
            message: `Template has ${tplPages} page(s); PDF has ${docPages}. Review field placement on prepare.`,
          })
        }
        await applyTemplateLayout(envelope.id, layout, {
          contact: prefill?.contact,
          name: prefill?.name,
          email: prefill?.email,
          roles: Array.isArray(template?.roles) ? template.roles : undefined,
        })
      }

      // Always open prepare so the user can nudge fields on the real PDF
      return { envelope, usedTemplate: !!templateId }
    },
    onSuccess: ({ envelope, usedTemplate }) => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      notifications.show({
        color: 'forest',
        message: usedTemplate
          ? 'Draft created with template layout — review fields on the PDF'
          : 'Draft envelope created',
      })
      onClose()
      const params = new URLSearchParams()
      if (prefill?.contact) params.set('contact', String(prefill.contact))
      if (prefill?.name) params.set('name', prefill.name)
      if (prefill?.email) params.set('email', prefill.email)
      const qs = params.toString()
      navigate(`/app/envelopes/${envelope.id}/prepare${qs ? `?${qs}` : ''}`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not create envelope', message: err.message }),
  })

  const canSubmit =
    pdfSource === 'upload'
      ? !!file
      : pdfSource === 'template'
        ? !!form.values.template
        : !!form.values.document

  const titlePlaceholder =
    pdfSource === 'upload'
      ? 'Optional — defaults to file name'
      : pdfSource === 'template'
        ? 'Optional — defaults to template name'
        : 'Optional — defaults to document title'

  const selectedTemplate =
    form.values.template && templates?.results
      ? templates.results.find((t) => String(t.id) === form.values.template)
      : undefined

  return (
    <Modal opened={opened} onClose={onClose} title="New envelope" size="lg">
      <Stack>
        <TextInput
          label="Title"
          placeholder={titlePlaceholder}
          {...form.getInputProps('title')}
        />
        <Textarea label="Message to signers" {...form.getInputProps('message')} />
        <div>
          <Text size="sm" fw={500} mb={6}>
            How do you want to start?
          </Text>
          <SegmentedControl
            fullWidth
            value={pdfSource}
            onChange={(v) => {
              const next = v as PdfSource
              setPdfSource(next)
              pairedForDocRef.current = null
              if (next === 'upload') {
                form.setFieldValue('document', '')
              } else if (next === 'template') {
                setFile(null)
                form.setFieldValue('document', '')
              } else {
                setFile(null)
              }
            }}
            data={[
              { label: 'Upload PDF', value: 'upload' },
              { label: 'From template', value: 'template' },
              { label: 'Existing PDF', value: 'existing' },
            ]}
            mb="sm"
          />
          {pdfSource === 'upload' ? (
            <Dropzone
              onDrop={(files) => {
                const next = files[0]
                if (!next) return
                setFile(next)
                if (!form.values.title) {
                  form.setFieldValue('title', next.name.replace(/\.pdf$/i, ''))
                }
              }}
              onReject={() =>
                notifications.show({ color: 'red', message: 'Only PDF files are supported' })
              }
              maxFiles={1}
              accept={PDF_MIME_TYPE}
              maxSize={25 * 1024 * 1024}
            >
              <Group justify="center" gap="md" mih={100} style={{ pointerEvents: 'none' }}>
                <Dropzone.Accept>
                  <IconUpload size={32} stroke={1.5} />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX size={32} stroke={1.5} />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconFileTypePdf size={32} stroke={1.5} />
                </Dropzone.Idle>
                <div>
                  <Text size="sm">
                    {file ? file.name : 'Drop a PDF here or click to browse'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Max 25MB — this is the document recipients will sign
                  </Text>
                </div>
              </Group>
            </Dropzone>
          ) : null}
          {pdfSource === 'template' ? (
            <Stack gap="xs">
              <Select
                label="Template"
                description="Uses this template’s PDF and signature field layout. You’ll review placement next."
                placeholder="Choose a template"
                searchable
                data={(templates?.results || []).map((t) => ({
                  value: String(t.id),
                  label: `${t.name}${t.page_count ? ` (${t.page_count}p, ${Array.isArray(t.field_layout) ? t.field_layout.length : 0} fields)` : ''}`,
                }))}
                {...form.getInputProps('template')}
              />
              {selectedTemplate?.document_title ? (
                <Text size="xs" c="dimmed">
                  PDF: {selectedTemplate.document_title}
                  {selectedTemplate.page_count ? ` · ${selectedTemplate.page_count} pages` : ''}
                </Text>
              ) : null}
            </Stack>
          ) : null}
          {pdfSource === 'existing' ? (
            <Select
              label="Document"
              placeholder="Choose a document"
              searchable
              data={(documents?.results || []).map((d) => ({
                value: String(d.id),
                label: `${d.title}${d.current_version?.page_count ? ` (${d.current_version.page_count}p)` : ''}`,
              }))}
              {...form.getInputProps('document')}
            />
          ) : null}
        </div>
        {pdfSource !== 'template' ? (
          <Select
            label="Template (optional)"
            description="Applies the template’s signature field layout onto this PDF. You’ll review placement next."
            clearable
            searchable
            data={(templates?.results || []).map((t) => ({
              value: String(t.id),
              label: `${t.name}${t.page_count ? ` (${t.page_count}p, ${Array.isArray(t.field_layout) ? t.field_layout.length : 0} fields)` : ''}`,
            }))}
            {...form.getInputProps('template')}
          />
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!canSubmit}
          >
            Create envelope
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
