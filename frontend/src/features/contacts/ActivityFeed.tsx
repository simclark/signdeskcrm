import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link } from 'react-router-dom'

export type Activity = {
  id: number
  kind: string
  message: string
  created_at: string
  metadata?: {
    envelope_id?: number
  }
}

const PREVIEW_COUNT = 5

const KIND_BADGE_COLOR: Record<string, string> = {
  envelope_signed: 'forest',
  envelope_completed: 'forest',
  envelope_sent: 'blue',
  created: 'gray',
  updated: 'gray',
  note: 'teal',
}

function formatKindLabel(kind: string) {
  return kind
    .split('_')
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(' ')
}

function formatActivityTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ActivityRow({ activity }: { activity: Activity }) {
  const envelopeId = activity.metadata?.envelope_id

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Badge color={KIND_BADGE_COLOR[activity.kind] || 'gray'} variant="light" tt="none">
          {formatKindLabel(activity.kind)}
        </Badge>
      </Group>
      <Text size="sm">{activity.message}</Text>
      <Group gap="md">
        <Text size="xs" c="dimmed">
          {formatActivityTime(activity.created_at)}
        </Text>
        {envelopeId != null ? (
          <Text
            component={Link}
            to={`/app/envelopes/${envelopeId}`}
            size="xs"
            className="sd-table-primary"
          >
            View envelope
          </Text>
        ) : null}
      </Group>
    </Stack>
  )
}

function ActivityList({ activities }: { activities: Activity[] }) {
  return (
    <Stack gap="lg">
      {activities.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} />
      ))}
    </Stack>
  )
}

type ActivityFeedProps = {
  activities: Activity[] | undefined
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const [opened, { open, close }] = useDisclosure(false)
  const items = activities || []
  const preview = items.slice(0, PREVIEW_COUNT)
  const hasMore = items.length > PREVIEW_COUNT

  return (
    <>
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" align="center" mb="md">
          <Title order={4}>Activity</Title>
          {items.length > 0 ? (
            <Button variant="subtle" size="compact-sm" onClick={open}>
              View all activity
            </Button>
          ) : null}
        </Group>
        {items.length === 0 ? (
          <Text c="dimmed" size="sm">
            No activity yet.
          </Text>
        ) : (
          <Stack gap="lg">
            <ActivityList activities={preview} />
            {hasMore ? (
              <Text size="xs" c="dimmed">
                Showing {PREVIEW_COUNT} of {items.length}. View all for the full history.
              </Text>
            ) : null}
          </Stack>
        )}
      </Card>

      <Modal opened={opened} onClose={close} title="All activity" size="lg">
        <ScrollArea.Autosize mah="70vh">
          <ActivityList activities={items} />
        </ScrollArea.Autosize>
      </Modal>
    </>
  )
}
