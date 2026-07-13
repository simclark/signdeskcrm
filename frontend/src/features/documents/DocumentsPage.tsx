import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconDotsVertical,
  IconEye,
  IconFileDescription,
  IconPencil,
  IconSend,
  IconTrash,
} from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'
import { useCreateEnvelope } from '../envelopes/CreateEnvelopeContext'
import { PdfViewerDialog } from './PdfViewerDialog'
import type { TemplateListItem } from './templateTypes'

type DocumentRow = {
  id: number
  title: string
  original_filename: string
  current_version?: {
    page_count: number
    sha256: string
    file_url?: string | null
  }
  created_at: string
  template_count?: number
  envelope_count?: number
}

export function DocumentsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { openCreateEnvelope } = useCreateEnvelope()

  const [preview, setPreview] = useState<DocumentRow | null>(null)
  const [renameDoc, setRenameDoc] = useState<DocumentRow | null>(null)
  const [templateDoc, setTemplateDoc] = useState<DocumentRow | null>(null)

  const [renameOpened, { open: openRename, close: closeRename }] = useDisclosure(false)
  const [templateOpened, { open: openTemplate, close: closeTemplate }] = useDisclosure(false)

  const renameForm = useForm({ initialValues: { title: '' } })
  const templateForm = useForm({ initialValues: { name: '' } })

  const { data } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ results: DocumentRow[] }>('/api/documents/'),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.pdf$/i, ''))
      return api('/api/documents/', { method: 'POST', formData: fd })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      notifications.show({ color: 'forest', message: 'Document uploaded' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Upload failed', message: err.message }),
  })

  const rename = useMutation({
    mutationFn: async () => {
      if (!renameDoc) throw new Error('No document selected')
      const title = renameForm.values.title.trim()
      if (!title) throw new Error('Enter a title')
      return api<DocumentRow>(`/api/documents/${renameDoc.id}/`, {
        method: 'PATCH',
        json: { title },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      notifications.show({ color: 'forest', message: 'Document renamed' })
      closeRename()
      setRenameDoc(null)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not rename', message: err.message }),
  })

  const createTemplate = useMutation({
    mutationFn: async () => {
      if (!templateDoc) throw new Error('No document selected')
      const name = templateForm.values.name.trim()
      if (!name) throw new Error('Enter a template name')
      return api<TemplateListItem>('/api/templates/', {
        method: 'POST',
        json: {
          name,
          document: templateDoc.id,
          field_layout: [],
          is_active: true,
        },
      })
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      closeTemplate()
      setTemplateDoc(null)
      templateForm.reset()
      notifications.show({
        color: 'forest',
        message: 'Template created — place fields next',
      })
      navigate(`/app/templates/${template.id}/prepare`)
    },
    onError: (err: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not create template',
        message: err.message,
      }),
  })

  const remove = useMutation({
    mutationFn: (doc: DocumentRow) =>
      api(`/api/documents/${doc.id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      notifications.show({ color: 'forest', message: 'Document deleted' })
    },
    onError: (err: Error) => {
      const message =
        err instanceof ApiError && err.status === 409
          ? err.message
          : err.message || 'Could not delete document'
      notifications.show({ color: 'red', title: 'Could not delete', message })
    },
  })

  function startRename(doc: DocumentRow) {
    setRenameDoc(doc)
    renameForm.setValues({ title: doc.title })
    openRename()
  }

  function startCreateTemplate(doc: DocumentRow) {
    setTemplateDoc(doc)
    templateForm.setValues({ name: doc.title })
    openTemplate()
  }

  function confirmDelete(doc: DocumentRow) {
    const used = (doc.template_count || 0) + (doc.envelope_count || 0)
    const warning =
      used > 0
        ? `“${doc.title}” is used by ${doc.template_count || 0} template(s) and ${doc.envelope_count || 0} envelope(s). It cannot be deleted while in use.`
        : `Delete “${doc.title}”? This cannot be undone.`
    if (used > 0) {
      notifications.show({ color: 'yellow', title: 'Document in use', message: warning })
      return
    }
    if (window.confirm(warning)) {
      remove.mutate(doc)
    }
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Documents</Title>
          <Text c="dimmed">Shared PDF library for envelopes and templates.</Text>
        </div>
        <FileButton onChange={(f) => f && upload.mutate(f)} accept="application/pdf">
          {(props) => (
            <Button {...props} loading={upload.isPending}>
              Upload PDF
            </Button>
          )}
        </FileButton>
      </Group>
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Title</DataTable.Th>
            <DataTable.Th className="sd-table-numeric">Pages</DataTable.Th>
            <DataTable.Th className="sd-table-numeric">Used by</DataTable.Th>
            <DataTable.Th>Uploaded</DataTable.Th>
            <DataTable.Th className="sd-table-actions" />
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {(data?.results || []).map((d) => {
            const templateCount = d.template_count ?? 0
            const envelopeCount = d.envelope_count ?? 0
            const usageLabel =
              templateCount === 0 && envelopeCount === 0
                ? '—'
                : [
                    templateCount ? `${templateCount} tpl` : null,
                    envelopeCount ? `${envelopeCount} env` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')

            return (
              <DataTable.Tr key={d.id}>
                <DataTable.Td className="sd-table-primary">{d.title}</DataTable.Td>
                <DataTable.Td className="sd-table-numeric sd-table-muted">
                  {d.current_version?.page_count ?? '—'}
                </DataTable.Td>
                <DataTable.Td className="sd-table-numeric sd-table-muted">{usageLabel}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{formatDate(d.created_at, true)}</DataTable.Td>
                <DataTable.Td className="sd-table-actions">
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Actions for ${d.title}`}
                      >
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconEye size={14} />}
                        disabled={!d.current_version?.file_url}
                        onClick={() => setPreview(d)}
                      >
                        Preview
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconSend size={14} />}
                        onClick={() =>
                          openCreateEnvelope({ documentId: d.id, title: d.title })
                        }
                      >
                        Create envelope
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconFileDescription size={14} />}
                        onClick={() => startCreateTemplate(d)}
                      >
                        Create template
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => startRename(d)}
                      >
                        Rename
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        disabled={remove.isPending}
                        onClick={() => confirmDelete(d)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </DataTable.Td>
              </DataTable.Tr>
            )
          })}
        </DataTable.Tbody>
      </DataTable>

      <PdfViewerDialog
        opened={!!preview}
        onClose={() => setPreview(null)}
        fileUrl={preview?.current_version?.file_url}
        title={preview?.title || 'Document'}
        downloadFileName={`${preview?.title || 'document'}.pdf`}
      />

      <Modal
        opened={renameOpened}
        onClose={() => {
          closeRename()
          setRenameDoc(null)
        }}
        title="Rename document"
      >
        <Stack>
          <TextInput label="Title" required {...renameForm.getInputProps('title')} />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                closeRename()
                setRenameDoc(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => rename.mutate()} loading={rename.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={templateOpened}
        onClose={() => {
          closeTemplate()
          setTemplateDoc(null)
          templateForm.reset()
        }}
        title="Create template"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Creates a reusable field layout linked to{' '}
            <Text span fw={500} c="inherit">
              {templateDoc?.title}
            </Text>
            .
          </Text>
          <TextInput label="Template name" required {...templateForm.getInputProps('name')} />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                closeTemplate()
                setTemplateDoc(null)
                templateForm.reset()
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => createTemplate.mutate()} loading={createTemplate.isPending}>
              Create & place fields
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
