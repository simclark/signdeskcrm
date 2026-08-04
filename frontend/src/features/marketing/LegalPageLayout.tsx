import { Anchor, Container, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export function LegalPageLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Container size={720} py={60}>
      <Stack gap="lg">
        <Group justify="space-between" align="baseline" wrap="wrap">
          <Text
            component={Link}
            to="/"
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 28,
              fontWeight: 700,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            SignDesk
          </Text>
          <Group gap="md">
            <Anchor component={Link} to="/privacy" size="sm" c="dimmed">
              Privacy
            </Anchor>
            <Anchor component={Link} to="/terms" size="sm" c="dimmed">
              Terms
            </Anchor>
            <Anchor component={Link} to="/signup" size="sm">
              Sign up
            </Anchor>
          </Group>
        </Group>
        <Text
          component="h1"
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 36,
            fontWeight: 650,
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {title}
        </Text>
        <Text size="sm" c="dimmed">
          Last updated: August 4, 2026
        </Text>
        <Stack gap="md" style={{ lineHeight: 1.65 }}>
          {children}
        </Stack>
      </Stack>
    </Container>
  )
}
