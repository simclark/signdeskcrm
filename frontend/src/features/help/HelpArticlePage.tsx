import { Anchor, Card, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  articleBodyWithoutTitle,
  getHelpArticle,
  HELP_ARTICLES,
  HELP_CATEGORIES,
} from './articles/catalog'
import { HelpMarkdown } from './HelpMarkdown'

export function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = slug ? getHelpArticle(slug) : undefined

  if (!article) {
    return <Navigate to="/app/help" replace />
  }

  const related = HELP_ARTICLES.filter(
    (item) => item.category === article.category && item.slug !== article.slug,
  ).slice(0, 4)

  return (
    <Stack gap="lg">
      <div>
        <Anchor component={Link} to="/app/help" size="sm" mb="xs" display="inline-flex">
          <Group gap={6}>
            <IconArrowLeft size={14} stroke={1.5} />
            All help
          </Group>
        </Anchor>
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4} style={{ letterSpacing: '0.04em' }}>
          {HELP_CATEGORIES[article.category]}
        </Text>
        <Title order={2}>{article.title}</Title>
        <Text c="dimmed" mt={4}>
          {article.description}
        </Text>
      </div>

      <Card
        padding="xl"
        radius="lg"
        withBorder
        style={{ background: 'rgba(255,255,255,0.82)', maxWidth: 820 }}
      >
        <HelpMarkdown content={articleBodyWithoutTitle(article.body)} />
      </Card>

      {related.length > 0 ? (
        <Stack gap="xs" maw={820}>
          <Text size="sm" fw={600}>
            Related
          </Text>
          {related.map((item) => (
            <UnstyledButton
              key={item.slug}
              component={Link}
              to={`/app/help/${item.slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(16,42,35,0.08)',
                background: 'rgba(255,255,255,0.65)',
              }}
            >
              <div>
                <Text size="sm" fw={600}>
                  {item.title}
                </Text>
                <Text size="xs" c="dimmed">
                  {item.description}
                </Text>
              </div>
              <IconChevronRight size={16} stroke={1.5} />
            </UnstyledButton>
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}
