import { Card, Container, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { SigningUnavailableContent } from './signingErrors'

type Props = {
  content: SigningUnavailableContent
}

export function SigningUnavailable({ content }: Props) {
  const { title, message, hint, Icon } = content

  return (
    <div className="signer-shell">
      <Container size={640} py={80}>
        <Card withBorder radius="lg" p="xl">
          <Stack gap="sm">
            <ThemeIcon size={48} radius="xl" variant="light" color="gray">
              <Icon size={26} stroke={1.5} />
            </ThemeIcon>
            <Title order={2}>{title}</Title>
            <Text>{message}</Text>
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
          </Stack>
        </Card>
      </Container>
    </div>
  )
}
