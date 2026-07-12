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
import { api } from '../../shared/api'
import { applyTemplateLayout } from './applyTemplate'
import type { CreateEnvelopePrefill } from './CreateEnvelopeContext'
import type { TemplateLayoutItem } from './types'

type Template = {
  id: number
  name: string
  field_layout: TemplateLayoutItem[]
}

type DocumentCreated = {
  id: number
  title: string
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
    queryKey: ['templates'],
    queryFn: () => api<{ results: Template[] }>('/api/templates/'),
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
        await applyTemplateLayout(envelope.id, layout, {
          contact: prefill?.contact,
          name: prefill?.name,
          email: prefill?.email,
        })
        return { envelope, next: 'detail' as const }
      }

      return { envelope, next: 'prepare' as const }
    },
    onSuccess: ({ envelope, next }) => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      notifications.show({ color: 'forest', message: 'Draft envelope created' })
      onClose()
      if (next === 'detail') {
        navigate(`/app/envelopes/${envelope.id}`)
        return
      }
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
                  Max 25MB
                </Text>
              </div>
            </Group>
          </Dropzone>
        </div>
        <Select
          label="Template (optional)"
          description="Using a template skips field mapping and opens the envelope detail."
          clearable
          data={(templates?.results || []).map((t) => ({
            value: String(t.id),
            label: t.name,
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
