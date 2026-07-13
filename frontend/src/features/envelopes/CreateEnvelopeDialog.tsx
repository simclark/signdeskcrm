import {
  Button,
  Group,
  Modal,
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
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TemplateListItem } from '../documents/templateTypes'
import { api } from '../../shared/api'
import { applyTemplateLayout } from './applyTemplate'
import type { CreateEnvelopePrefill } from './CreateEnvelopeContext'

type DocumentCreated = {
  id: number
  title: string
  current_version?: { page_count: number }
}

type EnvelopeCreated = {
  id: number
  title: string
}

type Props = {
  opened: boolean
  onClose: () => void
  prefill?: CreateEnvelopePrefill
}

export function CreateEnvelopeDialog({ opened, onClose, prefill }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)

  const form = useForm({
    initialValues: {
      title: '',
      message: '',
      template: '',
    },
  })

  useEffect(() => {
    if (opened) {
      form.reset()
      setFile(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when dialog opens
  }, [opened])

  const { data: templates } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api<{ results: TemplateListItem[] }>('/api/templates/?active=true'),
    enabled: opened,
  })

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a PDF to upload')
      const title = form.values.title.trim() || file.name.replace(/\.pdf$/i, '')

      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', title)
      const document = await api<DocumentCreated>('/api/documents/', {
        method: 'POST',
        formData: fd,
      })

      const templateId = form.values.template ? Number(form.values.template) : null
      const envelope = await api<EnvelopeCreated>('/api/envelopes/', {
        method: 'POST',
        json: {
          title,
          message: form.values.message,
          document: document.id,
          ...(templateId ? { template: templateId } : {}),
        },
      })

      if (templateId) {
        const template = templates?.results.find((t) => t.id === templateId)
        const layout = Array.isArray(template?.field_layout) ? template.field_layout : []
        const tplPages = template?.page_count
        const docPages = document.current_version?.page_count
        if (tplPages && docPages && tplPages !== docPages) {
          notifications.show({
            color: 'yellow',
            title: 'Page count differs',
            message: `Template has ${tplPages} page(s); uploaded PDF has ${docPages}. Review field placement on prepare.`,
          })
        }
        await applyTemplateLayout(envelope.id, layout, {
          contact: prefill?.contact,
          name: prefill?.name,
          email: prefill?.email,
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

  return (
    <Modal opened={opened} onClose={onClose} title="New envelope" size="lg">
      <Stack>
        <TextInput
          label="Title"
          placeholder="Optional — defaults to file name"
          {...form.getInputProps('title')}
        />
        <Textarea label="Message to signers" {...form.getInputProps('message')} />
        <div>
          <Text size="sm" fw={500} mb={6}>
            PDF file
          </Text>
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
        </div>
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
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!file}
          >
            Create envelope
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
