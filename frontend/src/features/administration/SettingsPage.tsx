import {
  Anchor,
  Badge,
  Button,
  ColorInput,
  FileButton,
  Group,
  Image,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconBuilding,
  IconPalette,
  IconPencil,
  IconSignature,
  IconUsers,
} from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { api, ApiError } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { useAuth } from '../auth/AuthContext'

function mediaPath(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname.startsWith('/media/')) return parsed.pathname
  } catch {
    /* ignore */
  }
  return url
}

function SettingsSection({
  title,
  description,
  children,
  actions,
  headerAction,
  wide,
}: {
  title: string
  description: string
  children: ReactNode
  actions?: ReactNode
  headerAction?: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`sd-settings-panel${wide ? ' sd-settings-panel--wide' : ''}`}>
      <div className="sd-settings-panel__header">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <div>
            <Title order={4}>{title}</Title>
            <Text size="sm" c="dimmed" maw={520}>
              {description}
            </Text>
          </div>
          {headerAction}
        </Group>
      </div>
      <div className="sd-settings-panel__body">{children}</div>
      {actions ? <div className="sd-settings-panel__footer">{actions}</div> : null}
    </div>
  )
}

function AssetUpload({
  label,
  hint,
  preview,
  previewWide,
  fileName,
  onChange,
}: {
  label: string
  hint: string
  preview: string | null
  previewWide?: boolean
  fileName: string | null
  onChange: (file: File | null) => void
}) {
  const placeholderStyle = previewWide
    ? { width: 168, height: 64 }
    : { width: 64, height: 64 }

  return (
    <div className="sd-asset-upload">
      <div>
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      </div>
      <Group gap="md" align="center" wrap="nowrap">
        <div className="sd-asset-upload__preview" style={placeholderStyle}>
          {preview ? (
            <Image
              src={preview}
              alt={`${label} preview`}
              w="100%"
              h="100%"
              fit="contain"
            />
          ) : null}
        </div>
        <Stack gap={6}>
          <FileButton onChange={onChange} accept="image/*">
            {(props) => (
              <Button {...props} variant="light" size="xs">
                {fileName ? 'Replace image' : 'Upload image'}
              </Button>
            )}
          </FileButton>
          {fileName ? (
            <Text size="xs" c="dimmed" lineClamp={1} maw={160}>
              {fileName}
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              PNG, JPG, or SVG
            </Text>
          )}
        </Stack>
      </Group>
    </div>
  )
}

function roleBadgeColor(role: string) {
  if (role === 'owner') return 'forest'
  if (role === 'admin') return 'teal'
  return 'gray'
}

export function SettingsPage() {
  const { tenant, membership, refreshMe } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [editingAcknowledgement, setEditingAcknowledgement] = useState(false)
  const [inviteOpened, { open: openInvite, close: closeInvite }] = useDisclosure(false)

  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ results?: any[] } | any[]>('/api/tenant/members/'),
  })

  const { data: invitations } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api<{ results?: any[] } | any[]>('/api/tenant/invitations/'),
  })

  const inviteForm = useForm({
    initialValues: {
      email: '',
      role: 'member',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Enter a valid email'),
    },
  })

  const workspaceForm = useForm({
    initialValues: {
      name: tenant?.name || '',
      accent_color: tenant?.accent_color || '#0B6E4F',
      timezone: tenant?.timezone || 'UTC',
      default_expiration_days: tenant?.default_expiration_days || 14,
    },
  })

  const acknowledgementForm = useForm({
    initialValues: {
      esign_acknowledgement: tenant?.esign_acknowledgement || '',
    },
  })

  useEffect(() => {
    if (!tenant) return
    workspaceForm.setValues({
      name: tenant.name || '',
      accent_color: tenant.accent_color || '#0B6E4F',
      timezone: tenant.timezone || 'UTC',
      default_expiration_days: tenant.default_expiration_days || 14,
    })
    acknowledgementForm.setValues({
      esign_acknowledgement: tenant.esign_acknowledgement || '',
    })
    if (!iconFile) setIconPreview(mediaPath(tenant.icon))
    if (!logoFile) setLogoPreview(mediaPath(tenant.logo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, tenant?.icon, tenant?.logo, tenant?.esign_acknowledgement, tenant?.name])

  useEffect(() => {
    if (!iconFile) return
    const url = URL.createObjectURL(iconFile)
    setIconPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [iconFile])

  useEffect(() => {
    if (!logoFile) return
    const url = URL.createObjectURL(logoFile)
    setLogoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  const saveWorkspace = useMutation({
    mutationFn: async (values: typeof workspaceForm.values) => {
      if (iconFile || logoFile) {
        const fd = new FormData()
        fd.append('name', values.name)
        fd.append('accent_color', values.accent_color)
        fd.append('timezone', values.timezone)
        fd.append('default_expiration_days', String(values.default_expiration_days))
        if (iconFile) fd.append('icon', iconFile)
        if (logoFile) fd.append('logo', logoFile)
        return api('/api/tenant/settings/', { method: 'PATCH', formData: fd })
      }
      return api('/api/tenant/settings/', { method: 'PATCH', json: values })
    },
    onSuccess: async () => {
      setIconFile(null)
      setLogoFile(null)
      await refreshMe()
      notifications.show({ color: 'forest', message: 'Settings saved' })
    },
    onError: (err) => {
      const message = err instanceof ApiError ? String(err.message) : 'Could not save settings'
      notifications.show({ color: 'red', message })
    },
  })

  const saveAcknowledgement = useMutation({
    mutationFn: (values: typeof acknowledgementForm.values) =>
      api('/api/tenant/settings/', { method: 'PATCH', json: values }),
    onSuccess: async () => {
      await refreshMe()
      setEditingAcknowledgement(false)
      notifications.show({ color: 'forest', message: 'Acknowledgement saved' })
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? String(err.message) : 'Could not save acknowledgement'
      notifications.show({ color: 'red', message })
    },
  })

  const inviteMember = useMutation({
    mutationFn: (values: typeof inviteForm.values) =>
      api('/api/tenant/invitations/', { method: 'POST', json: values }),
    onSuccess: () => {
      inviteForm.reset()
      closeInvite()
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      notifications.show({
        color: 'forest',
        title: 'Invitation sent',
        message: 'They’ll get an email to set up their account.',
      })
    },
    onError: (err) => {
      let message = 'Could not send invitation'
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, unknown>
        const emailErr = data.email
        if (Array.isArray(emailErr) && emailErr[0]) message = String(emailErr[0])
        else if (typeof data.detail === 'string') message = data.detail
        else message = err.message
      }
      notifications.show({ color: 'red', message })
    },
  })

  const resendInvite = useMutation({
    mutationFn: (id: number) =>
      api(`/api/tenant/invitations/${id}/resend/`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      notifications.show({ color: 'forest', message: 'Invitation resent' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not resend',
      })
    },
  })

  const revokeInvite = useMutation({
    mutationFn: (id: number) =>
      api(`/api/tenant/invitations/${id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      notifications.show({ color: 'forest', message: 'Invitation revoked' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not revoke',
      })
    },
  })

  const cancelAcknowledgementEdit = () => {
    acknowledgementForm.setValues({
      esign_acknowledgement: tenant?.esign_acknowledgement || '',
    })
    setEditingAcknowledgement(false)
  }

  const acknowledgementText =
    tenant?.esign_acknowledgement?.trim() ||
    'No acknowledgement text has been set yet. Signers will see a default notice until you add one.'

  if (!isAdmin) {
    return <Navigate to="/app" replace />
  }

  const memberRows = Array.isArray(members) ? members : members?.results || []
  const inviteRows = Array.isArray(invitations) ? invitations : invitations?.results || []
  const saveLabel = saveWorkspace.isPending ? 'Saving…' : 'Save changes'

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Settings</Title>
        <Text c="dimmed">Manage workspace details, branding, and signing defaults.</Text>
      </div>

      <Tabs defaultValue="workspace" className="sd-settings-tabs">
        <Tabs.List>
          <Tabs.Tab value="workspace" leftSection={<IconBuilding size={16} stroke={1.5} />}>
            Workspace
          </Tabs.Tab>
          <Tabs.Tab value="branding" leftSection={<IconPalette size={16} stroke={1.5} />}>
            Branding
          </Tabs.Tab>
          <Tabs.Tab value="esign" leftSection={<IconSignature size={16} stroke={1.5} />}>
            E-signature
          </Tabs.Tab>
          <Tabs.Tab value="members" leftSection={<IconUsers size={16} stroke={1.5} />}>
            Members
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="workspace" pt="lg">
          <form onSubmit={workspaceForm.onSubmit((v) => saveWorkspace.mutate(v))}>
            <SettingsSection
              title="Workspace"
              description="Core identity and defaults used across envelopes and notifications."
              actions={
                <Button type="submit" loading={saveWorkspace.isPending}>
                  {saveLabel}
                </Button>
              }
            >
              <Stack gap="md">
                <TextInput
                  label="Workspace name"
                  description="Shown in the app header and on signing pages"
                  {...workspaceForm.getInputProps('name')}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="Timezone"
                    description="Used for expiration and activity timestamps"
                    {...workspaceForm.getInputProps('timezone')}
                  />
                  <NumberInput
                    label="Default expiration"
                    description="Days until unsigned envelopes expire"
                    min={1}
                    suffix=" days"
                    {...workspaceForm.getInputProps('default_expiration_days')}
                  />
                </SimpleGrid>
              </Stack>
            </SettingsSection>
          </form>
        </Tabs.Panel>

        <Tabs.Panel value="branding" pt="lg">
          <form onSubmit={workspaceForm.onSubmit((v) => saveWorkspace.mutate(v))}>
            <SettingsSection
              title="Branding"
              description="Customize how SignDesk appears to your team and signers."
              actions={
                <Button type="submit" loading={saveWorkspace.isPending}>
                  {saveLabel}
                </Button>
              }
            >
              <Stack gap="lg">
                <ColorInput
                  label="Accent color"
                  description="Primary action color across the workspace"
                  format="hex"
                  swatches={['#0B6E4F', '#1B4D3E', '#0F766E', '#1D4ED8', '#B45309']}
                  {...workspaceForm.getInputProps('accent_color')}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <AssetUpload
                    label="Icon"
                    hint="Square mark for compact spaces"
                    preview={iconPreview}
                    fileName={iconFile?.name || null}
                    onChange={setIconFile}
                  />
                  <AssetUpload
                    label="Company logo"
                    hint="Used on signing pages and emails"
                    preview={logoPreview}
                    previewWide
                    fileName={logoFile?.name || null}
                    onChange={setLogoFile}
                  />
                </SimpleGrid>
              </Stack>
            </SettingsSection>
          </form>
        </Tabs.Panel>

        <Tabs.Panel value="esign" pt="lg">
          {editingAcknowledgement ? (
            <form onSubmit={acknowledgementForm.onSubmit((v) => saveAcknowledgement.mutate(v))}>
              <SettingsSection
                title="E-signature acknowledgement"
                description="Legal notice shown to signers before they can continue. Saving creates a new version."
                actions={
                  <Group gap="sm">
                    <Badge variant="light" color="gray" size="lg" radius="sm">
                      Version {tenant?.esign_acknowledgement_version || '—'}
                    </Badge>
                    <Button
                      type="button"
                      variant="default"
                      onClick={cancelAcknowledgementEdit}
                      disabled={saveAcknowledgement.isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" loading={saveAcknowledgement.isPending}>
                      {saveAcknowledgement.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                  </Group>
                }
              >
                <Textarea
                  label="Acknowledgement text"
                  description="Keep this clear and specific to your compliance requirements"
                  minRows={8}
                  autosize
                  {...acknowledgementForm.getInputProps('esign_acknowledgement')}
                />
              </SettingsSection>
            </form>
          ) : (
            <SettingsSection
              title="E-signature acknowledgement"
              description="Legal notice shown to signers before they can continue."
              actions={
                <Group gap="sm">
                  <Badge variant="light" color="gray" size="lg" radius="sm">
                    Version {tenant?.esign_acknowledgement_version || '—'}
                  </Badge>
                  <Button
                    variant="light"
                    leftSection={<IconPencil size={14} />}
                    onClick={() => {
                      acknowledgementForm.setValues({
                        esign_acknowledgement: tenant?.esign_acknowledgement || '',
                      })
                      setEditingAcknowledgement(true)
                    }}
                  >
                    Edit
                  </Button>
                </Group>
              }
            >
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Acknowledgement text
                </Text>
                <Text
                  size="sm"
                  className="sd-acknowledgement-preview"
                  c={tenant?.esign_acknowledgement?.trim() ? undefined : 'dimmed'}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {acknowledgementText}
                </Text>
              </Stack>
            </SettingsSection>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="members" pt="lg">
          <Stack gap="lg">
            <SettingsSection
              title="Members"
              description={`${memberRows.length} ${memberRows.length === 1 ? 'person' : 'people'} with access to this workspace.`}
              wide
              headerAction={
                <Anchor component="button" type="button" fw={600} onClick={openInvite}>
                  Invite a member
                </Anchor>
              }
            >
              <DataTable embedded>
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Name</DataTable.Th>
                    <DataTable.Th>Email</DataTable.Th>
                    <DataTable.Th>Role</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {memberRows.map(
                    (m: { id: number; full_name: string; email: string; role: string }) => (
                      <DataTable.Tr key={m.id}>
                        <DataTable.Td className="sd-table-primary">{m.full_name}</DataTable.Td>
                        <DataTable.Td className="sd-table-muted">{m.email}</DataTable.Td>
                        <DataTable.Td>
                          <Badge
                            variant="light"
                            color={roleBadgeColor(m.role)}
                            tt="capitalize"
                            radius="sm"
                          >
                            {m.role}
                          </Badge>
                        </DataTable.Td>
                      </DataTable.Tr>
                    ),
                  )}
                </DataTable.Tbody>
              </DataTable>
            </SettingsSection>

            {inviteRows.length > 0 ? (
              <SettingsSection
                title="Pending invitations"
                description="Invites expire after 7 days. Resend to renew the link."
                wide
              >
                <DataTable embedded>
                  <DataTable.Thead>
                    <DataTable.Tr>
                      <DataTable.Th>Email</DataTable.Th>
                      <DataTable.Th>Role</DataTable.Th>
                      <DataTable.Th>Expires</DataTable.Th>
                      <DataTable.Th>Actions</DataTable.Th>
                    </DataTable.Tr>
                  </DataTable.Thead>
                  <DataTable.Tbody>
                    {inviteRows.map(
                      (inv: {
                        id: number
                        email: string
                        role: string
                        expires_at: string
                        is_expired: boolean
                      }) => (
                        <DataTable.Tr key={inv.id}>
                          <DataTable.Td className="sd-table-primary">{inv.email}</DataTable.Td>
                          <DataTable.Td>
                            <Badge
                              variant="light"
                              color={roleBadgeColor(inv.role)}
                              tt="capitalize"
                              radius="sm"
                            >
                              {inv.role}
                            </Badge>
                          </DataTable.Td>
                          <DataTable.Td className="sd-table-muted">
                            {inv.is_expired
                              ? 'Expired'
                              : new Date(inv.expires_at).toLocaleDateString()}
                          </DataTable.Td>
                          <DataTable.Td>
                            <Group gap="xs">
                              <Button
                                size="compact-xs"
                                variant="light"
                                loading={resendInvite.isPending}
                                onClick={() => resendInvite.mutate(inv.id)}
                              >
                                Resend
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                loading={revokeInvite.isPending}
                                onClick={() => revokeInvite.mutate(inv.id)}
                              >
                                Revoke
                              </Button>
                            </Group>
                          </DataTable.Td>
                        </DataTable.Tr>
                      ),
                    )}
                  </DataTable.Tbody>
                </DataTable>
              </SettingsSection>
            ) : null}
          </Stack>

          <Modal
            opened={inviteOpened}
            onClose={() => {
              inviteForm.reset()
              closeInvite()
            }}
            title="Invite a member"
            size="lg"
          >
            <form onSubmit={inviteForm.onSubmit((v) => inviteMember.mutate(v))}>
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Send an email so they can create a password and join this workspace.
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="Email"
                    type="email"
                    placeholder="teammate@company.com"
                    required
                    {...inviteForm.getInputProps('email')}
                  />
                  <Select
                    label="Role"
                    data={[
                      { value: 'member', label: 'Member — day-to-day access' },
                      { value: 'admin', label: 'Admin — can manage settings' },
                    ]}
                    {...inviteForm.getInputProps('role')}
                  />
                </SimpleGrid>
                <Group justify="flex-end">
                  <Button type="submit" loading={inviteMember.isPending}>
                    {inviteMember.isPending ? 'Sending…' : 'Send invitation'}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Modal>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
