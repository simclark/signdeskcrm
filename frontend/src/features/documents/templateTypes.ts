export type TemplateDetail = {
  id: number
  name: string
  document: number
  document_title: string | null
  document_file_url: string | null
  page_count: number | null
  field_layout: TemplateLayoutItem[]
  is_active: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type TemplateLayoutItem = {
  field_type: string
  page: number
  x: number
  y: number
  w: number
  h: number
  required?: boolean
  label?: string
  recipient_index: number
}

export type TemplateListItem = {
  id: number
  name: string
  document: number
  document_title: string | null
  document_file_url: string | null
  page_count: number | null
  field_layout: TemplateLayoutItem[]
  is_active: boolean
  created_at: string
}
