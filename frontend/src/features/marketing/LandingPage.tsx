import { Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <Container size={900} py={100}>
      <Stack gap="lg" maw={640}>
        <Text
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.05,
          }}
        >
          SignDesk
        </Text>
        <Title order={2} style={{ fontWeight: 500, fontFamily: 'DM Sans, sans-serif' }}>
          Multi-tenant e-sign with a calm, professional workspace.
        </Title>
        <Text c="dimmed" size="lg">
          Create your company subdomain, manage contacts, send envelopes, and collect legally
          defensible signatures — all from one shared MySQL-backed platform.
        </Text>
        <Group>
          <Button component={Link} to="/signup" size="md">
            Start free workspace
          </Button>
          <Button component={Link} to="/login" variant="default" size="md">
            Log in
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
