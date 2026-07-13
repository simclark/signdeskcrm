import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  SegmentedControl,
} from '@mantine/core'
import { Dropzone, PDF_MIME_TYPE } from '@mantine/dropzone'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconArchive,
  IconDotsVertical,
  IconFileTypePdf,
  IconLayout,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'
import type { TemplateListItem } from './templateTypes'

type DocumentRow = {
  id: number
  title: string
  current_version?: { page_count: number }
}

export function TemplatesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const [pdfSource, setPdfSource] = useState<'upload' | 'existing'>('upload')
  const [file, setFile] = useState<File | null>(null)

  const { data } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api<{ results: TemplateListItem[] }>('/api/templates/'),
  })

  const { data: documents } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ results: DocumentRow[] }>('/api/documents/'),
    enabled: opened,
  })

  const form = useForm({
    initialValues: { name: '', document: '' },
  })

  const create = useMutation({
    mutationFn: async () => {
      const name = form.values.name.trim()
      if (!name) throw new Error('Enter a template name')

      let documentId: number
      if (pdfSource === 'upload') {
        if (!file) throw new Error('Choose a PDF to upload')
        const fd = new FormData()
        fd.append('file', file)
        fd.append('title', name)
        const document = await api<{ id: number }>('/api/documents/', {
          method: 'POST',
          formData: fd,
        })
        documentId = document.id
      } else {
        if (!form.values.document) throw new Error('Choose an existing document')
        documentId = Number(form.values.document)
      }

      return api<TemplateListItem>('/api/templates/', {
        method: 'POST',
        json: { name, document: documentId, field_layout: [], is_active: true },
      })
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      close()
      form.reset()
      setFile(null)
      setPdfSource('upload')
      notifications.show({ color: 'forest', message: 'Template created — place fields next' })
      navigate(`/app/templates/${template.id}/prepare`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not create template', message: err.message }),
  })

  const setActive = useMutation({
    mutationFn: ({ templateId, is_active }: { templateId: number; is_active: boolean }) =>
      api<TemplateListItem>(`/api/templates/${templateId}/`, {
        method: 'PATCH',
        json: { is_active },
      }),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['template', String(template.id)] })
      notifications.show({
        color: 'forest',
        message: template.is_active ? 'Template activated' : 'Template deactivated',
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not update status', message: err.message }),
  })

  const archive = useMutation({
    mutationFn: (templateId: number) =>
      api(`/api/templates/${templateId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({ color: 'forest', message: 'Template archived' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not archive', message: err.message }),
  })

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Templates</Title>
          <Text c="dimmed">
            PDF-backed field layouts you can overlay onto any document when sending for signature.
            Only active templates appear in envelope dropdowns.
          </Text>
        </div>
        <Button
          onClick={() => {
            form.reset()
            setFile(null)
            setPdfSource('upload')
            open()
          }}
        >
          New template
        </Button>
      </Group>
      {(data?.results || []).length === 0 ? (
        <Text c="dimmed">
          No templates yet. Upload a PDF, place signature fields, then apply that layout to future
          documents.
        </Text>
      ) : (
        <DataTable>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Status</DataTable.Th>
              <DataTable.Th>Source PDF</DataTable.Th>
              <DataTable.Th className="sd-table-numeric">Pages</DataTable.Th>
              <DataTable.Th className="sd-table-numeric">Fields</DataTable.Th>
              <DataTable.Th>Created</DataTable.Th>
              <DataTable.Th className="sd-table-actions" />
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {(data?.results || []).map((t) => (
              <DataTable.Tr key={t.id}>
                <DataTable.Td className="sd-table-primary">{t.name}</DataTable.Td>
                <DataTable.Td>
                  <Group gap="sm" wrap="nowrap">
                    <Badge variant="light" color={t.is_active ? 'forest' : 'gray'}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Switch
                      size="sm"
                      checked={t.is_active}
                      aria-label={`${t.is_active ? 'Deactivate' : 'Activate'} ${t.name}`}
                      onChange={(e) =>
                        setActive.mutate({
                          templateId: t.id,
                          is_active: e.currentTarget.checked,
                        })
                      }
                    />
                  </Group>
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{t.document_title || '—'}</DataTable.Td>
                <DataTable.Td className="sd-table-numeric sd-table-muted">
                  {t.page_count ?? '—'}
                </DataTable.Td>
                <DataTable.Td className="sd-table-numeric sd-table-muted">
                  {Array.isArray(t.field_layout) ? t.field_layout.length : 0}
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{formatDate(t.created_at, true)}</DataTable.Td>
                <DataTable.Td className="sd-table-actions">
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Actions for ${t.name}`}
                      >
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        component={Link}
                        to={`/app/templates/${t.id}/prepare`}
                        leftSection={<IconLayout size={14} />}
                      >
                        Edit layout
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconArchive size={14} />}
                        disabled={archive.isPending}
                        onClick={() => {
                          if (window.confirm(`Archive template “${t.name}”?`)) {
                            archive.mutate(t.id)
                          }
                        }}
                      >
                        Archive
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title="New template"
        size="lg"
      >
        <Stack>
          <TextInput label="Name" required {...form.getInputProps('name')} />
          <div>
            <Text size="sm" fw={500} mb={6}>
              Source PDF
            </Text>
            <SegmentedControl
              fullWidth
              value={pdfSource}
              onChange={(v) => setPdfSource(v as 'upload' | 'existing')}
              data={[
                { label: 'Upload new', value: 'upload' },
                { label: 'Existing document', value: 'existing' },
              ]}
              mb="sm"
            />
            {pdfSource === 'upload' ? (
              <Dropzone
                onDrop={(files) => {
                  const next = files[0]
                  if (!next) return
                  setFile(next)
                  if (!form.values.name) {
                    form.setFieldValue('name', next.name.replace(/\.pdf$/i, ''))
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
                      Max 25MB — place fields on this PDF next
                    </Text>
                  </div>
                </Group>
              </Dropzone>
            ) : (
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
            )}
          </div>
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create & place fields
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
