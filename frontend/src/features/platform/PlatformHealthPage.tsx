import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconCheck,
  IconDatabase,
  IconExternalLink,
  IconRefresh,
  IconServer,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../shared/api'

type HealthPayload = {
  status: string
  service: string
  checks: Record<string, string>
  config: {
    base_domain: string
    frontend_protocol: string
    api_protocol: string
    frontend_port: string
    debug: boolean
    celery_task_always_eager: boolean
  }
  warnings: string[]
  demo_tenant: {
    exists: boolean
    status: string | null
    login_url: string | null
  }
  example_signing_host: string
}

const CHECK_META: Record<string, { label: string; icon: typeof IconDatabase }> = {
  database: { label: 'Database', icon: IconDatabase },
  redis: { label: 'Redis', icon: IconServer },
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <Group
      justify="space-between"
      align="flex-start"
      gap="md"
      wrap="nowrap"
      py={10}
      style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
    >
      <Text size="sm" c="dimmed" style={{ minWidth: 160, flexShrink: 0 }}>
        {label}
      </Text>
      <Group gap={6} justify="flex-end" style={{ flex: 1, minWidth: 0 }}>
        <Code
          style={{
            wordBreak: 'break-all',
            textAlign: 'right',
            maxWidth: '100%',
          }}
        >
          {value}
        </Code>
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Button size="compact-xs" variant="subtle" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Group>
  )
}

export function PlatformHealthPage() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['platform-health'],
    queryFn: () => api<HealthPayload>('/api/platform/health/'),
    refetchInterval: 30_000,
  })

  if (isLoading) return <Text c="dimmed">Loading health…</Text>
  if (error || !data) {
    return (
      <Text c="red">
        {error instanceof ApiError ? error.message : 'Could not load health'}
      </Text>
    )
  }

  const healthy = data.status === 'ok'
  const checkedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null

  return (
    <Stack gap="xl" maw={860}>
      <Group justify="space-between" align="flex-start">
        <Stack gap={6}>
          <Group gap="sm" align="center">
            <Title order={2}>Health</Title>
            <Badge
              size="lg"
              color={healthy ? 'forest' : 'red'}
              variant="light"
              leftSection={
                healthy ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />
              }
              tt="uppercase"
            >
              {data.status}
            </Badge>
          </Group>
          <Text c="dimmed" size="sm">
            Read-only system status before pitches and partner onboardings.
            {checkedAt ? ` · Updated ${checkedAt}` : ''}
          </Text>
        </Stack>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          loading={isFetching}
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </Group>

      {data.warnings.length > 0 ? (
        <Alert
          color="yellow"
          icon={<IconAlertTriangle size={18} />}
          title="Configuration warnings"
        >
          <Stack gap={6}>
            {data.warnings.map((w) => (
              <Text key={w} size="sm">
                {w}
              </Text>
            ))}
          </Stack>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {Object.entries(data.checks).map(([key, value]) => {
          const meta = CHECK_META[key] || {
            label: key,
            icon: IconServer,
          }
          const Icon = meta.icon
          const ok = value === 'ok'
          return (
            <Paper key={key} p="lg" withBorder radius="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="md" wrap="nowrap">
                  <ThemeIcon
                    size={42}
                    radius="md"
                    variant="light"
                    color={ok ? 'forest' : 'red'}
                  >
                    <Icon size={22} />
                  </ThemeIcon>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
                      Check
                    </Text>
                    <Text fw={600}>{meta.label}</Text>
                  </Stack>
                </Group>
                <Badge color={ok ? 'forest' : 'red'} variant="light" tt="uppercase">
                  {value}
                </Badge>
              </Group>
            </Paper>
          )
        })}
      </SimpleGrid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="lg" withBorder radius="md" h="100%">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
                Runtime config
              </Text>
              <Title order={4} mb="xs">
                Environment
              </Title>
              <Stack gap={0}>
                <ConfigRow label="BASE_DOMAIN" value={data.config.base_domain} />
                <ConfigRow label="FRONTEND_PROTOCOL" value={data.config.frontend_protocol} />
                <ConfigRow label="API_PROTOCOL" value={data.config.api_protocol} />
                <ConfigRow
                  label="FRONTEND_PORT"
                  value={data.config.frontend_port || '(none)'}
                />
                <ConfigRow label="DEBUG" value={String(data.config.debug)} />
                <ConfigRow
                  label="CELERY_TASK_ALWAYS_EAGER"
                  value={String(data.config.celery_task_always_eager)}
                />
                <ConfigRow label="Signing host example" value={data.example_signing_host} />
              </Stack>
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="lg" withBorder radius="md" h="100%">
            <Stack gap="md" h="100%">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
                  Pitch readiness
                </Text>
                <Title order={4}>Demo tenant</Title>
              </Stack>

              {data.demo_tenant.exists ? (
                <Stack gap="sm" style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Badge color="forest" variant="light" tt="capitalize">
                      {data.demo_tenant.status || 'active'}
                    </Badge>
                    <Text size="sm" c="dimmed">
                      Reserved slug <Code>demo</Code>
                    </Text>
                  </Group>
                  {data.demo_tenant.login_url ? (
                    <Stack gap={4}>
                      <Text size="xs" c="dimmed" fw={600}>
                        Login URL
                      </Text>
                      <Code style={{ wordBreak: 'break-all' }}>{data.demo_tenant.login_url}</Code>
                    </Stack>
                  ) : null}
                  <Group mt="auto" gap="xs">
                    {data.demo_tenant.login_url ? (
                      <Button
                        component="a"
                        href={data.demo_tenant.login_url}
                        target="_blank"
                        rel="noreferrer"
                        variant="light"
                        rightSection={<IconExternalLink size={14} />}
                        size="sm"
                      >
                        Open login
                      </Button>
                    ) : null}
                    <Button component={Link} to="/demo" variant="default" size="sm">
                      Reset demo
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Stack gap="md" style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed">
                    Not created yet. Reset from Demo workspace to provision the reserved{' '}
                    <Code>demo</Code> tenant before a pitch.
                  </Text>
                  <Button component={Link} to="/demo" mt="auto" size="sm">
                    Go to Demo workspace
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      {data.warnings.length === 0 ? (
        <Text size="sm" c="dimmed">
          No configuration warnings.
        </Text>
      ) : null}
    </Stack>
  )
}
