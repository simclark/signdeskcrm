export type SignField = {
  id: number
  field_type: string
  page: number
  x: number
  y: number
  w: number
  h: number
  required?: boolean
  label?: string | null
  value?: string
  completed_at?: string | null
}

export function fieldToOverlayStyle(field: Pick<SignField, 'x' | 'y' | 'w' | 'h'>) {
  return {
    left: `${field.x * 100}%`,
    bottom: `${field.y * 100}%`,
    width: `${field.w * 100}%`,
    height: `${field.h * 100}%`,
  }
}

export function fieldTopEdge(field: Pick<SignField, 'y' | 'h'>): number {
  return 1 - field.y - field.h
}

/**
 * Signing walkthrough order per page: top date → other fields top-to-bottom → bottom date(s).
 */
export function sortFieldsForSigning(fields: SignField[]): SignField[] {
  const pages = [...new Set(fields.map((f) => f.page))].sort((a, b) => a - b)
  const result: SignField[] = []

  for (const page of pages) {
    const pageFields = fields.filter((f) => f.page === page)
    const dates = pageFields.filter((f) => f.field_type === 'date')
    const others = pageFields.filter((f) => f.field_type !== 'date')

    const sortedDates = [...dates].sort((a, b) => fieldTopEdge(b) - fieldTopEdge(a))
    const topDate = sortedDates[0]
    const bottomDates = sortedDates.slice(1)

    const sortedOthers = [...others].sort((a, b) => fieldTopEdge(a) - fieldTopEdge(b))

    if (topDate) result.push(topDate)
    result.push(...sortedOthers)
    result.push(...bottomDates.sort((a, b) => fieldTopEdge(a) - fieldTopEdge(b)))
  }

  return result
}

export function fieldTypeLabel(field: SignField): string {
  if (field.label) return field.label
  switch (field.field_type) {
    case 'signature':
      return 'Sign'
    case 'initials':
      return 'Initial'
    case 'date':
      return 'Date'
    case 'text':
      return 'Text'
    case 'checkbox':
      return 'Check'
    default:
      return field.field_type
  }
}
