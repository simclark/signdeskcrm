import { Card, Grid, Group, Stack, Text, Title, Badge, Skeleton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'

type Dashboard = {
  awaiting_others: number
  completed: number
  drafts: number
  expiring_soon: number
  recent: Array<{
    id: number
    title: string
    status: string
    created_at: string
  }>
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/api/dashboard/'),
  })

  if (isLoading || !data) {
    return <Skeleton height={240} />
  }

  const tiles = [
    { label: 'Awaiting others', value: data.awaiting_others },
    { label: 'Completed', value: data.completed },
    { label: 'Drafts', value: data.drafts },
    { label: 'Expiring soon', value: data.expiring_soon },
  ]

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed">Track envelopes and keep deals moving.</Text>
      </div>
      <Grid>
        {tiles.map((tile) => (
          <Grid.Col key={tile.label} span={{ base: 12, sm: 6, md: 3 }}>
            <Card padding="lg" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.75)' }}>
              <Text size="sm" c="dimmed">
                {tile.label}
              </Text>
              <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 36 }} fw={700}>
                {tile.value}
              </Text>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
      <Card padding="lg" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.75)' }}>
        <Title order={4} mb="md">
          Recent envelopes
        </Title>
        <Stack gap="sm">
          {data.recent.length === 0 && <Text c="dimmed">No envelopes yet.</Text>}
          {data.recent.map((item) => (
            <Group key={item.id} justify="space-between">
              <Text component={Link} to={`/app/envelopes/${item.id}`} fw={500}>
                {item.title}
              </Text>
              <Badge variant="light">{item.status}</Badge>
            </Group>
          ))}
        </Stack>
      </Card>
    </Stack>
  )
}
