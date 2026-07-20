import {
  Button,
  Checkbox,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '../../shared/api'

const PREFIX_OPTIONS = [
  'documents',
  'signed',
  'certificates',
  'signatures',
  'tenant_logos',
  'tenant_icons',
] as const

const DELETE_CONFIRM = 'DELETE ORPHANS'

type OrphanReport = {
  referenced: number
  on_disk: number
  orphan_count: number
  missing_count: number
  orphans: string[]
  missing: string[]
  prefixes: string[]
  dry_run: boolean
}

export function PlatformMediaPage() {
  const queryClient = useQueryClient()
  const [prefixes, setPrefixes] = useState<string[]>([])
  const [runKey, setRunKey] = useState(0)
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false)
  const [confirmText, setConfirmText] = useState('')

  const report = useQuery({
    queryKey: ['platform-media-orphans', runKey, prefixes],
    queryFn: () => {
      const params = new URLSearchParams()
      for (const p of prefixes) params.append('prefix', p)
      params.set('limit', '100')
      return api<OrphanReport>(`/api/platform/media/orphans/?${params.toString()}`)
    },
    enabled: runKey > 0,
  })

  const deleteOrphans = useMutation({
    mutationFn: () =>
      api<{ deleted: number; errors: string[]; orphan_count: number }>(
        '/api/platform/media/orphans/',
        {
          method: 'POST',
          json: {
            confirm: DELETE_CONFIRM,
            prefixes: prefixes.length ? prefixes : undefined,
          },
        },
      ),
    onSuccess: (result) => {
      closeDelete()
      setConfirmText('')
      queryClient.invalidateQueries({ queryKey: ['platform-ops-events'] })
      setRunKey((k) => k + 1)
      notifications.show({
        color: 'forest',
        message: `Deleted ${result.deleted} orphaned file(s)`,
      })
    },
    onError: (err) => {
      notifications.show({
        color: 'red',
        message: err instanceof ApiError ? err.message : 'Could not delete orphans',
      })
    },
  })

  return (
    <Stack gap="lg" maw={800}>
      <Stack gap={4}>
        <Title order={2}>Media orphans</Title>
        <Text c="dimmed" size="sm">
          Files on disk that no database FileField references. Run a report first; delete only after
          review.
        </Text>
      </Stack>

      <Paper p="md" withBorder radius="md">
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Scope (optional — leave empty for all upload trees)
          </Text>
          <Group gap="md">
            {PREFIX_OPTIONS.map((p) => (
              <Checkbox
                key={p}
                label={p}
                checked={prefixes.includes(p)}
                onChange={(e) => {
                  setPrefixes((prev) =>
                    e.currentTarget.checked ? [...prev, p] : prev.filter((x) => x !== p),
                  )
                }}
              />
            ))}
          </Group>
          <Group>
            <Button onClick={() => setRunKey((k) => k + 1)} loading={report.isFetching}>
              Run report
            </Button>
            <Button
              color="red"
              variant="light"
              disabled={!report.data || report.data.orphan_count === 0}
              onClick={openDelete}
            >
              Delete orphans…
            </Button>
          </Group>
        </Stack>
      </Paper>

      {report.data ? (
        <Paper p="md" withBorder radius="md">
          <Stack gap="sm">
            <Text size="sm">
              Referenced: <strong>{report.data.referenced}</strong>
              {' · '}
              On disk: <strong>{report.data.on_disk}</strong>
              {' · '}
              Orphans: <strong>{report.data.orphan_count}</strong>
              {' · '}
              Missing: <strong>{report.data.missing_count}</strong>
            </Text>
            <Text size="sm" c="dimmed">
              Prefixes: {report.data.prefixes.join(', ')}
            </Text>
            {report.data.orphans.length > 0 ? (
              <Stack gap={4} maw="100%" style={{ maxHeight: 280, overflow: 'auto' }}>
                {report.data.orphans.map((path) => (
                  <Code key={path} block>
                    {path}
                  </Code>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                No orphans in this scope.
              </Text>
            )}
          </Stack>
        </Paper>
      ) : runKey > 0 && report.isLoading ? (
        <Text c="dimmed">Scanning…</Text>
      ) : null}

      <Text size="sm" c="dimmed">
        Break-glass CLI: <Code>python manage.py audit_media_orphans</Code>
      </Text>

      <Modal opened={deleteOpened} onClose={closeDelete} title="Delete media orphans" centered>
        <Stack gap="md">
          <Text size="sm">
            Permanently deletes {report.data?.orphan_count ?? 0} orphaned file(s). Type{' '}
            <Code>{DELETE_CONFIRM}</Code> to confirm.
          </Text>
          <TextInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder={DELETE_CONFIRM}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={confirmText !== DELETE_CONFIRM}
              loading={deleteOrphans.isPending}
              onClick={() => deleteOrphans.mutate()}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
