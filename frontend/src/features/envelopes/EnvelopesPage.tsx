import {
  ActionIcon,
  Badge,
  Button,
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
  IconBan,
  IconCopy,
  IconDotsVertical,
  IconDownload,
  IconExternalLink,
  IconPencil,
  IconSend,
  IconTrash,
  IconWritingSign,
} from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
import { useConfirm } from '../../shared/confirm'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'
import { downloadMediaFile } from '../../shared/loadPdf'

type EnvelopeRow = {
  id: number
  title: string
  status: string
  recipient_count: number
  signed_file_url?: string | null
  certificate_file_url?: string | null
  created_at: string
}

export function EnvelopesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [renameEnvelope, setRenameEnvelope] = useState<EnvelopeRow | null>(null)
  const [renameOpened, { open: openRename, close: closeRename }] = useDisclosure(false)
  const renameForm = useForm({ initialValues: { title: '' } })

  const { data } = useQuery({
    queryKey: ['envelopes'],
    queryFn: () => api<{ results: EnvelopeRow[] }>('/api/envelopes/'),
  })

  const rename = useMutation({
    mutationFn: async () => {
      if (!renameEnvelope) throw new Error('No envelope selected')
      const title = renameForm.values.title.trim()
      if (!title) throw new Error('Enter a title')
      return api<EnvelopeRow>(`/api/envelopes/${renameEnvelope.id}/`, {
        method: 'PATCH',
        json: { title },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      notifications.show({ color: 'forest', message: 'Envelope renamed' })
      closeRename()
      setRenameEnvelope(null)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not rename', message: err.message }),
  })

  const send = useMutation({
    mutationFn: (id: number) => api(`/api/envelopes/${id}/send/`, { method: 'POST', json: {} }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      qc.invalidateQueries({ queryKey: ['envelope', String(id)] })
      notifications.show({ color: 'forest', message: 'Invites sent to signers' })
    },
    onError: (err: any) =>
      notifications.show({
        color: 'red',
        title: 'Could not send for signature',
        message: Array.isArray(err?.data?.errors) ? err.data.errors.join(', ') : err.message,
      }),
  })

  const resend = useMutation({
    mutationFn: (id: number) => api(`/api/envelopes/${id}/resend/`, { method: 'POST', json: {} }),
    onSuccess: () => notifications.show({ message: 'Reminders queued' }),
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not resend', message: err.message }),
  })

  const voidEnvelope = useMutation({
    mutationFn: (id: number) =>
      api(`/api/envelopes/${id}/void/`, {
        method: 'POST',
        json: { reason: 'Voided by sender' },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      notifications.show({ color: 'forest', message: 'Envelope voided' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not void', message: err.message }),
  })

  const duplicate = useMutation({
    mutationFn: (id: number) =>
      api<{ id: number }>(`/api/envelopes/${id}/duplicate/`, { method: 'POST', json: {} }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      notifications.show({ message: 'Duplicated' })
      navigate(`/app/envelopes/${data.id}/prepare`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not duplicate', message: err.message }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/envelopes/${id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      notifications.show({ color: 'forest', message: 'Draft deleted' })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not delete', message: err.message }),
  })

  function startRename(envelope: EnvelopeRow) {
    setRenameEnvelope(envelope)
    renameForm.setValues({ title: envelope.title })
    openRename()
  }

  async function confirmSend(envelope: EnvelopeRow) {
    const ok = await confirm({
      title: 'Send for signature',
      message: `Send “${envelope.title}” and email signing invites?`,
      confirmLabel: 'Send',
    })
    if (ok) send.mutate(envelope.id)
  }

  async function confirmVoid(envelope: EnvelopeRow) {
    const ok = await confirm({
      title: 'Void envelope',
      message: `Void “${envelope.title}”? Signers will be notified and the packet cannot be completed.`,
      confirmLabel: 'Void',
      danger: true,
    })
    if (ok) voidEnvelope.mutate(envelope.id)
  }

  async function confirmDelete(envelope: EnvelopeRow) {
    const ok = await confirm({
      title: 'Delete draft',
      message: `Delete “${envelope.title}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) remove.mutate(envelope.id)
  }

  async function downloadSigned(envelope: EnvelopeRow) {
    try {
      await downloadMediaFile(
        envelope.signed_file_url,
        `${envelope.title || 'document'}-signed.pdf`,
      )
    } catch (err: any) {
      notifications.show({
        color: 'red',
        title: 'Download failed',
        message: err?.message || 'Could not download signed PDF',
      })
    }
  }

  async function downloadCertificate(envelope: EnvelopeRow) {
    try {
      await downloadMediaFile(
        envelope.certificate_file_url,
        `${envelope.title || 'document'}-certificate.pdf`,
      )
    } catch (err: any) {
      notifications.show({
        color: 'red',
        title: 'Download failed',
        message: err?.message || 'Could not download certificate',
      })
    }
  }

  const busy =
    send.isPending ||
    resend.isPending ||
    voidEnvelope.isPending ||
    duplicate.isPending ||
    remove.isPending

  return (
    <Stack>
      <div>
        <Title order={2}>Envelopes</Title>
        <Text c="dimmed">Draft, send, and track signature requests.</Text>
      </div>
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Title</DataTable.Th>
            <DataTable.Th>Status</DataTable.Th>
            <DataTable.Th className="sd-table-numeric">Recipients</DataTable.Th>
            <DataTable.Th>Created</DataTable.Th>
            <DataTable.Th className="sd-table-actions" />
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {(data?.results || []).map((e) => {
            const isDraft = e.status === 'draft'
            const isActive = e.status === 'sent' || e.status === 'in_progress'
            const isCompleted = e.status === 'completed'
            return (
              <DataTable.Tr key={e.id}>
                <DataTable.Td>
                  <Text component={Link} to={`/app/envelopes/${e.id}`} className="sd-table-primary">
                    {e.title}
                  </Text>
                </DataTable.Td>
                <DataTable.Td>
                  <Badge variant="light" tt="capitalize">
                    {e.status.replaceAll('_', ' ')}
                  </Badge>
                </DataTable.Td>
                <DataTable.Td className="sd-table-numeric sd-table-muted">
                  {e.recipient_count}
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{formatDate(e.created_at, true)}</DataTable.Td>
                <DataTable.Td className="sd-table-actions">
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Actions for ${e.title}`}
                        disabled={busy}
                      >
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconExternalLink size={14} />}
                        component={Link}
                        to={`/app/envelopes/${e.id}`}
                      >
                        Open
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => startRename(e)}
                      >
                        Rename
                      </Menu.Item>
                      <Menu.Divider />
                      {isDraft ? (
                        <>
                          <Menu.Item
                            leftSection={<IconWritingSign size={14} />}
                            component={Link}
                            to={`/app/envelopes/${e.id}/prepare`}
                          >
                            Prepare / edit
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconSend size={14} />}
                            onClick={() => void confirmSend(e)}
                          >
                            Send for signature
                          </Menu.Item>
                        </>
                      ) : null}
                      {isActive ? (
                        <Menu.Item
                          leftSection={<IconSend size={14} />}
                          onClick={() => resend.mutate(e.id)}
                        >
                          Resend invites
                        </Menu.Item>
                      ) : null}
                      <Menu.Item
                        leftSection={<IconCopy size={14} />}
                        onClick={() => duplicate.mutate(e.id)}
                      >
                        Duplicate
                      </Menu.Item>
                      {isCompleted ? (
                        <>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconDownload size={14} />}
                            disabled={!e.signed_file_url}
                            onClick={() => void downloadSigned(e)}
                          >
                            Download signed PDF
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconDownload size={14} />}
                            disabled={!e.certificate_file_url}
                            onClick={() => void downloadCertificate(e)}
                          >
                            Download certificate
                          </Menu.Item>
                        </>
                      ) : null}
                      {isActive || isDraft ? <Menu.Divider /> : null}
                      {isActive ? (
                        <Menu.Item
                          color="red"
                          leftSection={<IconBan size={14} />}
                          onClick={() => void confirmVoid(e)}
                        >
                          Void…
                        </Menu.Item>
                      ) : null}
                      {isDraft ? (
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => void confirmDelete(e)}
                        >
                          Delete…
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

      <Modal
        opened={renameOpened}
        onClose={() => {
          closeRename()
          setRenameEnvelope(null)
        }}
        title="Rename envelope"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            data-autofocus
            {...renameForm.getInputProps('title')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                rename.mutate()
              }
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                closeRename()
                setRenameEnvelope(null)
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
    </Stack>
  )
}
