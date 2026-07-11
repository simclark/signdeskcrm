import { Badge, Button, Card, Group, Stack, Text, Title, Timeline } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../shared/api'

export function ContactDetailPage() {
  const { id } = useParams()
  const { data: contact } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => api<any>(`/api/contacts/${id}/`),
  })
  const { data: activities } = useQuery({
    queryKey: ['contact-activities', id],
    queryFn: () => api<any[]>(`/api/contacts/${id}/activities/`),
    enabled: !!id,
  })

  if (!contact) return null

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>{contact.full_name}</Title>
          <Text c="dimmed">{contact.email}</Text>
        </div>
        <Button
          component={Link}
          to={`/app/envelopes/new?contact=${contact.id}&email=${encodeURIComponent(contact.email)}&name=${encodeURIComponent(contact.full_name)}`}
        >
          Send for signature
        </Button>
      </Group>
      <Card withBorder radius="lg" p="lg">
        <Group>
          <Badge>{contact.title || 'Contact'}</Badge>
          <Text>{contact.phone || 'No phone'}</Text>
          <Text>{contact.company_name || 'No company'}</Text>
        </Group>
        <Text mt="md">{contact.notes || 'No notes yet.'}</Text>
      </Card>
      <Card withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Activity
        </Title>
        <Timeline active={activities?.length || 0}>
          {(activities || []).map((a) => (
            <Timeline.Item key={a.id} title={a.kind}>
              <Text size="sm">{a.message}</Text>
              <Text size="xs" c="dimmed">
                {new Date(a.created_at).toLocaleString()}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      </Card>
    </Stack>
  )
}
