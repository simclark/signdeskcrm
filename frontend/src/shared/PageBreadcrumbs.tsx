import { Anchor, Breadcrumbs, Text } from '@mantine/core'
import { Link } from 'react-router-dom'

export type PageBreadcrumbItem = {
  label: string
  to?: string
}

export function PageBreadcrumbs({ items }: { items: PageBreadcrumbItem[] }) {
  return (
    <Breadcrumbs separator="›" mb="xs">
      {items.map((item) =>
        item.to ? (
          <Anchor
            key={`${item.label}-${item.to}`}
            component={Link}
            to={item.to}
            size="sm"
            c="dimmed"
          >
            {item.label}
          </Anchor>
        ) : (
          <Text key={item.label} size="sm" c="dimmed" lineClamp={1}>
            {item.label}
          </Text>
        ),
      )}
    </Breadcrumbs>
  )
}
