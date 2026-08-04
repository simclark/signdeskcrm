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
  FileButton,
} from '@mantine/core'
import { Dropzone, PDF_MIME_TYPE } from '@mantine/dropzone'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconArchive,
  IconBooks,
  IconCopy,
  IconDotsVertical,
  IconFileTypePdf,
  IconLayout,
  IconSend,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCreateEnvelope } from '../envelopes/CreateEnvelopeContext'
import { api } from '../../shared/api'
import { useConfirm } from '../../shared/confirm'
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
  const confirm = useConfirm()
  const { openCreateEnvelope } = useCreateEnvelope()
  const { membership } = useAuth()
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'
  const [opened, { open, close }] = useDisclosure(false)
  const [importOpened, { open: openImport, close: closeImport }] = useDisclosure(false)
  const [pdfSource, setPdfSource] = useState<'upload' | 'existing'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importFieldMap, setImportFieldMap] = useState<File | null>(null)
  const [view, setView] = useState<'all' | 'library'>('all')

  const { data } = useQuery({
    queryKey: ['templates', view],
    queryFn: () =>
      api<{ results: TemplateListItem[] }>(
        view === 'library' ? '/api/templates/?library=true' : '/api/templates/',
      ),
  })

  const { data: documents } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ results: DocumentRow[] }>('/api/documents/'),
    enabled: opened,
  })

  const form = useForm({
    initialValues: { name: '', document: '' },
  })
  const importForm = useForm({
    initialValues: { name: '', category: 'general' },
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

  const importTemplate = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Choose a PDF to import')
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('name', importForm.values.name.trim() || importFile.name.replace(/\.pdf$/i, ''))
      fd.append('category', importForm.values.category || 'general')
      if (importFieldMap) {
        const text = await importFieldMap.text()
        fd.append('field_map', text)
      }
      return api<TemplateListItem & { imported_field_count: number; import_source: string }>(
        '/api/templates/import/',
        { method: 'POST', formData: fd },
      )
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      closeImport()
      importForm.reset()
      setImportFile(null)
      setImportFieldMap(null)
      notifications.show({
        color: 'forest',
        message: `Imported ${template.imported_field_count} field(s) via ${template.import_source}`,
      })
      navigate(`/app/templates/${template.id}/prepare`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Import failed', message: err.message }),
  })

  const clone = useMutation({
    mutationFn: (templateId: number) =>
      api<TemplateListItem>(`/api/templates/${templateId}/clone/`, { method: 'POST', json: {} }),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({ color: 'forest', message: 'Template cloned' })
      navigate(`/app/templates/${template.id}/prepare`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not clone', message: err.message }),
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

  async function confirmArchive(template: TemplateListItem) {
    const ok = await confirm({
      title: 'Archive template',
      message: `Archive template “${template.name}”?`,
      confirmLabel: 'Archive',
      danger: true,
    })
    if (ok) archive.mutate(template.id)
  }

  const addToLibrary = useMutation({
    mutationFn: (templateId: number) =>
      api<TemplateListItem>(`/api/templates/${templateId}/add-to-library/`, {
        method: 'POST',
        json: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({ color: 'forest', message: 'Added to Shared library' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not add to library', message: err.message }),
  })

  const removeFromLibrary = useMutation({
    mutationFn: (templateId: number) =>
      api<TemplateListItem>(`/api/templates/${templateId}/remove-from-library/`, {
        method: 'POST',
        json: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({ color: 'forest', message: 'Removed from Shared library' })
    },
    onError: (err: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not remove from library',
        message: err.message,
      }),
  })

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Templates</Title>
          <Text c="dimmed">
            Reusable field layouts for your workspace. Publish templates to the Shared library so
            teammates can use and clone them without editing the original. Import a PDF when you need
            to bring a layout from another tool.
          </Text>
        </div>
        <Group>
          <Button variant="light" onClick={openImport}>
            Import PDF
          </Button>
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
      </Group>

      <SegmentedControl
        value={view}
        onChange={(v) => setView(v as 'all' | 'library')}
        data={[
          { label: 'All templates', value: 'all' },
          { label: 'Shared library', value: 'library' },
        ]}
        w={320}
      />

      {(data?.results || []).length === 0 ? (
        <Text c="dimmed">
          {view === 'library'
            ? isAdmin
              ? 'No shared library forms yet. Create a template, then use Add to library.'
              : 'No shared library forms yet. Ask a workspace admin to publish templates to the Shared library.'
            : 'No templates yet. Upload a PDF, place signature fields, then reuse that layout.'}
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
            {(data?.results || []).map((t) => {
              const isShared = Boolean(t.is_library)
              const memberReadOnly = isShared && !isAdmin
              return (
              <DataTable.Tr key={t.id}>
                <DataTable.Td className="sd-table-primary">
                  <Group gap="xs">
                    <span>{t.name}</span>
                    {isShared ? (
                      <Badge size="sm" variant="light" color="teal">
                        Library
                      </Badge>
                    ) : null}
                  </Group>
                </DataTable.Td>
                <DataTable.Td>
                  <Group gap="sm" wrap="nowrap">
                    <Badge variant="light" color={t.is_active ? 'forest' : 'gray'}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {!memberReadOnly ? (
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
                    ) : null}
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
                      {t.is_active ? (
                        <Menu.Item
                          leftSection={<IconSend size={14} />}
                          onClick={() =>
                            openCreateEnvelope({
                              templateId: t.id,
                              documentId: t.document,
                              title: t.name,
                            })
                          }
                        >
                          Create envelope
                        </Menu.Item>
                      ) : null}
                      <Menu.Item
                        component={Link}
                        to={`/app/templates/${t.id}/prepare`}
                        leftSection={<IconLayout size={14} />}
                      >
                        {memberReadOnly ? 'View layout' : 'Edit layout'}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconCopy size={14} />}
                        onClick={() => clone.mutate(t.id)}
                      >
                        Clone
                      </Menu.Item>
                      {isAdmin && !t.is_library ? (
                        <Menu.Item
                          leftSection={<IconBooks size={14} />}
                          onClick={() => addToLibrary.mutate(t.id)}
                        >
                          Add to library
                        </Menu.Item>
                      ) : null}
                      {isAdmin && t.is_library ? (
                        <Menu.Item
                          leftSection={<IconBooks size={14} />}
                          onClick={() => removeFromLibrary.mutate(t.id)}
                        >
                          Remove from library
                        </Menu.Item>
                      ) : null}
                      {!memberReadOnly ? (
                        <Menu.Item
                          color="red"
                          leftSection={<IconArchive size={14} />}
                          disabled={archive.isPending}
                          onClick={() => void confirmArchive(t)}
                        >
                          Archive
                        </Menu.Item>
                      ) : null}
                    </Menu.Dropdown>
                  </Menu>
                </DataTable.Td>
              </DataTable.Tr>
              )
            })}
          </DataTable.Tbody>
        </DataTable>
      )}

      <Modal opened={opened} onClose={close} title="New template" size="lg">
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

      <Modal opened={importOpened} onClose={closeImport} title="Import PDF / field map" size="lg">
        <Stack>
          <Text size="sm" c="dimmed">
            Upload a PDF exported from DocuSign or another tool. Embedded AcroForm fields are
            detected automatically. Optionally attach a JSON field map for overlays without AcroForm.
          </Text>
          <TextInput label="Name" {...importForm.getInputProps('name')} />
          <TextInput label="Category" placeholder="general" {...importForm.getInputProps('category')} />
          <Dropzone
            onDrop={(files) => {
              const next = files[0]
              if (!next) return
              setImportFile(next)
              if (!importForm.values.name) {
                importForm.setFieldValue('name', next.name.replace(/\.pdf$/i, ''))
              }
            }}
            maxFiles={1}
            accept={PDF_MIME_TYPE}
            maxSize={25 * 1024 * 1024}
          >
            <Group justify="center" gap="md" mih={90} style={{ pointerEvents: 'none' }}>
              <IconFileTypePdf size={28} stroke={1.5} />
              <Text size="sm">{importFile ? importFile.name : 'Drop PDF or click to browse'}</Text>
            </Group>
          </Dropzone>
          <FileButton onChange={setImportFieldMap} accept="application/json,.json">
            {(props) => (
              <Button {...props} variant="light">
                {importFieldMap ? importFieldMap.name : 'Optional JSON field map'}
              </Button>
            )}
          </FileButton>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeImport}>
              Cancel
            </Button>
            <Button onClick={() => importTemplate.mutate()} loading={importTemplate.isPending}>
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
