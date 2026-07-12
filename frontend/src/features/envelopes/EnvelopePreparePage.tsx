import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconCalendar,
  IconCheckbox,
  IconCopy,
  IconLetterCase,
  IconPlus,
  IconSignature,
  IconTextSize,
  IconTrash,
  IconUser,
  IconX,
} from '@tabler/icons-react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../shared/api'
import {
  DEFAULT_FIELD_SIZE,
  SIGNER_COLORS,
  newFieldId,
  type EnvelopeDetail,
  type FieldDraft,
  type FieldType,
  type SignerDraft,
} from './types'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

function toAppMediaUrl(url: string | null | undefined) {
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

const FIELD_TOOLS: Array<{ type: FieldType; label: string; icon: typeof IconSignature }> = [
  { type: 'signature', label: 'Signature', icon: IconSignature },
  { type: 'initials', label: 'Initials', icon: IconLetterCase },
  { type: 'date', label: 'Date', icon: IconCalendar },
  { type: 'text', label: 'Text', icon: IconTextSize },
  { type: 'checkbox', label: 'Checkbox', icon: IconCheckbox },
]

const MIN_FIELD_W = 0.025
const MIN_FIELD_H = 0.025

function draftsSnapshot(signers: SignerDraft[], fields: FieldDraft[]) {
  return JSON.stringify({
    signers: signers.map((s) => ({
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

function validatePrepareDrafts(signers: SignerDraft[], fields: FieldDraft[]): string | null {
  for (const s of signers) {
    if (!s.name.trim() || !s.email.trim()) {
      return 'Each signer needs a name and email'
    }
  }
  if (!fields.length) {
    return 'Place at least one field on the document'
  }
  for (let i = 0; i < signers.length; i++) {
    const hasSignature = fields.some(
      (f) => f.recipientIndex === i && f.field_type === 'signature',
    )
    if (!hasSignature) {
      const label = signers[i].name.trim() || signers[i].email.trim() || `Signer ${i + 1}`
      return `${label} needs at least one signature field`
    }
  }
  return null
}
const RESIZE_EDGE_PX = 8
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

function resizeCursor(handle: ResizeHandle | null): string {
  if (!handle) return 'grab'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

/** Hit-test field edges/corners for resize (no visible handles). */
function hitResizeHandle(clientX: number, clientY: number, el: HTMLElement): ResizeHandle | null {
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

function recipientsToDrafts(envelope: EnvelopeDetail, params: URLSearchParams): SignerDraft[] {
  if (envelope.recipients?.length) {
    return envelope.recipients.map((r, idx) => ({
      name: r.name,
      email: r.email,
      role: (r.role as 'signer' | 'cc') || 'signer',
      routing_order: r.routing_order || idx + 1,
      contact: r.contact ?? null,
    }))
  }
  return [
    {
      name: params.get('name') || '',
      email: params.get('email') || '',
      role: 'signer',
      routing_order: 1,
      contact: params.get('contact') ? Number(params.get('contact')) : null,
    },
  ]
}

function fieldsToDrafts(envelope: EnvelopeDetail): FieldDraft[] {
  if (!envelope.fields?.length || !envelope.recipients?.length) return []
  const indexById = new Map(envelope.recipients.map((r, i) => [r.id, i]))
  return envelope.fields.map((f) => ({
    id: newFieldId(),
    recipientIndex: indexById.get(f.recipient) ?? 0,
    field_type: f.field_type as FieldType,
    page: f.page,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    required: f.required,
    label: f.label,
  }))
}

/** Convert PDF.js click (top-left origin) to Field coords (bottom-left origin), both normalized 0–1. */
function clickToFieldCoords(
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

function fieldToOverlayStyle(field: FieldDraft) {
  return {
    left: `${field.x * 100}%`,
    bottom: `${field.y * 100}%`,
    width: `${field.w * 100}%`,
    height: `${field.h * 100}%`,
  }
}

/** Field box in top-left normalized coords (for marquee hit-testing). */
function fieldTopLeftBox(field: FieldDraft) {
  return {
    left: field.x,
    top: 1 - field.y - field.h,
    right: field.x + field.w,
    bottom: 1 - field.y,
  }
}

function boxesIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function EnvelopePreparePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageWrapRef = useRef<HTMLDivElement>(null)

  const [signers, setSigners] = useState<SignerDraft[]>([])
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [activeSigner, setActiveSigner] = useState(0)
  const [activeTool, setActiveTool] = useState<FieldType>('signature')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [fieldMenu, setFieldMenu] = useState<{ fieldIds: string[]; x: number; y: number } | null>(null)
  const [marqueeBox, setMarqueeBox] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  /** PDF page size in PDF units (unscaled). */
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  /** Display box matching page aspect — updated on container resize. */
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const allowLeaveRef = useRef(false)
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    fieldId: string
    fieldIds: string[]
    handle?: ResizeHandle
    startX: number
    startY: number
    origins: Record<string, { x: number; y: number; w: number; h: number }>
  } | null>(null)
  const marqueeRef = useRef<{
    startX: number
    startY: number
    additive: boolean
    originSelected: string[]
    moved: boolean
  } | null>(null)

  const { data: envelope, isLoading } = useQuery({
    queryKey: ['envelope', id],
    queryFn: () => api<EnvelopeDetail>(`/api/envelopes/${id}/`),
    enabled: !!id,
  })

  const isDirty = hydrated && draftsSnapshot(signers, fields) !== savedSnapshot

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeaveRef.current) return false
    return isDirty && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (!envelope || hydrated) return
    const nextSigners = recipientsToDrafts(envelope, params)
    const nextFields = fieldsToDrafts(envelope)
    setSigners(nextSigners)
    setFields(nextFields)
    setPageCount(envelope.page_count || 1)
    setSavedSnapshot(draftsSnapshot(nextSigners, nextFields))
    setHydrated(true)
  }, [envelope, hydrated, params])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm('You have unsaved changes. Leave without saving?')
    if (leave) {
      allowLeaveRef.current = true
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  useEffect(() => {
    const fileUrl = toAppMediaUrl(envelope?.document_file_url)
    if (!fileUrl) return
    let cancelled = false
    setPageSize(null)
    setDisplaySize(null)
    ;(async () => {
      try {
        const doc = await pdfjs.getDocument({ url: fileUrl }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setPageCount(doc.numPages)
      } catch {
        notifications.show({ color: 'red', message: 'Could not load PDF preview' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [envelope?.document_file_url])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return

    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    ;(async () => {
      try {
        const pdfPage = await pdfDoc.getPage(page)
        if (cancelled || !canvasRef.current) return

        const baseViewport = pdfPage.getViewport({ scale: 1 })
        setPageSize({ width: baseViewport.width, height: baseViewport.height })

        const viewport = pdfPage.getViewport({ scale: 2 })
        const canvas = canvasRef.current
        // Do not call getContext beforehand — pdf.js needs alpha: false.
        // A prior getContext('2d') locks alpha:true and paints a transparent blank page.
        canvas.width = viewport.width
        canvas.height = viewport.height

        renderTask = pdfPage.render({
          canvas,
          viewport,
          background: 'rgb(255,255,255)',
        })
        await renderTask.promise
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        if (/cancel/i.test(message)) return
        notifications.show({ color: 'red', message: 'Could not render PDF page' })
      }
    })()

    return () => {
      cancelled = true
      try {
        renderTask?.cancel()
      } catch {
        /* ignore */
      }
    }
  }, [pdfDoc, page])

  // Keep the overlay box's height in lockstep with container width × page aspect
  // (nav expand/collapse, window resize, etc.).
  useEffect(() => {
    const wrap = pageWrapRef.current
    if (!wrap || !pageSize) return

    const syncDisplaySize = () => {
      const width = wrap.clientWidth
      if (width <= 0) return
      const height = width * (pageSize.height / pageSize.width)
      setDisplaySize((prev) => {
        if (
          prev &&
          Math.abs(prev.width - width) < 0.5 &&
          Math.abs(prev.height - height) < 0.5
        ) {
          return prev
        }
        return { width, height }
      })
    }

    syncDisplaySize()
    const ro = new ResizeObserver(syncDisplaySize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pageSize])

  useEffect(() => {
    if (!fieldMenu) return
    const close = () => setFieldMenu(null)
    const timer = window.setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('scroll', close, true)
      window.addEventListener('resize', close)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [fieldMenu])

  const pageFields = useMemo(() => fields.filter((f) => f.page === page), [fields, page])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const activeSignerColor = SIGNER_COLORS[activeSigner % SIGNER_COLORS.length]

  useEffect(() => {
    setSelectedIds([])
    setFieldMenu(null)
    setMarqueeBox(null)
  }, [page])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (!selectedIds.length) return
      e.preventDefault()
      setFields((prev) => prev.filter((f) => !selectedSet.has(f.id)))
      setSelectedIds([])
      setFieldMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, selectedSet])

  const addSigner = () => {
    if (signers.length >= 10) {
      notifications.show({ color: 'yellow', message: 'Maximum of 10 signers' })
      return
    }
    setSigners((prev) => [
      ...prev,
      {
        name: '',
        email: '',
        role: 'signer',
        routing_order: prev.length + 1,
        contact: null,
      },
    ])
    setActiveSigner(signers.length)
  }

  const removeSigner = (index: number) => {
    if (signers.length <= 1) return
    setSigners((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, routing_order: i + 1 })),
    )
    setFields((prev) =>
      prev
        .filter((f) => f.recipientIndex !== index)
        .map((f) => ({
          ...f,
          recipientIndex: f.recipientIndex > index ? f.recipientIndex - 1 : f.recipientIndex,
        })),
    )
    setActiveSigner((current) => {
      if (current === index) return Math.max(0, index - 1)
      if (current > index) return current - 1
      return current
    })
  }

  const signerLabel = (s: SignerDraft, idx: number) =>
    s.name.trim() || s.email.trim() || `Signer ${idx + 1}`

  const signerInitials = (s: SignerDraft, idx: number) => {
    const name = s.name.trim()
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean)
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      return name.slice(0, 2).toUpperCase()
    }
    return String(idx + 1)
  }

  const duplicateFields = (ids: string[]) => {
    if (!ids.length) return
    const offset = 0.025
    const created: FieldDraft[] = []
    for (const fieldId of ids) {
      const field = fields.find((f) => f.id === fieldId)
      if (!field) continue
      created.push({
        ...field,
        id: newFieldId(),
        x: Math.min(field.x + offset, 1 - field.w),
        y: Math.max(0, field.y - offset),
      })
    }
    if (!created.length) return
    setFields((prev) => [...prev, ...created])
    setSelectedIds(created.map((f) => f.id))
    setFieldMenu(null)
  }

  const deleteFields = (ids: string[]) => {
    if (!ids.length) return
    const remove = new Set(ids)
    setFields((prev) => prev.filter((f) => !remove.has(f.id)))
    setSelectedIds((prev) => prev.filter((id) => !remove.has(id)))
    setFieldMenu(null)
  }

  const onFieldContextMenu = (e: ReactMouseEvent, field: FieldDraft) => {
    e.preventDefault()
    e.stopPropagation()
    const ids = selectedSet.has(field.id) ? selectedIds : [field.id]
    if (!selectedSet.has(field.id)) {
      setSelectedIds([field.id])
      setActiveSigner(field.recipientIndex)
    }
    setFieldMenu({ fieldIds: ids, x: e.clientX, y: e.clientY })
  }

  const placeField = (clientX: number, clientY: number) => {
    const wrap = pageWrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const relY = (clientY - rect.top) / rect.height
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return

    const size = DEFAULT_FIELD_SIZE[activeTool]
    const { x, y } = clickToFieldCoords(relX, relY, size.w, size.h)
    const draft: FieldDraft = {
      id: newFieldId(),
      recipientIndex: activeSigner,
      field_type: activeTool,
      page,
      x,
      y,
      w: size.w,
      h: size.h,
      required: true,
      label: size.label,
    }
    setFields((prev) => [...prev, draft])
    setSelectedIds([draft.id])
  }

  const onWrapPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-field-id]')) return
    const wrap = pageWrapRef.current
    if (!wrap) return
    marqueeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      originSelected: e.shiftKey || e.metaKey || e.ctrlKey ? selectedIds : [],
      moved: false,
    }
    wrap.setPointerCapture(e.pointerId)
  }

  const onWrapPointerMove = (e: ReactPointerEvent) => {
    const m = marqueeRef.current
    const wrap = pageWrapRef.current
    if (!m || !wrap) return

    const dist = Math.hypot(e.clientX - m.startX, e.clientY - m.startY)
    if (dist > 4) m.moved = true
    if (!m.moved) return

    const rect = wrap.getBoundingClientRect()
    const x1 = (m.startX - rect.left) / rect.width
    const y1 = (m.startY - rect.top) / rect.height
    const x2 = (e.clientX - rect.left) / rect.width
    const y2 = (e.clientY - rect.top) / rect.height
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const width = Math.abs(x2 - x1)
    const height = Math.abs(y2 - y1)
    setMarqueeBox({ left, top, width, height })

    const marquee = { left, top, right: left + width, bottom: top + height }
    const hit = pageFields
      .filter((f) => boxesIntersect(fieldTopLeftBox(f), marquee))
      .map((f) => f.id)
    setSelectedIds(m.additive ? [...new Set([...m.originSelected, ...hit])] : hit)
  }

  const onWrapPointerUp = () => {
    const m = marqueeRef.current
    marqueeRef.current = null
    setMarqueeBox(null)
    if (m && !m.moved && !m.additive) {
      setSelectedIds([])
    }
  }

  const setActiveSignerAndMaybeReassign = (idx: number) => {
    setActiveSigner(idx)
    if (selectedIds.length) {
      patchSelectedFields({ recipientIndex: idx })
    }
  }

  const onFieldPointerDown = (e: ReactPointerEvent, field: FieldDraft) => {
    e.stopPropagation()
    const handle = hitResizeHandle(e.clientX, e.clientY, e.currentTarget as HTMLElement)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey

    let nextSelected = selectedIds
    if (additive) {
      nextSelected = selectedSet.has(field.id)
        ? selectedIds.filter((id) => id !== field.id)
        : [...selectedIds, field.id]
      setSelectedIds(nextSelected)
      if (!handle) return
    } else if (!selectedSet.has(field.id)) {
      nextSelected = [field.id]
      setSelectedIds(nextSelected)
      setActiveSigner(field.recipientIndex)
    } else if (selectedIds.length === 1) {
      setActiveSigner(field.recipientIndex)
    }

    const movingIds =
      handle && nextSelected.length === 1 ? [field.id] : nextSelected.includes(field.id) ? nextSelected : [field.id]

    const origins: Record<string, { x: number; y: number; w: number; h: number }> = {}
    for (const f of fields) {
      if (movingIds.includes(f.id)) {
        origins[f.id] = { x: f.x, y: f.y, w: f.w, h: f.h }
      }
    }

    dragRef.current = {
      mode: handle && movingIds.length === 1 ? 'resize' : 'move',
      fieldId: field.id,
      fieldIds: movingIds,
      handle: handle && movingIds.length === 1 ? handle : undefined,
      startX: e.clientX,
      startY: e.clientY,
      origins,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onFieldPointerMove = (e: ReactPointerEvent) => {
    const el = e.currentTarget as HTMLElement
    const drag = dragRef.current
    const wrap = pageWrapRef.current

    if (!drag || drag.fieldId !== (el.dataset.fieldId ?? '')) {
      el.style.cursor = resizeCursor(hitResizeHandle(e.clientX, e.clientY, el))
      return
    }

    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const dx = (e.clientX - drag.startX) / rect.width
    const dy = (e.clientY - drag.startY) / rect.height

    setFields((prev) =>
      prev.map((f) => {
        const orig = drag.origins[f.id]
        if (!orig) return f

        if (drag.mode === 'move') {
          el.style.cursor = 'grabbing'
          const x = Math.min(Math.max(orig.x + dx, 0), 1 - f.w)
          const y = Math.min(Math.max(orig.y - dy, 0), 1 - f.h)
          return { ...f, x, y }
        }

        if (f.id !== drag.fieldId) return f
        const handle = drag.handle!
        el.style.cursor = resizeCursor(handle)
        let { x, y, w, h } = { x: orig.x, y: orig.y, w: orig.w, h: orig.h }

        if (handle.includes('e')) {
          w = Math.min(Math.max(orig.w + dx, MIN_FIELD_W), 1 - x)
        }
        if (handle.includes('w')) {
          const nextW = Math.min(Math.max(orig.w - dx, MIN_FIELD_W), orig.x + orig.w)
          x = orig.x + orig.w - nextW
          w = nextW
        }
        if (handle.includes('n')) {
          h = Math.min(Math.max(orig.h - dy, MIN_FIELD_H), 1 - y)
        }
        if (handle.includes('s')) {
          const nextH = Math.min(Math.max(orig.h + dy, MIN_FIELD_H), orig.y + orig.h)
          y = orig.y + orig.h - nextH
          h = nextH
        }

        x = Math.min(Math.max(x, 0), 1 - w)
        y = Math.min(Math.max(y, 0), 1 - h)
        return { ...f, x, y, w, h }
      }),
    )
  }

  const onFieldPointerUp = (e: ReactPointerEvent) => {
    dragRef.current = null
    const el = e.currentTarget as HTMLElement
    el.style.cursor = resizeCursor(hitResizeHandle(e.clientX, e.clientY, el))
  }

  const save = useMutation({
    mutationFn: async ({ continueAfter }: { continueAfter: boolean }) => {
      if (!id) throw new Error('Missing envelope')
      const error = validatePrepareDrafts(signers, fields)
      if (error) {
        // Allow plain Save with incomplete layout, but still require signer identity.
        if (continueAfter) throw new Error(error)
        for (const s of signers) {
          if (!s.name.trim() || !s.email.trim()) {
            throw new Error('Each signer needs a name and email')
          }
        }
      }

      const createdRecipients = await api<Array<{ id: number }>>(`/api/envelopes/${id}/recipients/`, {
        method: 'PUT',
        json: signers.map((s, idx) => ({
          name: s.name.trim(),
          email: s.email.trim(),
          role: s.role,
          routing_order: s.routing_order || idx + 1,
          contact: s.contact || null,
        })),
      })

      const payload = fields.map((f) => ({
        recipient: createdRecipients[Math.min(f.recipientIndex, createdRecipients.length - 1)].id,
        field_type: f.field_type,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        required: f.required,
        label: f.label,
      }))

      await api(`/api/envelopes/${id}/fields/`, { method: 'PUT', json: payload })
      return { envelopeId: id, continueAfter, snapshot: draftsSnapshot(signers, fields) }
    },
    onSuccess: ({ envelopeId, continueAfter, snapshot }) => {
      setSavedSnapshot(snapshot)
      qc.invalidateQueries({ queryKey: ['envelope', envelopeId] })
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      if (continueAfter) {
        notifications.show({ color: 'forest', message: 'Envelope prepared' })
        allowLeaveRef.current = true
        navigate(`/app/envelopes/${envelopeId}`)
      } else {
        notifications.show({ color: 'forest', message: 'Progress saved' })
      }
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: err.message }),
  })

  const selectedField = selectedIds.length === 1 ? fields.find((f) => f.id === selectedIds[0]) : null

  const patchSelectedFields = (patch: Partial<FieldDraft>, ids = selectedIds) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    setFields((prev) => prev.map((f) => (idSet.has(f.id) ? { ...f, ...patch } : f)))
  }

  const requestLeave = (path: string) => {
    navigate(path)
  }

  if (isLoading || !envelope || !hydrated) return null

  if (envelope.status !== 'draft') {
    return (
      <Stack>
        <Title order={2}>Prepare envelope</Title>
        <Text c="dimmed">Only draft envelopes can be prepared.</Text>
        <Button variant="light" onClick={() => navigate(`/app/envelopes/${id}`)}>
          Back to envelope
        </Button>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Prepare: {envelope.title}</Title>
          <Text c="dimmed">
            Set signers and place signature, initials, date, text, and checkbox fields.
          </Text>
        </div>
        <Group>
          <Button variant="default" onClick={() => requestLeave(`/app/envelopes/${id}`)}>
            Cancel
          </Button>
          <Button
            variant="light"
            onClick={() => save.mutate({ continueAfter: false })}
            loading={save.isPending && save.variables?.continueAfter === false}
          >
            Save
          </Button>
          <Button
            onClick={() => save.mutate({ continueAfter: true })}
            loading={save.isPending && save.variables?.continueAfter === true}
          >
            Save & continue
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" gap="lg" wrap="nowrap" style={{ alignItems: 'stretch' }}>
        <Stack style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Page {page} of {pageCount} · {fields.length} field{fields.length === 1 ? '' : 's'}
              {selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}
            </Text>
            <Group gap="xs">
              <ActionIcon
                variant="default"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </ActionIcon>
              <ActionIcon
                variant="default"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                ›
              </ActionIcon>
            </Group>
          </Group>

          <Card withBorder radius="lg" p={0} style={{ overflow: 'visible' }}>
            <div
              ref={pageWrapRef}
              style={{
                position: 'relative',
                display: 'block',
                width: '100%',
                height: displaySize?.height ?? 240,
                cursor: 'crosshair',
              }}
              onPointerDown={onWrapPointerDown}
              onPointerMove={onWrapPointerMove}
              onPointerUp={onWrapPointerUp}
              onDoubleClick={(e) => {
                if (marqueeRef.current?.moved) return
                placeField(e.clientX, e.clientY)
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: 'block',
                  width: displaySize?.width ?? '100%',
                  height: displaySize?.height ?? '100%',
                }}
              />
              {marqueeBox && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${marqueeBox.left * 100}%`,
                    top: `${marqueeBox.top * 100}%`,
                    width: `${marqueeBox.width * 100}%`,
                    height: `${marqueeBox.height * 100}%`,
                    border: '1px solid var(--mantine-color-forest-6)',
                    background: 'color-mix(in srgb, var(--mantine-color-forest-6) 12%, transparent)',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                />
              )}
              {pageFields.map((field) => {
                const color = SIGNER_COLORS[field.recipientIndex % SIGNER_COLORS.length]
                const selected = selectedSet.has(field.id)
                const signer = signers[field.recipientIndex]
                return (
                  <div
                    key={field.id}
                    data-field-id={field.id}
                    onPointerDown={(e) => onFieldPointerDown(e, field)}
                    onPointerMove={onFieldPointerMove}
                    onPointerUp={onFieldPointerUp}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => onFieldContextMenu(e, field)}
                    style={{
                      position: 'absolute',
                      ...fieldToOverlayStyle(field),
                      background: `${color}22`,
                      border: selected ? `2px solid ${color}` : `2px dotted ${color}`,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      color,
                      cursor: 'grab',
                      userSelect: 'none',
                      touchAction: 'none',
                      padding: '0 4px',
                      zIndex: selected ? 2 : 1,
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: color,
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontWeight: 700,
                        flexShrink: 0,
                        pointerEvents: 'none',
                      }}
                    >
                      {signer ? signerInitials(signer, field.recipientIndex) : field.recipientIndex + 1}
                    </span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {field.label || field.field_type}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </Stack>

        <Card
          withBorder
          radius="lg"
          p="md"
          w={340}
          style={{ flexShrink: 0, position: 'sticky', top: 16, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 32px)', overflow: 'auto' }}
        >
          <Stack gap="lg">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={600}>
                  Signers
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={addSigner}
                  disabled={signers.length >= 10}
                >
                  Add signer
                </Button>
              </Group>

              <Stack gap="sm">
                {signers.map((s, idx) => {
                  const color = SIGNER_COLORS[idx % SIGNER_COLORS.length]
                  const isActive = idx === activeSigner
                  return (
                    <Card
                      key={idx}
                      withBorder
                      padding="sm"
                      radius="md"
                      style={{
                        borderColor: isActive ? color : undefined,
                        boxShadow: isActive ? `0 0 0 1px ${color}` : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setActiveSigner(idx)}
                    >
                      <Group gap="xs" mb={6} justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: color,
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {signerInitials(s, idx)}
                          </div>
                          <Text size="sm" fw={600} lineClamp={1}>
                            {signerLabel(s, idx)}
                          </Text>
                        </Group>
                        {signers.length > 1 && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            aria-label={`Remove ${signerLabel(s, idx)}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              removeSigner(idx)
                            }}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                      <Stack gap={6} onClick={(e) => e.stopPropagation()}>
                        <TextInput
                          size="xs"
                          placeholder="Name"
                          value={s.name}
                          onChange={(e) => {
                            const next = [...signers]
                            next[idx] = { ...next[idx], name: e.currentTarget.value }
                            setSigners(next)
                          }}
                        />
                        <TextInput
                          size="xs"
                          placeholder="Email"
                          value={s.email}
                          onChange={(e) => {
                            const next = [...signers]
                            next[idx] = { ...next[idx], email: e.currentTarget.value }
                            setSigners(next)
                          }}
                        />
                      </Stack>
                    </Card>
                  )
                })}
              </Stack>
            </Stack>

            <Divider />

            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <div>
                  <Text size="sm" fw={600}>
                    Field tools
                  </Text>
                  <Text size="xs" c="dimmed">
                    Double-click to place · drag to multi-select · right-click to duplicate
                  </Text>
                </div>
              </Group>

              <div>
                <Text size="xs" c="dimmed" mb={8} tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
                  Assign to
                </Text>
                <Text size="xs" c="dimmed" mb={8}>
                  {selectedIds.length
                    ? 'Changes the signer for selected fields'
                    : 'New fields are placed for this signer'}
                </Text>
                <Group gap={8}>
                  {signers.map((s, idx) => {
                    const color = SIGNER_COLORS[idx % SIGNER_COLORS.length]
                    const isActive = idx === activeSigner
                    return (
                      <Tooltip key={idx} label={signerLabel(s, idx)}>
                        <UnstyledButton
                          onClick={() => setActiveSignerAndMaybeReassign(idx)}
                          aria-label={`Active signer ${signerLabel(s, idx)}`}
                          aria-pressed={isActive}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: color,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            outline: isActive ? `2px solid ${color}` : '2px solid transparent',
                            outlineOffset: 2,
                            boxShadow: isActive ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : undefined,
                            opacity: isActive ? 1 : 0.65,
                            transition: 'opacity 120ms ease, box-shadow 120ms ease',
                          }}
                        >
                          {s.name.trim() || s.email.trim() ? (
                            signerInitials(s, idx)
                          ) : (
                            <IconUser size={16} stroke={2.2} />
                          )}
                        </UnstyledButton>
                      </Tooltip>
                    )
                  })}
                </Group>
              </div>

              <SimpleGrid cols={2} spacing="xs">
                {FIELD_TOOLS.map((tool) => {
                  const selected = activeTool === tool.type
                  return (
                    <Button
                      key={tool.type}
                      size="sm"
                      fullWidth
                      justify="flex-start"
                      variant={selected ? 'filled' : 'light'}
                      leftSection={<tool.icon size={16} />}
                      onClick={() => setActiveTool(tool.type)}
                      styles={
                        selected
                          ? {
                              root: {
                                backgroundColor: activeSignerColor,
                                borderColor: activeSignerColor,
                                '--button-hover': activeSignerColor,
                              },
                            }
                          : {
                              root: {
                                color: activeSignerColor,
                                borderColor: `${activeSignerColor}40`,
                                backgroundColor: `${activeSignerColor}12`,
                              },
                            }
                      }
                    >
                      {tool.label}
                    </Button>
                  )
                })}
              </SimpleGrid>

              {selectedField && (
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
                    Selected field
                  </Text>
                  <TextInput
                    size="xs"
                    label="Label"
                    value={selectedField.label}
                    onChange={(e) => patchSelectedFields({ label: e.currentTarget.value })}
                  />
                  <Switch
                    size="sm"
                    label="Required"
                    checked={selectedField.required}
                    onChange={(e) => patchSelectedFields({ required: e.currentTarget.checked })}
                  />
                </Stack>
              )}

              {selectedIds.length > 1 && (
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
                    {selectedIds.length} fields selected
                  </Text>
                  <Switch
                    size="sm"
                    label="Required"
                    checked={selectedIds.every(
                      (id) => fields.find((f) => f.id === id)?.required,
                    )}
                    onChange={(e) => patchSelectedFields({ required: e.currentTarget.checked })}
                  />
                </Stack>
              )}

              {selectedIds.length > 0 && (
                <Group gap="xs" grow>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconCopy size={14} />}
                    onClick={() => duplicateFields(selectedIds)}
                  >
                    Duplicate{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => deleteFields(selectedIds)}
                  >
                    Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
                  </Button>
                </Group>
              )}
            </Stack>
          </Stack>
        </Card>
      </Group>

      {fieldMenu && (
        <Paper
          withBorder
          shadow="md"
          radius="md"
          p={4}
          style={{
            position: 'fixed',
            left: fieldMenu.x,
            top: fieldMenu.y,
            zIndex: 1000,
            minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Stack gap={2}>
            <UnstyledButton
              onClick={() => duplicateFields(fieldMenu.fieldIds)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <IconCopy size={14} />
              Duplicate{fieldMenu.fieldIds.length > 1 ? ` ${fieldMenu.fieldIds.length} fields` : ' field'}
            </UnstyledButton>
            <UnstyledButton
              onClick={() => deleteFields(fieldMenu.fieldIds)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--mantine-color-red-6)',
              }}
            >
              <IconTrash size={14} />
              Delete{fieldMenu.fieldIds.length > 1 ? ` ${fieldMenu.fieldIds.length} fields` : ' field'}
            </UnstyledButton>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
