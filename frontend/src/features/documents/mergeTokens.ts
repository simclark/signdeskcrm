import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import type { RoleDraft } from './pdfFieldMapperUtils'

/** Human-readable hints shown next to known merge tokens. */
export const MERGE_TOKEN_HINTS: Record<string, string> = {
  'contact.first_name': 'Contact first name',
  'contact.last_name': 'Contact last name',
  'contact.full_name': 'Contact full name',
  'contact.email': 'Contact email',
  'contact.phone': 'Contact phone',
  'contact.title': 'Contact job title',
  'company.name': 'Company name',
  'company.website': 'Company website',
  'listing.address': 'Listing street address',
  'listing.city': 'Listing city',
  'listing.state': 'Listing state',
  'listing.postal_code': 'Listing postal code',
  'listing.full_address': 'Full listing address',
  'listing.mls_number': 'MLS / listing number',
  'listing.price': 'List price',
  'listing.beds': 'Bedrooms',
  'listing.baths': 'Bathrooms',
  'listing.sqft': 'Square footage',
  'listing.year_built': 'Year built',
  'listing.description': 'Listing description',
  'deal.price': 'Deal / offer price',
  'deal.closing_date': 'Closing date',
  'role.buyer.name': 'Buyer recipient name',
  'role.buyer.email': 'Buyer recipient email',
  'role.seller.name': 'Seller recipient name',
  'role.seller.email': 'Seller recipient email',
  'role.agent.name': 'Agent recipient name',
  'role.agent.email': 'Agent recipient email',
}

const GROUP_ORDER = ['contact', 'company', 'listing', 'deal', 'custom', 'role'] as const

const DEFAULT_GROUP_LABELS: Record<string, string> = {
  contact: 'Contact',
  company: 'Company',
  listing: 'Listing',
  deal: 'Deal terms',
  custom: 'Custom',
  role: 'Recipient role',
}

export type MergeTokenOption = {
  value: string
  label: string
}

export type MergeTokenGroup = {
  group: string
  items: MergeTokenOption[]
}

function tokenLabel(token: string): string {
  const hint = humanizeTokenLabel(token)
  return hint !== token ? `${token} — ${hint}` : token
}

function groupKey(token: string): string {
  const parts = token.split('.')
  return parts[0] || 'other'
}

/** Human label from token hint or leaf key (e.g. deal.lender_name → Lender Name). */
export function humanizeTokenLabel(token: string): string {
  const key = (token || '').trim()
  if (!key) return ''
  if (MERGE_TOKEN_HINTS[key]) return MERGE_TOKEN_HINTS[key]
  const leaf = key.split('.').pop() || key
  return leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Auto-label when picking a merge token. Returns a new label when the current
 * label is empty or still matches the previous auto-label; otherwise null.
 */
export function autoLabelForToken(
  token: string,
  previousToken: string | undefined,
  currentLabel: string | undefined,
): string | null {
  const next = humanizeTokenLabel(token)
  if (!next) return null
  const current = (currentLabel || '').trim()
  if (!current) return next
  if (previousToken) {
    const prevAuto = humanizeTokenLabel(previousToken)
    if (current === prevAuto || current === MERGE_TOKEN_HINTS[previousToken]) {
      return next
    }
  }
  return null
}

/** Normalize free-typed tokens into deal.* / custom.* when missing a namespace. */
export function normalizeMergeTokenInput(raw: string): string {
  let key = (raw || '').trim().replace(/^\{\{|\}\}$/g, '').trim()
  if (!key) return ''
  key = key.replace(/\s+/g, '_').toLowerCase()
  if (key.includes('.')) return key
  return `custom.${key}`
}

/** Role tokens for the current signer roles (covers custom role keys). */
export function roleMergeTokens(roles: RoleDraft[]): string[] {
  const keys = new Set<string>()
  for (const role of roles) {
    const key = (role.role_key || '').trim()
    if (!key || role.role === 'cc') continue
    keys.add(key)
  }
  const tokens: string[] = []
  for (const key of [...keys].sort()) {
    tokens.push(`role.${key}.name`, `role.${key}.email`)
  }
  return tokens
}

export function buildMergeTokenSelectData(
  catalogTokens: string[],
  roles: RoleDraft[],
  groupLabels: Record<string, string> = DEFAULT_GROUP_LABELS,
  extraTokens: string[] = [],
): MergeTokenGroup[] {
  const all = new Set<string>([...catalogTokens, ...roleMergeTokens(roles), ...extraTokens])
  const byGroup = new Map<string, string[]>()
  for (const token of all) {
    const g = groupKey(token)
    const list = byGroup.get(g) || []
    list.push(token)
    byGroup.set(g, list)
  }

  const orderedKeys = [
    ...GROUP_ORDER.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !(GROUP_ORDER as readonly string[]).includes(g)).sort(),
  ]

  return orderedKeys.map((g) => ({
    group: groupLabels[g] || g,
    items: (byGroup.get(g) || [])
      .sort()
      .map((token) => ({ value: token, label: tokenLabel(token) })),
  }))
}

/** Flat list of token strings for Autocomplete-style creatable pickers. */
export function flattenMergeTokenOptions(groups: MergeTokenGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.value))
}

export function useMergeTokenCatalog() {
  return useQuery({
    queryKey: ['merge-tokens'],
    queryFn: () =>
      api<{ tokens: string[]; groups?: Record<string, string> }>('/api/templates/merge-tokens/'),
    staleTime: 60_000,
  })
}

export function isKnownMergeToken(
  token: string,
  catalogTokens: string[],
  roles: RoleDraft[],
): boolean {
  const key = token.trim()
  if (!key) return true
  if (catalogTokens.includes(key)) return true
  if (key.startsWith('deal.') || key.startsWith('custom.') || key.startsWith('role.')) {
    return true
  }
  return roleMergeTokens(roles).includes(key)
}

export function inferFillMode(
  fieldType: string,
  mergeToken: string | undefined,
  explicit?: 'signer' | 'document',
): 'signer' | 'document' {
  if (explicit === 'signer' || explicit === 'document') return explicit
  if (fieldType === 'signature' || fieldType === 'initials' || fieldType === 'checkbox') {
    return 'signer'
  }
  const token = (mergeToken || '').trim()
  if (
    token.startsWith('listing.') ||
    token.startsWith('deal.') ||
    token.startsWith('custom.') ||
    token.startsWith('role.')
  ) {
    return 'document'
  }
  return 'signer'
}

/** Tokens that imply shared document data (stamp on send). */
export function isDocumentDataToken(token: string | undefined): boolean {
  const key = (token || '').trim()
  return (
    key.startsWith('listing.') ||
    key.startsWith('deal.') ||
    key.startsWith('custom.') ||
    key.startsWith('role.')
  )
}
