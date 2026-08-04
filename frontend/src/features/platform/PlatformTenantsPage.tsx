import {
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ApiError, api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'

type PlatformTenantRow = {
  id: number
  name: string
  slug: string
  status: string
  created_at: string
  member_count: number
  subscription_status?: string
  trial_ends_at?: string | null
}

type ProvisionResult = {
  tenant: PlatformTenantRow & { workspace_url?: string; login_url?: string }
  invitation_id: number | null
  invite_url: string | null
  workspace_url: string
  login_url: string
  owner_email: string | null
  invite_role: string
}

type StatusFilter = '' | 'active' | 'suspended'

export function PlatformTenantsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 300)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [opened, { open, close }] = useDisclosure(false)
  const [handoff, setHandoff] = useState<ProvisionResult | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['platform-tenants', debouncedSearch, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim())
      if (statusFilter) params.set('status', statusFilter)
      const qs = params.toString()
      return api<PlatformTenantRow[] | { results: PlatformTenantRow[] }>(
        `/api/platform/tenants/${qs ? `?${qs}` : ''}`,
      )
    },
  })

  const provisionForm = useForm({
    initialValues: {
      name: '',
      slug: '',
      owner_email: '',
      owner_first_name: '',
      owner_last_name: '',
      owner_password: '',
    },
  })

  const provision = useMutation({
    mutationFn: (values: typeof provisionForm.values) =>
      api<ProvisionResult>('/api/platform/tenants/', {
        method: 'POST',
        json: {
          name: values.name,
          slug: values.slug,
          owner_email: values.owner_email,
          owner_first_name: values.owner_first_name,
          owner_last_name: values.owner_last_name,
          owner_password: values.owner_password || undefined,
        },
      }),
    onSuccess: (result) => {
      provisionForm.reset()
      close()
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
      setHandoff(result)
      notifications.show({ color: 'forest', message: 'Workspace provisioned' })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not provision workspace',
      })
    },
  })

  const rows = Array.isArray(data) ? data : data?.results || []

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>Tenants</Title>
          <Text c="dimmed" size="sm">
            Provision partner workspaces and manage status.
          </Text>
        </Stack>
        <Button onClick={open}>Provision workspace</Button>
      </Group>

      <Group gap="sm" align="flex-end">
        <TextInput
          placeholder="Search by name or slug"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={{ base: '100%', sm: 320 }}
        />
        <Group gap={6}>
          {(
            [
              ['', 'All'],
              ['active', 'Active'],
              ['suspended', 'Suspended'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={label}
              size="xs"
              variant={statusFilter === value ? 'filled' : 'light'}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </Button>
          ))}
        </Group>
      </Group>

      <DataTable embedded>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Name</DataTable.Th>
            <DataTable.Th>Slug</DataTable.Th>
            <DataTable.Th>Status</DataTable.Th>
            <DataTable.Th>Subscription</DataTable.Th>
            <DataTable.Th>Members</DataTable.Th>
            <DataTable.Th>Created</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {isLoading ? (
            <DataTable.Tr>
              <DataTable.Td colSpan={6}>
                <Text c="dimmed">Loading…</Text>
              </DataTable.Td>
            </DataTable.Tr>
          ) : rows.length === 0 ? (
            <DataTable.Tr>
              <DataTable.Td colSpan={6}>
                <Text c="dimmed">No tenants yet.</Text>
              </DataTable.Td>
            </DataTable.Tr>
          ) : (
            rows.map((row) => (
              <DataTable.Tr key={row.id}>
                <DataTable.Td>
                  <Text
                    component={Link}
                    to={`/tenants/${row.id}`}
                    className="sd-table-primary"
                  >
                    {row.name}
                  </Text>
                </DataTable.Td>
                <DataTable.Td className="sd-table-muted">{row.slug}</DataTable.Td>
                <DataTable.Td>
                  <Badge
                    color={row.status === 'active' ? 'forest' : 'red'}
                    variant="light"
                    tt="capitalize"
                  >
                    {row.status}
                  </Badge>
                </DataTable.Td>
                <DataTable.Td>
                  <Badge
                    color={
                      row.subscription_status === 'active'
                        ? 'forest'
                        : row.subscription_status === 'expired'
                          ? 'orange'
                          : 'blue'
                    }
                    variant="light"
                    tt="capitalize"
                  >
                    {row.subscription_status || '—'}
                  </Badge>
                </DataTable.Td>
                <DataTable.Td>{row.member_count}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">
                  {new Date(row.created_at).toLocaleDateString()}
                </DataTable.Td>
              </DataTable.Tr>
            ))
          )}
        </DataTable.Tbody>
      </DataTable>

      <Modal opened={opened} onClose={close} title="Provision workspace" size="lg">
        <form onSubmit={provisionForm.onSubmit((v) => provision.mutate(v))}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Creates the tenant and seeds email templates. Leave password
              blank to email an <strong>admin</strong> invite (not owner) so they set their own
              password.
            </Text>
            <Group grow>
              <TextInput label="Company name" required {...provisionForm.getInputProps('name')} />
              <TextInput label="Slug" required {...provisionForm.getInputProps('slug')} />
            </Group>
            <TextInput
              label="Owner email"
              type="email"
              required
              {...provisionForm.getInputProps('owner_email')}
            />
            <Group grow>
              <TextInput
                label="Owner first name"
                {...provisionForm.getInputProps('owner_first_name')}
              />
              <TextInput
                label="Owner last name"
                {...provisionForm.getInputProps('owner_last_name')}
              />
            </Group>
            <TextInput
              label="Owner password (optional)"
              type="password"
              description="If set, creates an OWNER who can log in immediately"
              {...provisionForm.getInputProps('owner_password')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={provision.isPending}>
                Provision
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(handoff)}
        onClose={() => setHandoff(null)}
        title="Workspace ready"
        size="lg"
      >
        {handoff ? (
          <Stack gap="md">
            <Text size="sm">
              <strong>{handoff.tenant.name}</strong> ({handoff.tenant.slug}) is ready.
            </Text>
            <Text size="sm">
              Contact: <Code>{handoff.owner_email}</Code>
              {handoff.invitation_id ? (
                <>
                  {' '}
                  — <strong>admin</strong> invite queued
                </>
              ) : (
                ' — owner membership created'
              )}
            </Text>
            {handoff.invite_url ? (
              <Text size="sm">
                Invite link: <Code style={{ wordBreak: 'break-all' }}>{handoff.invite_url}</Code>
              </Text>
            ) : null}
            <Text size="sm">
              Workspace: <Code style={{ wordBreak: 'break-all' }}>{handoff.workspace_url}</Code>
            </Text>
            <Group justify="flex-end">
              <Button
                variant="default"
                component="a"
                href={handoff.workspace_url}
                target="_blank"
                rel="noreferrer"
              >
                Open workspace
              </Button>
              <Button
                onClick={() => {
                  const id = handoff.tenant.id
                  setHandoff(null)
                  navigate(`/tenants/${id}`)
                }}
              >
                Open tenant detail
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  )
}
