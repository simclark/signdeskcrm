import { Card, Grid, Group, Stack, Text, Title, TextInput, ThemeIcon } from '@mantine/core'
import {
  IconBook,
  IconBuilding,
  IconFileText,
  IconHelp,
  IconMailForward,
  IconSearch,
  IconSend,
  IconSettings,
  IconTemplate,
  IconUsers,
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpCategory,
} from './articles/catalog'

const CATEGORY_ORDER: HelpCategory[] = ['start', 'esign', 'crm', 'admin', 'reference']

const ARTICLE_ICONS: Record<string, typeof IconHelp> = {
  'getting-started': IconBook,
  'roles-and-permissions': IconUsers,
  dashboard: IconHelp,
  envelopes: IconSend,
  documents: IconFileText,
  'templates-and-form-library': IconTemplate,
  signing: IconFileText,
  contacts: IconUsers,
  companies: IconBuilding,
  listings: IconBuilding,
  'follow-ups': IconMailForward,
  'follow-up-plans': IconMailForward,
  settings: IconSettings,
  glossary: IconBook,
}

function ArticleCard({ article }: { article: HelpArticle }) {
  const Icon = ARTICLE_ICONS[article.slug] || IconHelp
  return (
    <Card
      component={Link}
      to={`/app/help/${article.slug}`}
      padding="lg"
      radius="lg"
      withBorder
      style={{
        background: 'rgba(255,255,255,0.75)',
        textDecoration: 'none',
        color: 'inherit',
        height: '100%',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      }}
      className="sd-help-card"
    >
      <Group align="flex-start" gap="md" wrap="nowrap">
        <ThemeIcon variant="light" color="forest" size={40} radius="md">
          <Icon size={20} stroke={1.5} />
        </ThemeIcon>
        <div>
          <Text fw={600} mb={4}>
            {article.title}
          </Text>
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
            {article.description}
          </Text>
        </div>
      </Group>
    </Card>
  )
}

export function HelpPage() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return HELP_ARTICLES
    return HELP_ARTICLES.filter(
      (article) =>
        article.title.toLowerCase().includes(q) ||
        article.description.toLowerCase().includes(q) ||
        article.body.toLowerCase().includes(q),
    )
  }, [query])

  const byCategory = useMemo(() => {
    const map = new Map<HelpCategory, HelpArticle[]>()
    for (const category of CATEGORY_ORDER) map.set(category, [])
    for (const article of filtered) {
      map.get(article.category)?.push(article)
    }
    return map
  }, [filtered])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={2}>Help</Title>
          <Text c="dimmed">Guides for using this workspace — available to everyone on your team.</Text>
        </div>
        <TextInput
          placeholder="Search help…"
          leftSection={<IconSearch size={16} stroke={1.5} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
          aria-label="Search help"
        />
      </Group>

      {filtered.length === 0 ? (
        <Card padding="lg" radius="lg" withBorder style={{ background: 'rgba(255,255,255,0.75)' }}>
          <Text c="dimmed">No articles match “{query}”.</Text>
        </Card>
      ) : (
        CATEGORY_ORDER.map((category) => {
          const articles = byCategory.get(category) || []
          if (articles.length === 0) return null
          return (
            <Stack key={category} gap="sm">
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                {HELP_CATEGORIES[category]}
              </Text>
              <Grid>
                {articles.map((article) => (
                  <Grid.Col key={article.slug} span={{ base: 12, sm: 6, md: 4 }}>
                    <ArticleCard article={article} />
                  </Grid.Col>
                ))}
              </Grid>
            </Stack>
          )
        })
      )}
    </Stack>
  )
}
