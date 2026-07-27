import { Anchor, Code, Table, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

function rewriteHelpHref(href: string | undefined): string | undefined {
  if (!href) return href
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
    return href
  }
  if (href.startsWith('/app/')) return href

  const match = href.match(/^([^/#]+)\.md(#.*)?$/)
  if (match) {
    const slug = match[1] === 'README' || match[1] === 'index' ? '' : match[1]
    return `/app/help${slug ? `/${slug}` : ''}${match[2] || ''}`
  }
  if (href.startsWith('#')) return href
  return href
}

function childrenToText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childrenToText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    const el = children as { props?: { children?: ReactNode } }
    return childrenToText(el.props?.children)
  }
  return ''
}

const components: Components = {
  h1: ({ children }) => (
    <Title order={2} mb="md" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
      {children}
    </Title>
  ),
  h2: ({ children }) => {
    const id = slugify(childrenToText(children))
    return (
      <Title order={3} id={id} mt="xl" mb="sm">
        {children}
      </Title>
    )
  },
  h3: ({ children }) => {
    const id = slugify(childrenToText(children))
    return (
      <Title order={4} id={id} mt="lg" mb="xs">
        {children}
      </Title>
    )
  },
  p: ({ children }) => (
    <Text component="p" mb="sm" style={{ lineHeight: 1.65 }}>
      {children}
    </Text>
  ),
  a: ({ href, children }) => {
    const to = rewriteHelpHref(href)
    if (!to) return <span>{children}</span>
    if (to.startsWith('http://') || to.startsWith('https://') || to.startsWith('mailto:')) {
      return (
        <Anchor href={to} target="_blank" rel="noreferrer">
          {children}
        </Anchor>
      )
    }
    if (to.startsWith('#')) {
      return <Anchor href={to}>{children}</Anchor>
    }
    return (
      <Anchor component={Link} to={to}>
        {children}
      </Anchor>
    )
  },
  ul: ({ children }) => (
    <ul className="sd-help-list" style={{ marginBottom: '0.75rem', paddingLeft: '1.25rem' }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="sd-help-list" style={{ marginBottom: '0.75rem', paddingLeft: '1.25rem' }}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: '0.35rem', lineHeight: 1.55 }}>{children}</li>,
  strong: ({ children }) => (
    <Text span fw={600}>
      {children}
    </Text>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className)
    if (isBlock) {
      return (
        <Code block mb="md" style={{ whiteSpace: 'pre-wrap' }}>
          {children}
        </Code>
      )
    }
    return <Code>{children}</Code>
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <Text
      component="blockquote"
      mb="md"
      pl="md"
      style={{
        borderLeft: '3px solid var(--sd-forest)',
        color: 'var(--mantine-color-dimmed)',
      }}
    >
      {children}
    </Text>
  ),
  hr: () => (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid rgba(16,42,35,0.1)',
        margin: '1.5rem 0',
      }}
    />
  ),
  table: ({ children }) => (
    <Table.ScrollContainer minWidth={480} mb="md">
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        {children}
      </Table>
    </Table.ScrollContainer>
  ),
  thead: ({ children }) => <Table.Thead>{children}</Table.Thead>,
  tbody: ({ children }) => <Table.Tbody>{children}</Table.Tbody>,
  tr: ({ children }) => <Table.Tr>{children}</Table.Tr>,
  th: ({ children }) => <Table.Th>{children}</Table.Th>,
  td: ({ children }) => <Table.Td>{children}</Table.Td>,
}

type HelpMarkdownProps = {
  content: string
}

export function HelpMarkdown({ content }: HelpMarkdownProps) {
  return (
    <div className="sd-help-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
