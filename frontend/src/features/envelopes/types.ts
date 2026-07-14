export const SIGNER_COLORS = ['#0B6E4F', '#E07A5F', '#3D5A80', '#9B5DE5', '#F4A261']
/** Neutral chrome for document-data fields (not assigned to a signer). */
export const DOCUMENT_FIELD_COLOR = '#5C6B73'

export type FieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox'
export type FillMode = 'signer' | 'document'

export type TemplateLayoutItem = {
  field_type: FieldType | string
  page: number
  x: number
  y: number
  w: number
  h: number
  required?: boolean
  label?: string
  recipient_index?: number | null
  role_key?: string
  merge_token?: string
  fill_mode?: FillMode
  prefill_editable?: boolean
  value?: string
}

export type SignerDraft = {
  name: string
  email: string
  role: 'signer' | 'cc'
  routing_order: number
  contact?: number | null
  role_key?: string
}

export type FieldDraft = {
  id: string
  /** Null when fill_mode is document (signer-neutral). */
  recipientIndex: number | null
  field_type: FieldType
  page: number
  x: number
  y: number
  w: number
  h: number
  required: boolean
  label: string
  role_key?: string
  merge_token?: string
  fill_mode?: FillMode
  prefill_editable?: boolean
  value?: string
}

export type EnvelopeDetail = {
  id: number
  title: string
  message: string
  status: string
  routing: string
  document: number
  template: number | null
  listing?: number | null
  merge_data?: Record<string, string | Record<string, string>>
  document_file_url: string | null
  page_count: number
  recipients: Array<{
    id: number
    name: string
    email: string
    role: string
    role_key?: string
    routing_order: number
    contact?: number | null
    status: string
  }>
  fields: Array<{
    id: number
    recipient: number | null
    field_type: string
    page: number
    x: number
    y: number
    w: number
    h: number
    required: boolean
    label: string
    merge_token?: string
    fill_mode?: FillMode
    value?: string
  }>
}

export const DEFAULT_FIELD_SIZE: Record<FieldType, { w: number; h: number; label: string }> = {
  signature: { w: 0.28, h: 0.06, label: 'Signature' },
  initials: { w: 0.12, h: 0.05, label: 'Initials' },
  date: { w: 0.18, h: 0.04, label: 'Date' },
  text: { w: 0.25, h: 0.04, label: 'Text' },
  checkbox: { w: 0.03, h: 0.03, label: 'Checkbox' },
}

export function newFieldId() {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
