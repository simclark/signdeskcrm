import {
  Anchor,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ApiError, api } from '../../shared/api'
import { useConfirm } from '../../shared/confirm'
import { DataTable } from '../../shared/DataTable'

type PlatformTenantDetail = {
  id: number
  name: string
  slug: string
  status: string
  primary_contact_email: string
  primary_contact_name: string
  primary_contact_phone: string
  listings_enabled: boolean
  member_count: number
  workspace_url: string
  login_url: string
  updated_at?: string
  members: { id: number; full_name: string; email: string; role: string }[]
}

type InvitationRow = {
  id: number
  email: string
  role: string
  expires_at: string
  is_expired: boolean
  created_at: string
}

type SupportSnapshot = {
  envelope_counts: Record<string, number>
  envelope_total: number
  pending_invitations: InvitationRow[]
  last_invitation: InvitationRow | null
  active_member_count: number
  note: string
  workspace_url: string
  login_url: string
}

type OpsEvent = {
  id: number
  actor_email: string
  action: string
  tenant_slug: string
  created_at: string
  metadata: Record<string, unknown>
}

export function PlatformTenantDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [inviteEmail, setInviteEmail] = useState('')
  const [suspendOpened, { open: openSuspend, close: closeSuspend }] = useDisclosure(false)
  const [suspendConfirm, setSuspendConfirm] = useState('')
  const [supportOpened, { open: openSupport, close: closeSupport }] = useDisclosure(false)

  const { data, isLoading } = useQuery({
    queryKey: ['platform-tenant', id],
    queryFn: () => api<PlatformTenantDetail>(`/api/platform/tenants/${id}/`),
    enabled: Boolean(id),
  })

  const invitations = useQuery({
    queryKey: ['platform-tenant-invites', id],
    queryFn: () => api<InvitationRow[]>(`/api/platform/tenants/${id}/invitations/`),
    enabled: Boolean(id),
  })

  const recentOps = useQuery({
    queryKey: ['platform-ops-events', id],
    queryFn: () =>
      api<OpsEvent[] | { results: OpsEvent[] }>(`/api/platform/ops-events/?tenant=${id}`),
    enabled: Boolean(id),
  })

  const editForm = useForm({
    initialValues: {
      name: '',
      primary_contact_name: '',
      primary_contact_email: '',
      primary_contact_phone: '',
      listings_enabled: false,
    },
  })

  useEffect(() => {
    if (!data) return
    editForm.setValues({
      name: data.name,
      primary_contact_name: data.primary_contact_name || '',
      primary_contact_email: data.primary_contact_email || '',
      primary_contact_phone: data.primary_contact_phone || '',
      listings_enabled: data.listings_enabled,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when tenant payload changes
  }, [data?.id, data?.updated_at])

  const patchTenant = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/api/platform/tenants/${id}/`, { method: 'PATCH', json: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-tenant', id] })
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
      queryClient.invalidateQueries({ queryKey: ['platform-ops-events'] })
      notifications.show({ color: 'forest', message: 'Tenant updated' })
      closeSuspend()
      setSuspendConfirm('')
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not update tenant',
      })
    },
  })

  const inviteOwner = useMutation({
    mutationFn: (email?: string) =>
      api(`/api/platform/tenants/${id}/invite-owner/`, {
        method: 'POST',
        json: email ? { email } : {},
      }),
    onSuccess: () => {
      setInviteEmail('')
      queryClient.invalidateQueries({ queryKey: ['platform-tenant-invites', id] })
      queryClient.invalidateQueries({ queryKey: ['platform-ops-events'] })
      notifications.show({ color: 'forest', message: 'Admin invitation sent' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not send invite',
      })
    },
  })

  const resendInvite = useMutation({
    mutationFn: (inviteId: number) =>
      api(`/api/platform/tenants/${id}/invitations/${inviteId}/resend/`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-tenant-invites', id] })
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
    mutationFn: (inviteId: number) =>
      api(`/api/platform/tenants/${id}/invitations/${inviteId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-tenant-invites', id] })
      notifications.show({ color: 'forest', message: 'Invitation revoked' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not revoke',
      })
    },
  })

  async function confirmRevokeInvite(email: string, inviteId: number) {
    const ok = await confirm({
      title: 'Revoke invitation',
      message: `Revoke the invitation for ${email}?`,
      confirmLabel: 'Revoke',
      danger: true,
    })
    if (ok) revokeInvite.mutate(inviteId)
  }

  const seedForms = useMutation({
    mutationFn: (replace: boolean) =>
      api<{ created?: number; updated?: number; skipped?: number }>(
        `/api/platform/tenants/${id}/seed-form-library/`,
        {
          method: 'POST',
          json: { replace },
        },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['platform-ops-events'] })
      notifications.show({
        color: 'forest',
        message: `Form library refreshed (created ${result.created ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0})`,
      })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not seed forms',
      })
    },
  })

  const supportSnapshot = useQuery({
    queryKey: ['platform-support-snapshot', id],
    queryFn: () => api<SupportSnapshot>(`/api/platform/tenants/${id}/support-snapshot/`),
    enabled: supportOpened && Boolean(id),
  })

  if (isLoading || !data) {
    return <Text c="dimmed">Loading…</Text>
  }

  const opsRows = Array.isArray(recentOps.data)
    ? recentOps.data
    : recentOps.data?.results || []

  return (
    <Stack gap="lg">
      <Anchor component={Link} to="/" size="sm">
        ← All tenants
      </Anchor>

      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>{data.name}</Title>
          <Text c="dimmed" ff="monospace" size="sm">
            {data.slug}
          </Text>
        </Stack>
        <Badge
          color={data.status === 'active' ? 'forest' : 'red'}
          variant="light"
          size="lg"
          tt="capitalize"
        >
          {data.status}
        </Badge>
      </Group>

      <Group>
        <Button
          component="a"
          href={data.workspace_url}
          target="_blank"
          rel="noreferrer"
          variant="light"
        >
          Open workspace
        </Button>
        {data.status === 'active' ? (
          <Button color="red" variant="light" onClick={openSuspend}>
            Suspend
          </Button>
        ) : (
          <Button
            loading={patchTenant.isPending}
            onClick={() => patchTenant.mutate({ status: 'active' })}
          >
            Reactivate
          </Button>
        )}
        <Button
          variant="default"
          loading={seedForms.isPending}
          onClick={() => seedForms.mutate(false)}
        >
          Refresh starter forms
        </Button>
        <Button variant="subtle" onClick={openSupport}>
          Support snapshot
        </Button>
      </Group>

      <Paper p="md" withBorder radius="md">
        <form
          onSubmit={editForm.onSubmit((values) =>
            patchTenant.mutate({
              name: values.name,
              primary_contact_name: values.primary_contact_name,
              primary_contact_email: values.primary_contact_email,
              primary_contact_phone: values.primary_contact_phone,
              listings_enabled: values.listings_enabled,
            }),
          )}
        >
          <Stack gap="sm">
            <Title order={4}>Tenant details</Title>
            <TextInput label="Name" required {...editForm.getInputProps('name')} />
            <Group grow>
              <TextInput
                label="Primary contact name"
                {...editForm.getInputProps('primary_contact_name')}
              />
              <TextInput
                label="Primary contact email"
                type="email"
                {...editForm.getInputProps('primary_contact_email')}
              />
            </Group>
            <TextInput
              label="Primary contact phone"
              {...editForm.getInputProps('primary_contact_phone')}
            />
            <Switch
              label="Listings enabled"
              {...editForm.getInputProps('listings_enabled', { type: 'checkbox' })}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={patchTenant.isPending}>
                Save details
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Stack gap="xs">
        <Title order={4}>Members ({data.member_count})</Title>
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Email</DataTable.Th>
              <DataTable.Th>Role</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {data.members.map((m) => (
              <DataTable.Tr key={m.id}>
                <DataTable.Td className="sd-table-primary">{m.full_name}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">{m.email}</DataTable.Td>
                <DataTable.Td tt="capitalize">{m.role}</DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Pending invitations</Title>
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Email</DataTable.Th>
              <DataTable.Th>Role</DataTable.Th>
              <DataTable.Th>Expires</DataTable.Th>
              <DataTable.Th />
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {(invitations.data || []).length === 0 ? (
              <DataTable.Tr>
                <DataTable.Td colSpan={4}>
                  <Text c="dimmed" size="sm">
                    No pending invitations.
                  </Text>
                </DataTable.Td>
              </DataTable.Tr>
            ) : (
              (invitations.data || []).map((inv) => (
                <DataTable.Tr key={inv.id}>
                  <DataTable.Td>{inv.email}</DataTable.Td>
                  <DataTable.Td tt="capitalize">{inv.role}</DataTable.Td>
                  <DataTable.Td className="sd-table-muted">
                    {new Date(inv.expires_at).toLocaleString()}
                    {inv.is_expired ? ' (expired)' : ''}
                  </DataTable.Td>
                  <DataTable.Td>
                    <Group gap="xs" justify="flex-end">
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
                        color="red"
                        variant="subtle"
                        loading={revokeInvite.isPending}
                        onClick={() => void confirmRevokeInvite(inv.email, inv.id)}
                      >
                        Revoke
                      </Button>
                    </Group>
                  </DataTable.Td>
                </DataTable.Tr>
              ))
            )}
          </DataTable.Tbody>
        </DataTable>
      </Stack>

      <Stack gap="xs" maw={480}>
        <Title order={5}>Invite admin by email</Title>
        <Text size="sm" c="dimmed">
          Sends an <strong>admin</strong> role invitation (not owner).
        </Text>
        <Group>
          <TextInput
            placeholder="admin@partner.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            loading={inviteOwner.isPending}
            onClick={() => inviteOwner.mutate(inviteEmail.trim() || undefined)}
          >
            Send
          </Button>
        </Group>
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Recent ops</Title>
        <DataTable embedded>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>When</DataTable.Th>
              <DataTable.Th>Action</DataTable.Th>
              <DataTable.Th>Actor</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {opsRows.slice(0, 10).length === 0 ? (
              <DataTable.Tr>
                <DataTable.Td colSpan={3}>
                  <Text c="dimmed" size="sm">
                    No ops events yet.
                  </Text>
                </DataTable.Td>
              </DataTable.Tr>
            ) : (
              opsRows.slice(0, 10).map((ev) => (
                <DataTable.Tr key={ev.id}>
                  <DataTable.Td className="sd-table-muted">
                    {new Date(ev.created_at).toLocaleString()}
                  </DataTable.Td>
                  <DataTable.Td>
                    <Code>{ev.action}</Code>
                  </DataTable.Td>
                  <DataTable.Td>{ev.actor_email || '—'}</DataTable.Td>
                </DataTable.Tr>
              ))
            )}
          </DataTable.Tbody>
        </DataTable>
      </Stack>

      <Modal opened={suspendOpened} onClose={closeSuspend} title="Suspend workspace" centered>
        <Stack gap="md">
          <Text size="sm">
            Members will not be able to use this workspace until reactivated. Type the slug{' '}
            <Code>{data.slug}</Code> to confirm.
          </Text>
          <TextInput
            label="Confirm slug"
            value={suspendConfirm}
            onChange={(e) => setSuspendConfirm(e.currentTarget.value)}
            placeholder={data.slug}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSuspend}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={suspendConfirm.trim() !== data.slug}
              loading={patchTenant.isPending}
              onClick={() => patchTenant.mutate({ status: 'suspended' })}
            >
              Suspend
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={supportOpened} onClose={closeSupport} title="Support snapshot" size="lg">
        <Stack gap="md">
          {supportSnapshot.isLoading ? (
            <Text c="dimmed">Loading…</Text>
          ) : supportSnapshot.data ? (
            <>
              <Text size="sm">{supportSnapshot.data.note}</Text>
              <Text size="sm">
                Active members: <strong>{supportSnapshot.data.active_member_count}</strong>
                {' · '}
                Envelopes: <strong>{supportSnapshot.data.envelope_total}</strong>
              </Text>
              <Group gap="xs">
                {Object.entries(supportSnapshot.data.envelope_counts).map(([status, count]) => (
                  <Badge key={status} variant="light" tt="capitalize">
                    {status}: {count}
                  </Badge>
                ))}
              </Group>
              <Text size="sm">
                Login: <Code style={{ wordBreak: 'break-all' }}>{supportSnapshot.data.login_url}</Code>
              </Text>
              <Text size="sm" c="dimmed">
                Pending invites: {supportSnapshot.data.pending_invitations.length}
                {supportSnapshot.data.last_invitation
                  ? ` · Last invite: ${supportSnapshot.data.last_invitation.email}`
                  : ''}
              </Text>
              <Button
                component="a"
                href={supportSnapshot.data.workspace_url}
                target="_blank"
                rel="noreferrer"
              >
                Open workspace
              </Button>
            </>
          ) : (
            <Text c="red" size="sm">
              Could not load snapshot.
            </Text>
          )}
        </Stack>
      </Modal>
    </Stack>
  )
}
