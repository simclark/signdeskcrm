export const SIGNER_COLORS = ['#0B6E4F', '#E07A5F', '#3D5A80', '#9B5DE5', '#F4A261']

export type FieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox'

export type TemplateLayoutItem = {
  field_type: FieldType | string
  page: number
  x: number
  y: number
  w: number
  h: number
  required?: boolean
  label?: string
  recipient_index: number
}

export type SignerDraft = {
  name: string
  email: string
  role: 'signer' | 'cc'
  routing_order: number
  contact?: number | null
}

export type FieldDraft = {
  id: string
  recipientIndex: number
  field_type: FieldType
  page: number
  x: number
  y: number
  w: number
  h: number
  required: boolean
  label: string
}

export type EnvelopeDetail = {
  id: number
  title: string
  message: string
  status: string
  routing: string
  document: number
  template: number | null
  document_file_url: string | null
  page_count: number
  recipients: Array<{
    id: number
    name: string
    email: string
    role: string
    routing_order: number
    contact?: number | null
    status: string
  }>
  fields: Array<{
    id: number
    recipient: number
    field_type: string
    page: number
    x: number
    y: number
    w: number
    h: number
    required: boolean
    label: string
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
