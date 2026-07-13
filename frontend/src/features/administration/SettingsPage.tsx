import {
  Anchor,
  Badge,
  Button,
  ColorSwatch,
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
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconBuilding,
  IconCheck,
  IconMail,
  IconPalette,
  IconPencil,
  IconRestore,
  IconSignature,
  IconUsers,
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { api, ApiError } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { toAppMediaUrl } from '../../shared/mediaUrl'
import { useAuth } from '../auth/AuthContext'

const ACCENT_COLOR_PRESETS = [
  { color: '#0B6E4F', name: 'Forest' },
  { color: '#1B4D3E', name: 'Deep green' },
  { color: '#9F1239', name: 'Rose' },
  { color: '#1D4ED8', name: 'Blue' },
  { color: '#B45309', name: 'Amber' },
] as const

function SettingsSection({
  title,
  description,
  children,
  actions,
  headerAction,
  wide,
  flush,
}: {
  title: string
  description: string
  children: ReactNode
  actions?: ReactNode
  headerAction?: ReactNode
  wide?: boolean
  flush?: boolean
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
      <div className={`sd-settings-panel__body${flush ? ' sd-settings-panel__body--flush' : ''}`}>
        {children}
      </div>
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

type EmailTemplateRow = {
  key: string
  label: string
  description: string
  subject: string
  body: string
  available_placeholders: string[]
  cta_label: string
  updated_at: string
}

function buildEmailPreviewHtml({
  tenantName,
  accentColor,
  brandUrl,
  subject,
  body,
  ctaLabel,
}: {
  tenantName: string
  accentColor: string
  brandUrl: string | null
  subject: string
  body: string
  ctaLabel: string
}) {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const withBreaks = escape(part).replace(/\n/g, '<br>')
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2937;">${withBreaks}</p>`
    })
    .join('')

  const brand = brandUrl
    ? `<img src="${escape(brandUrl)}" alt="${escape(tenantName)}" style="max-height:48px;max-width:200px;display:block;border:0;" />`
    : `<div style="font-size:20px;font-weight:700;color:${escape(accentColor)};">${escape(tenantName)}</div>`

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:16px;background:#f3f4f6;font-family:system-ui,sans-serif;">
  <div style="margin-bottom:12px;font-size:13px;color:#6b7280;"><strong>Subject:</strong> ${escape(subject || '(empty)')}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;">
    <tr><td style="padding:24px 28px 16px;border-bottom:3px solid ${escape(accentColor)};">${brand}</td></tr>
    <tr><td style="padding:28px;">
      ${paragraphs || '<p style="color:#9ca3af;">Message body preview</p>'}
      <div style="margin-top:8px;">
        <span style="display:inline-block;padding:12px 22px;border-radius:6px;background:${escape(accentColor)};color:#fff;font-weight:600;font-size:15px;">${escape(ctaLabel)}</span>
      </div>
    </td></tr>
    <tr><td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">Sent by ${escape(tenantName)} via SignDesk</td></tr>
  </table>
</body></html>`
}

function EmailPreviewIframe({ srcDoc }: { srcDoc: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(240)

  const resizeToContent = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.documentElement) return
    const next = Math.ceil(
      Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0),
    )
    if (next > 0) setHeight(next)
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      resizeToContent()
      // Images (logo/icon) may load after first paint and change height.
      const imgs = iframeRef.current?.contentDocument?.images
      if (!imgs?.length) return
      Array.from(imgs).forEach((img) => {
        if (img.complete) return
        img.addEventListener('load', resizeToContent, { once: true })
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [srcDoc])

  return (
    <iframe
      ref={iframeRef}
      title="Email preview"
      className="sd-email-preview"
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      scrolling="no"
      onLoad={resizeToContent}
      style={{ height }}
    />
  )
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
  const [selectedEmailKey, setSelectedEmailKey] = useState<string | null>(null)
  const [editingEmail, setEditingEmail] = useState(false)

  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ results?: any[] } | any[]>('/api/tenant/members/'),
  })

  const { data: invitations } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api<{ results?: any[] } | any[]>('/api/tenant/invitations/'),
  })

  const { data: emailTemplates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api<EmailTemplateRow[]>('/api/tenant/email-templates/'),
    enabled: isAdmin,
  })

  const selectedEmailTemplate = useMemo(() => {
    if (!emailTemplates.length) return null
    const key = selectedEmailKey || emailTemplates[0]?.key
    return emailTemplates.find((t) => t.key === key) || emailTemplates[0] || null
  }, [emailTemplates, selectedEmailKey])

  useEffect(() => {
    if (!selectedEmailKey && emailTemplates[0]?.key) {
      setSelectedEmailKey(emailTemplates[0].key)
    }
  }, [emailTemplates, selectedEmailKey])

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

  const emailForm = useForm({
    initialValues: {
      subject: '',
      body: '',
    },
  })

  useEffect(() => {
    if (!selectedEmailTemplate || editingEmail) return
    emailForm.setValues({
      subject: selectedEmailTemplate.subject,
      body: selectedEmailTemplate.body,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmailTemplate?.key, selectedEmailTemplate?.subject, selectedEmailTemplate?.body, editingEmail])

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
    if (!iconFile) setIconPreview(toAppMediaUrl(tenant.icon))
    if (!logoFile) setLogoPreview(toAppMediaUrl(tenant.logo))
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

  const restoreAcknowledgement = useMutation({
    mutationFn: () =>
      api('/api/tenant/settings/restore-esign-acknowledgement/', { method: 'POST' }),
    onSuccess: async () => {
      await refreshMe()
      setEditingAcknowledgement(false)
      notifications.show({
        color: 'forest',
        message: 'Restored default ESIGN/UETA disclosure',
      })
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? String(err.message) : 'Could not restore default disclosure'
      notifications.show({ color: 'red', message })
    },
  })

  const saveEmailTemplate = useMutation({
    mutationFn: (values: { subject: string; body: string }) =>
      api<EmailTemplateRow>(`/api/tenant/email-templates/${selectedEmailTemplate?.key}/`, {
        method: 'PATCH',
        json: values,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      setEditingEmail(false)
      notifications.show({ color: 'forest', message: 'Email template saved' })
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? String(err.message) : 'Could not save email template'
      notifications.show({ color: 'red', message })
    },
  })

  const restoreEmailTemplate = useMutation({
    mutationFn: () =>
      api<EmailTemplateRow>(
        `/api/tenant/email-templates/${selectedEmailTemplate?.key}/restore/`,
        { method: 'POST' },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      setEditingEmail(false)
      notifications.show({ color: 'forest', message: 'Restored default email template' })
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? String(err.message) : 'Could not restore email template'
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

  const cancelEmailEdit = () => {
    if (selectedEmailTemplate) {
      emailForm.setValues({
        subject: selectedEmailTemplate.subject,
        body: selectedEmailTemplate.body,
      })
    }
    setEditingEmail(false)
  }

  const acknowledgementText =
    tenant?.esign_acknowledgement?.trim() ||
    'No disclosure text has been set yet. Signers will see the platform default ESIGN/UETA notice until you add one.'

  const emailPreviewSrcDoc = useMemo(() => {
    if (!selectedEmailTemplate || !tenant) return ''
    const subject = editingEmail ? emailForm.values.subject : selectedEmailTemplate.subject
    const body = editingEmail ? emailForm.values.body : selectedEmailTemplate.body
    return buildEmailPreviewHtml({
      tenantName: tenant.name || 'Workspace',
      accentColor: tenant.accent_color || '#0B6E4F',
      brandUrl: logoPreview || iconPreview,
      subject,
      body,
      ctaLabel: selectedEmailTemplate.cta_label,
    })
  }, [
    selectedEmailTemplate,
    tenant,
    editingEmail,
    emailForm.values.subject,
    emailForm.values.body,
    logoPreview,
    iconPreview,
  ])

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
        <Text c="dimmed">Manage workspace details, branding, email templates, and signing defaults.</Text>
      </div>

      <Tabs defaultValue="workspace" className="sd-settings-tabs">
        <Tabs.List>
          <Tabs.Tab value="workspace" leftSection={<IconBuilding size={16} stroke={1.5} />}>
            Workspace
          </Tabs.Tab>
          <Tabs.Tab value="branding" leftSection={<IconPalette size={16} stroke={1.5} />}>
            Branding
          </Tabs.Tab>
          <Tabs.Tab value="email" leftSection={<IconMail size={16} stroke={1.5} />}>
            Email
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
                <Stack gap={6}>
                  <Text size="sm" fw={500}>
                    Accent color
                  </Text>
                  <Text size="xs" c="dimmed">
                    Used for buttons and highlights on the signing page
                  </Text>
                  <Group gap="sm" mt={4}>
                    {ACCENT_COLOR_PRESETS.map(({ color, name }) => {
                      const selected =
                        workspaceForm.values.accent_color.toLowerCase() === color.toLowerCase()
                      return (
                        <Tooltip key={color} label={name} withArrow>
                          <ColorSwatch
                            color={color}
                            component="button"
                            type="button"
                            aria-label={name}
                            aria-pressed={selected}
                            onClick={() => workspaceForm.setFieldValue('accent_color', color)}
                            style={{
                              cursor: 'pointer',
                              color: '#fff',
                              boxShadow: selected
                                ? `0 0 0 2px var(--mantine-color-body), 0 0 0 4px ${color}`
                                : undefined,
                            }}
                          >
                            {selected ? <IconCheck size={14} stroke={3} /> : null}
                          </ColorSwatch>
                        </Tooltip>
                      )
                    })}
                  </Group>
                </Stack>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <AssetUpload
                    label="Icon"
                    hint="Workspace header, collapsed nav, and browser tab"
                    preview={iconPreview}
                    fileName={iconFile?.name || null}
                    onChange={setIconFile}
                  />
                  <AssetUpload
                    label="Company logo"
                    hint="Shown to signers on the signing page"
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

        <Tabs.Panel value="email" pt="lg">
          <SettingsSection
            title="Email templates"
            description="Customize the messages SignDesk sends for invitations, signing, reminders, and completion. Your logo or icon from Branding appears in the email header."
            wide
            flush
          >
            {selectedEmailTemplate ? (
              <div className="sd-email-workspace">
                <nav className="sd-email-workspace__nav" aria-label="Email templates">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" className="sd-email-workspace__nav-label">
                    Templates
                  </Text>
                  <Stack gap={4}>
                    {emailTemplates.map((t) => {
                      const active = t.key === selectedEmailTemplate.key
                      return (
                        <UnstyledButton
                          key={t.key}
                          className={`sd-email-workspace__nav-item${active ? ' is-active' : ''}`}
                          onClick={() => {
                            if (t.key === selectedEmailTemplate.key) return
                            setSelectedEmailKey(t.key)
                            setEditingEmail(false)
                          }}
                        >
                          <Text size="sm" fw={active ? 600 : 500}>
                            {t.label}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                            {t.description}
                          </Text>
                        </UnstyledButton>
                      )
                    })}
                  </Stack>
                </nav>

                <div className="sd-email-workspace__main">
                  {editingEmail ? (
                    <form
                      className="sd-email-workspace__content"
                      onSubmit={emailForm.onSubmit((values) => saveEmailTemplate.mutate(values))}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                        <div style={{ minWidth: 0 }}>
                          <Title order={5}>{selectedEmailTemplate.label}</Title>
                          <Text size="sm" c="dimmed" mt={2}>
                            {selectedEmailTemplate.description}
                          </Text>
                        </div>
                        <Group gap="sm" wrap="nowrap">
                          <Button
                            type="button"
                            variant="default"
                            onClick={cancelEmailEdit}
                            disabled={saveEmailTemplate.isPending}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" loading={saveEmailTemplate.isPending}>
                            {saveEmailTemplate.isPending ? 'Saving…' : 'Save changes'}
                          </Button>
                        </Group>
                      </Group>

                      <Group gap={6} mt="md">
                        {selectedEmailTemplate.available_placeholders.map((placeholder) => (
                          <Badge
                            key={placeholder}
                            variant="light"
                            color="gray"
                            radius="sm"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              const token = `{{${placeholder}}}`
                              const current = emailForm.values.body
                              const next =
                                current && !/\s$/.test(current) ? `${current} ${token}` : `${current}${token}`
                              emailForm.setFieldValue('body', next)
                            }}
                          >
                            {`{{${placeholder}}}`}
                          </Badge>
                        ))}
                      </Group>

                      <Stack gap="md" mt="md">
                        <TextInput label="Subject" {...emailForm.getInputProps('subject')} />
                        <Textarea
                          label="Body"
                          description="Plain text. Click a placeholder to insert it. Newlines become paragraphs in the email."
                          minRows={14}
                          autosize
                          {...emailForm.getInputProps('body')}
                        />
                      </Stack>
                    </form>
                  ) : (
                    <div className="sd-email-workspace__content">
                      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                        <div style={{ minWidth: 0 }}>
                          <Title order={5}>{selectedEmailTemplate.label}</Title>
                          <Text size="sm" c="dimmed" mt={2}>
                            {selectedEmailTemplate.description}
                          </Text>
                        </div>
                        <Group gap="sm" wrap="nowrap">
                          <Button
                            variant="default"
                            leftSection={<IconRestore size={14} />}
                            loading={restoreEmailTemplate.isPending}
                            onClick={() => restoreEmailTemplate.mutate()}
                          >
                            Restore default
                          </Button>
                          <Button
                            variant="light"
                            leftSection={<IconPencil size={14} />}
                            onClick={() => {
                              emailForm.setValues({
                                subject: selectedEmailTemplate.subject,
                                body: selectedEmailTemplate.body,
                              })
                              setEditingEmail(true)
                            }}
                          >
                            Edit
                          </Button>
                        </Group>
                      </Group>

                      <Stack gap="md" mt="md">
                        <div>
                          <Text size="sm" fw={600}>
                            Subject
                          </Text>
                          <Text size="sm" mt={4}>
                            {selectedEmailTemplate.subject}
                          </Text>
                        </div>
                        <div>
                          <Text size="sm" fw={600}>
                            Body
                          </Text>
                          <Text
                            size="sm"
                            mt={4}
                            className="sd-acknowledgement-preview"
                            style={{ whiteSpace: 'pre-wrap' }}
                          >
                            {selectedEmailTemplate.body}
                          </Text>
                        </div>
                      </Stack>
                    </div>
                  )}

                  <div className="sd-email-workspace__preview">
                    <Text size="sm" fw={600} mb={6}>
                      Preview
                    </Text>
                    <div className="sd-email-workspace__preview-sticky">
                      <EmailPreviewIframe srcDoc={emailPreviewSrcDoc} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Text size="sm" c="dimmed" p="md">
                Loading email templates…
              </Text>
            )}
          </SettingsSection>
        </Tabs.Panel>

        <Tabs.Panel value="esign" pt="lg">
          {editingAcknowledgement ? (
            <form onSubmit={acknowledgementForm.onSubmit((v) => saveAcknowledgement.mutate(v))}>
              <SettingsSection
                title="E-signature disclosure"
                description="Shown to signers before they can continue. Signers keep a snapshot of the exact text they accepted—later edits only apply to new consents. Saving creates a new version."
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
                  label="Disclosure text"
                  description="Include ESIGN/UETA consent, hardware/software requirements, paper copies, withdrawal, and how to get records"
                  minRows={12}
                  autosize
                  {...acknowledgementForm.getInputProps('esign_acknowledgement')}
                />
              </SettingsSection>
            </form>
          ) : (
            <SettingsSection
              title="E-signature disclosure"
              description="Legal notice shown to signers before they can continue. Signers accept a snapshot of this text; editing here does not change disclosures already accepted."
              actions={
                <Group gap="sm">
                  <Badge variant="light" color="gray" size="lg" radius="sm">
                    Version {tenant?.esign_acknowledgement_version || '—'}
                  </Badge>
                  <Button
                    variant="default"
                    leftSection={<IconRestore size={14} />}
                    loading={restoreAcknowledgement.isPending}
                    onClick={() => restoreAcknowledgement.mutate()}
                  >
                    Restore default
                  </Button>
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
                  Disclosure text
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
