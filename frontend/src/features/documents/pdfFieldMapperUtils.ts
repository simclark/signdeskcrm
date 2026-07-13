import {
  IconCalendar,
  IconCheckbox,
  IconLetterCase,
  IconSignature,
  IconTextSize,
} from '@tabler/icons-react'
import type { FieldDraft, FieldType } from '../envelopes/types'

export const FIELD_TOOLS: Array<{
  type: FieldType
  label: string
  icon: typeof IconSignature
}> = [
  { type: 'signature', label: 'Signature', icon: IconSignature },
  { type: 'initials', label: 'Initials', icon: IconLetterCase },
  { type: 'date', label: 'Date', icon: IconCalendar },
  { type: 'text', label: 'Text', icon: IconTextSize },
  { type: 'checkbox', label: 'Checkbox', icon: IconCheckbox },
]

export const MIN_FIELD_W = 0.025
export const MIN_FIELD_H = 0.025
export const RESIZE_EDGE_PX = 8

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

export type RoleDraft = {
  name: string
  email: string
  role: 'signer' | 'cc'
  routing_order: number
  contact?: number | null
}

export function toAppMediaUrl(url: string | null | undefined) {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname.startsWith('/media/')) {
      return `${parsed.pathname}${parsed.search}`
    }
  } catch {
    /* keep original */
  }
  return url
}

export function draftsSnapshot(roles: RoleDraft[], fields: FieldDraft[]) {
  return JSON.stringify({
    roles: roles.map((s) => ({
      name: s.name,
      email: s.email,
      role: s.role,
      routing_order: s.routing_order,
      contact: s.contact ?? null,
    })),
    fields: fields.map((f) => ({
      recipientIndex: f.recipientIndex,
      field_type: f.field_type,
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      required: f.required,
      label: f.label,
    })),
  })
}

/** Convert PDF.js click (top-left origin) to Field coords (bottom-left origin), both normalized 0–1. */
export function clickToFieldCoords(
  relX: number,
  relY: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const x = Math.min(Math.max(relX - w / 2, 0), 1 - w)
  const topY = Math.min(Math.max(relY - h / 2, 0), 1 - h)
  const y = 1 - topY - h
  return { x, y }
}

export function fieldToOverlayStyle(field: FieldDraft) {
  return {
    left: `${field.x * 100}%`,
    bottom: `${field.y * 100}%`,
    width: `${field.w * 100}%`,
    height: `${field.h * 100}%`,
  }
}

/** Field box in top-left normalized coords (for marquee hit-testing). */
export function fieldTopLeftBox(field: FieldDraft) {
  return {
    left: field.x,
    top: 1 - field.y - field.h,
    right: field.x + field.w,
    bottom: 1 - field.y,
  }
}

export function boxesIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function resizeCursor(handle: ResizeHandle | null): string {
  if (!handle) return 'grab'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

/** Hit-test field edges/corners for resize (no visible handles). */
export function hitResizeHandle(
  clientX: number,
  clientY: number,
  el: HTMLElement,
): ResizeHandle | null {
  const rect = el.getBoundingClientRect()
  const onLeft = clientX - rect.left <= RESIZE_EDGE_PX
  const onRight = rect.right - clientX <= RESIZE_EDGE_PX
  const onTop = clientY - rect.top <= RESIZE_EDGE_PX
  const onBottom = rect.bottom - clientY <= RESIZE_EDGE_PX
  if (onTop && onLeft) return 'nw'
  if (onTop && onRight) return 'ne'
  if (onBottom && onLeft) return 'sw'
  if (onBottom && onRight) return 'se'
  if (onTop) return 'n'
  if (onBottom) return 's'
  if (onLeft) return 'w'
  if (onRight) return 'e'
  return null
}

export function roleLabel(role: RoleDraft, idx: number) {
  return role.name.trim() || role.email.trim() || `Signer ${idx + 1}`
}

export function roleInitials(role: RoleDraft, idx: number) {
  const name = role.name.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return String(idx + 1)
}

export function layoutFromFields(fields: FieldDraft[]) {
  return fields.map((f) => ({
    field_type: f.field_type,
    page: f.page,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    required: f.required,
    label: f.label,
    recipient_index: f.recipientIndex,
  }))
}

export function fieldsFromLayout(
  layout: Array<{
    field_type: string
    page: number
    x: number
    y: number
    w: number
    h: number
    required?: boolean
    label?: string
    recipient_index: number
  }>,
  newId: () => string,
): FieldDraft[] {
  return layout.map((item) => ({
    id: newId(),
    recipientIndex: item.recipient_index ?? 0,
    field_type: item.field_type as FieldType,
    page: item.page || 1,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    required: item.required ?? true,
    label: item.label || '',
  }))
}

export function rolesFromLayout(
  layout: Array<{ recipient_index?: number }>,
): RoleDraft[] {
  const maxIndex = layout.reduce((max, item) => Math.max(max, item.recipient_index ?? 0), 0)
  const count = Math.max(1, maxIndex + 1)
  return Array.from({ length: count }, (_, idx) => ({
    name: `Signer ${idx + 1}`,
    email: '',
    role: 'signer' as const,
    routing_order: idx + 1,
    contact: null,
  }))
}
