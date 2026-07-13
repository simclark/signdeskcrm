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
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconChevronRight,
  IconCopy,
  IconForms,
  IconGripVertical,
  IconPlus,
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
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  DEFAULT_FIELD_SIZE,
  SIGNER_COLORS,
  newFieldId,
  type FieldDraft,
  type FieldType,
} from '../envelopes/types'
import {
  FIELD_TOOLS,
  MIN_FIELD_H,
  MIN_FIELD_W,
  boxesIntersect,
  clickToFieldCoords,
  fieldToOverlayStyle,
  fieldTopLeftBox,
  hitResizeHandle,
  resizeCursor,
  roleInitials,
  roleLabel,
  toAppMediaUrl,
  type ResizeHandle,
  type RoleDraft,
} from './pdfFieldMapperUtils'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export type PdfFieldMapperProps = {
  documentFileUrl: string | null | undefined
  initialPageCount?: number
  roles: RoleDraft[]
  fields: FieldDraft[]
  onRolesChange: (roles: RoleDraft[]) => void
  onFieldsChange: (fields: FieldDraft[]) => void
  /** When true, show name/email inputs for each role (envelope prepare). */
  editableContacts?: boolean
  rolesTitle?: string
  addRoleLabel?: string
  /** Rendered in the right sidebar immediately below the selected-field controls. */
  sidebarActions?: ReactNode
  sidebarExtra?: ReactNode
}

type FieldMenuState = {
  fieldIds: string[]
  /** Field the menu is anchored to (moves with this field on scroll). */
  anchorFieldId: string
  /** Click offset from the anchor field's top-left. */
  offsetX: number
  offsetY: number
  x: number
  y: number
}

type CanvasMenuState = {
  x: number
  y: number
  clientX: number
  clientY: number
}

export function PdfFieldMapper({
  documentFileUrl,
  initialPageCount = 1,
  roles,
  fields,
  onRolesChange,
  onFieldsChange,
  editableContacts = true,
  rolesTitle = 'Signers',
  addRoleLabel = 'Add signer',
  sidebarActions,
  sidebarExtra,
}: PdfFieldMapperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageWrapRef = useRef<HTMLDivElement>(null)

  const [activeSigner, setActiveSigner] = useState(0)
  const [activeTool, setActiveTool] = useState<FieldType>('signature')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [fieldMenu, setFieldMenu] = useState<FieldMenuState | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState | null>(null)
  const [labelEditOpen, setLabelEditOpen] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [canvasFieldsFlyout, setCanvasFieldsFlyout] = useState(false)
  const [fieldTypeFlyout, setFieldTypeFlyout] = useState(false)
  const [dragOverPage, setDragOverPage] = useState(false)
  const [marqueeBox, setMarqueeBox] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(initialPageCount)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)

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

  useEffect(() => {
    const fileUrl = toAppMediaUrl(documentFileUrl)
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
  }, [documentFileUrl])

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
    if (!fieldMenu && !canvasMenu) return
    const close = () => {
      setFieldMenu(null)
      setCanvasMenu(null)
      setLabelEditOpen(false)
      setCanvasFieldsFlyout(false)
      setFieldTypeFlyout(false)
    }
    const timer = window.setTimeout(() => {
      // Close only on outside click or viewport resize — keep open while scrolling.
      window.addEventListener('click', close)
      window.addEventListener('resize', close)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
    }
  }, [fieldMenu, canvasMenu])

  const pageFields = useMemo(() => fields.filter((f) => f.page === page), [fields, page])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const activeSignerColor = SIGNER_COLORS[activeSigner % SIGNER_COLORS.length]
  const selectedField = selectedIds.length === 1 ? fields.find((f) => f.id === selectedIds[0]) : null
  const fieldMenuAnchor = fieldMenu
    ? fields.find((f) => f.id === fieldMenu.anchorFieldId)
    : null

  // Keep the field menu pinned to the right-clicked field while the page scrolls or the field moves.
  useEffect(() => {
    if (!fieldMenu) return
    const { anchorFieldId, offsetX, offsetY } = fieldMenu
    const sync = () => {
      const el = pageWrapRef.current?.querySelector(
        `[data-field-id="${anchorFieldId}"]`,
      ) as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = rect.left + offsetX
      const y = rect.top + offsetY
      setFieldMenu((m) => (m && (m.x !== x || m.y !== y) ? { ...m, x, y } : m))
    }
    sync()
    window.addEventListener('scroll', sync, true)
    return () => window.removeEventListener('scroll', sync, true)
  }, [fieldMenu?.anchorFieldId, fieldMenu?.offsetX, fieldMenu?.offsetY, fieldMenuAnchor?.x, fieldMenuAnchor?.y])

  useEffect(() => {
    setSelectedIds([])
    setFieldMenu(null)
    setCanvasMenu(null)
    setCanvasFieldsFlyout(false)
    setFieldTypeFlyout(false)
    setMarqueeBox(null)
  }, [page])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (!selectedIds.length) return
      e.preventDefault()
      onFieldsChange(fields.filter((f) => !selectedSet.has(f.id)))
      setSelectedIds([])
      setFieldMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, selectedSet, fields, onFieldsChange])

  const patchSelectedFields = (patch: Partial<FieldDraft>, ids = selectedIds) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    onFieldsChange(fields.map((f) => (idSet.has(f.id) ? { ...f, ...patch } : f)))
  }

  const addRole = () => {
    if (roles.length >= 10) {
      notifications.show({ color: 'yellow', message: 'Maximum of 10 signers' })
      return
    }
    onRolesChange([
      ...roles,
      {
        name: editableContacts ? '' : `Signer ${roles.length + 1}`,
        email: '',
        role: 'signer',
        routing_order: roles.length + 1,
        contact: null,
      },
    ])
    setActiveSigner(roles.length)
  }

  const removeRole = (index: number) => {
    if (roles.length <= 1) return
    onRolesChange(
      roles.filter((_, i) => i !== index).map((s, i) => ({ ...s, routing_order: i + 1 })),
    )
    onFieldsChange(
      fields
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
    onFieldsChange([...fields, ...created])
    setSelectedIds(created.map((f) => f.id))
    setFieldMenu(null)
  }

  const deleteFields = (ids: string[]) => {
    if (!ids.length) return
    const remove = new Set(ids)
    onFieldsChange(fields.filter((f) => !remove.has(f.id)))
    setSelectedIds((prev) => prev.filter((id) => !remove.has(id)))
    setFieldMenu(null)
  }

  const placeField = (
    clientX: number,
    clientY: number,
    overrides?: Partial<Pick<FieldDraft, 'field_type' | 'recipientIndex'>>,
  ) => {
    const wrap = pageWrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const relY = (clientY - rect.top) / rect.height
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return

    const tool = overrides?.field_type ?? activeTool
    const size = DEFAULT_FIELD_SIZE[tool]
    const { x, y } = clickToFieldCoords(relX, relY, size.w, size.h)
    const draft: FieldDraft = {
      id: newFieldId(),
      recipientIndex: overrides?.recipientIndex ?? activeSigner,
      field_type: tool,
      page,
      x,
      y,
      w: size.w,
      h: size.h,
      required: true,
      label: size.label,
    }
    onFieldsChange([...fields, draft])
    setSelectedIds([draft.id])
    setActiveTool(tool)
    setCanvasMenu(null)
  }

  const onToolDragStart = (e: ReactDragEvent, type: FieldType) => {
    e.dataTransfer.setData('application/x-signdesk-field', type)
    e.dataTransfer.effectAllowed = 'copy'
    setActiveTool(type)
    setFieldMenu(null)
    setCanvasMenu(null)
  }

  const onPageDragOver = (e: ReactDragEvent) => {
    if (![...e.dataTransfer.types].includes('application/x-signdesk-field')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverPage(true)
  }

  const onPageDragLeave = (e: ReactDragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOverPage(false)
  }

  const onPageDrop = (e: ReactDragEvent) => {
    e.preventDefault()
    setDragOverPage(false)
    const type = e.dataTransfer.getData('application/x-signdesk-field') as FieldType
    if (!FIELD_TOOLS.some((t) => t.type === type)) return
    placeField(e.clientX, e.clientY, { field_type: type })
  }

  const onFieldContextMenu = (e: ReactMouseEvent, field: FieldDraft) => {
    e.preventDefault()
    e.stopPropagation()
    setCanvasMenu(null)
    const ids = selectedSet.has(field.id) ? selectedIds : [field.id]
    if (!selectedSet.has(field.id)) {
      setSelectedIds([field.id])
      setActiveSigner(field.recipientIndex)
    }
    setLabelEditOpen(false)
    setFieldTypeFlyout(false)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setFieldMenu({
      fieldIds: ids,
      anchorFieldId: field.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      x: e.clientX,
      y: e.clientY,
    })
  }

  const onCanvasContextMenu = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-field-id]')) return
    e.preventDefault()
    setFieldMenu(null)
    setLabelEditOpen(false)
    setFieldTypeFlyout(false)
    setCanvasFieldsFlyout(false)
    setCanvasMenu({ x: e.clientX, y: e.clientY, clientX: e.clientX, clientY: e.clientY })
  }

  const setActiveSignerAndMaybeReassign = (idx: number) => {
    setActiveSigner(idx)
    if (selectedIds.length) {
      patchSelectedFields({ recipientIndex: idx })
    }
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
      handle && nextSelected.length === 1
        ? [field.id]
        : nextSelected.includes(field.id)
          ? nextSelected
          : [field.id]

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

    onFieldsChange(
      fields.map((f) => {
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

  const menuButtonStyle = (danger = false): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    width: '100%',
    color: danger ? 'var(--mantine-color-red-6)' : undefined,
  })

  const fieldMenuFields = fieldMenu
    ? fields.filter((f) => fieldMenu.fieldIds.includes(f.id))
    : []
  const fieldMenuSingle = fieldMenuFields.length === 1 ? fieldMenuFields[0] : null

  return (
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
              outline: dragOverPage ? `2px solid ${activeSignerColor}` : undefined,
              outlineOffset: -2,
            }}
            onPointerDown={onWrapPointerDown}
            onPointerMove={onWrapPointerMove}
            onPointerUp={onWrapPointerUp}
            onContextMenu={onCanvasContextMenu}
            onDragOver={onPageDragOver}
            onDragLeave={onPageDragLeave}
            onDrop={onPageDrop}
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
              const signer = roles[field.recipientIndex]
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
                    {signer ? roleInitials(signer, field.recipientIndex) : field.recipientIndex + 1}
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
        style={{
          flexShrink: 0,
          position: 'sticky',
          top: 16,
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
        }}
      >
        <Stack gap="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={600}>
                {rolesTitle}
              </Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={addRole}
                disabled={roles.length >= 10}
              >
                {addRoleLabel}
              </Button>
            </Group>

            <Stack gap="sm">
              {roles.map((s, idx) => {
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
                          {roleInitials(s, idx)}
                        </div>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {roleLabel(s, idx)}
                        </Text>
                      </Group>
                      {roles.length > 1 && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label={`Remove ${roleLabel(s, idx)}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeRole(idx)
                          }}
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                    {editableContacts ? (
                      <Stack gap={6} onClick={(e) => e.stopPropagation()}>
                        <TextInput
                          size="xs"
                          placeholder="Name"
                          value={s.name}
                          onChange={(e) => {
                            const next = [...roles]
                            next[idx] = { ...next[idx], name: e.currentTarget.value }
                            onRolesChange(next)
                          }}
                        />
                        <TextInput
                          size="xs"
                          placeholder="Email"
                          value={s.email}
                          onChange={(e) => {
                            const next = [...roles]
                            next[idx] = { ...next[idx], email: e.currentTarget.value }
                            onRolesChange(next)
                          }}
                        />
                      </Stack>
                    ) : (
                      <TextInput
                        size="xs"
                        placeholder="Role label"
                        value={s.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const next = [...roles]
                          next[idx] = { ...next[idx], name: e.currentTarget.value }
                          onRolesChange(next)
                        }}
                      />
                    )}
                  </Card>
                )
              })}
            </Stack>
          </Stack>

          <Divider />

          <Stack gap="sm">
            <div>
              <Text size="sm" fw={600}>
                Field tools
              </Text>
              <Text size="xs" c="dimmed">
                Drag onto the PDF · right-click for Fields menu
              </Text>
            </div>

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
                {roles.map((s, idx) => {
                  const color = SIGNER_COLORS[idx % SIGNER_COLORS.length]
                  const isActive = idx === activeSigner
                  return (
                    <Tooltip key={idx} label={roleLabel(s, idx)}>
                      <UnstyledButton
                        onClick={() => setActiveSignerAndMaybeReassign(idx)}
                        aria-label={`Active signer ${roleLabel(s, idx)}`}
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
                          roleInitials(s, idx)
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
                  <UnstyledButton
                    key={tool.type}
                    draggable
                    onDragStart={(e) => onToolDragStart(e, tool.type)}
                    onClick={() => setActiveTool(tool.type)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: selected
                        ? `1px solid ${activeSignerColor}`
                        : `1px solid ${activeSignerColor}40`,
                      background: selected ? activeSignerColor : `${activeSignerColor}12`,
                      color: selected ? '#fff' : activeSignerColor,
                      cursor: 'grab',
                      fontSize: 13,
                      fontWeight: 600,
                      width: '100%',
                    }}
                  >
                    <IconGripVertical size={14} style={{ opacity: selected ? 0.7 : 0.45, flexShrink: 0 }} />
                    <tool.icon size={16} style={{ flexShrink: 0 }} />
                    {tool.label}
                  </UnstyledButton>
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
                  checked={selectedIds.every((id) => fields.find((f) => f.id === id)?.required)}
                  onChange={(e) => patchSelectedFields({ required: e.currentTarget.checked })}
                />
              </Stack>
            )}

            {sidebarActions && (
              <>
                <Divider />
                {sidebarActions}
              </>
            )}
          </Stack>

          {sidebarExtra}
        </Stack>
      </Card>

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
            minWidth: 200,
            maxHeight: '80vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Stack gap={2}>
            <div style={{ position: 'relative' }}>
              <UnstyledButton
                onMouseEnter={() => setFieldTypeFlyout(true)}
                onFocus={() => setFieldTypeFlyout(true)}
                onClick={() => setFieldTypeFlyout((o) => !o)}
                style={{
                  ...menuButtonStyle(),
                  justifyContent: 'space-between',
                  background: fieldTypeFlyout ? 'var(--mantine-color-gray-0)' : undefined,
                }}
              >
                <Group gap={8} wrap="nowrap">
                  <IconForms size={14} />
                  Change type
                </Group>
                <IconChevronRight size={14} style={{ opacity: 0.55 }} />
              </UnstyledButton>
              {fieldTypeFlyout && (
                <Paper
                  withBorder
                  shadow="md"
                  radius="md"
                  p={4}
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: 0,
                    marginLeft: 4,
                    minWidth: 160,
                    zIndex: 1001,
                  }}
                  onMouseEnter={() => setFieldTypeFlyout(true)}
                >
                  <Stack gap={2}>
                    {FIELD_TOOLS.map((tool) => (
                      <UnstyledButton
                        key={tool.type}
                        onClick={() => {
                          patchSelectedFields(
                            { field_type: tool.type, label: tool.label },
                            fieldMenu.fieldIds,
                          )
                          setFieldMenu(null)
                          setFieldTypeFlyout(false)
                        }}
                        style={menuButtonStyle()}
                      >
                        <tool.icon size={14} />
                        {tool.label}
                      </UnstyledButton>
                    ))}
                  </Stack>
                </Paper>
              )}
            </div>
            <Divider my={4} />
            <Text size="xs" c="dimmed" px={10} tt="uppercase" fw={600}>
              Assign to
            </Text>
            {roles.map((s, idx) => (
              <UnstyledButton
                key={idx}
                onClick={() => {
                  patchSelectedFields({ recipientIndex: idx }, fieldMenu.fieldIds)
                  setActiveSigner(idx)
                  setFieldMenu(null)
                }}
                style={menuButtonStyle()}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: SIGNER_COLORS[idx % SIGNER_COLORS.length],
                    flexShrink: 0,
                  }}
                />
                {roleLabel(s, idx)}
              </UnstyledButton>
            ))}
            <Divider my={4} />
            {fieldMenuSingle && (
              <>
                {labelEditOpen ? (
                  <Stack gap={6} px={10} py={6}>
                    <TextInput
                      size="xs"
                      label="Label"
                      value={labelDraft}
                      autoFocus
                      onChange={(e) => setLabelDraft(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          patchSelectedFields({ label: labelDraft }, fieldMenu.fieldIds)
                          setFieldMenu(null)
                        }
                      }}
                    />
                    <Button
                      size="xs"
                      onClick={() => {
                        patchSelectedFields({ label: labelDraft }, fieldMenu.fieldIds)
                        setFieldMenu(null)
                      }}
                    >
                      Save label
                    </Button>
                  </Stack>
                ) : (
                  <UnstyledButton
                    onClick={() => {
                      setLabelDraft(fieldMenuSingle.label)
                      setLabelEditOpen(true)
                    }}
                    style={menuButtonStyle()}
                  >
                    Edit label…
                  </UnstyledButton>
                )}
              </>
            )}
            <UnstyledButton
              onClick={() => {
                const allRequired = fieldMenu.fieldIds.every(
                  (id) => fields.find((f) => f.id === id)?.required,
                )
                patchSelectedFields({ required: !allRequired }, fieldMenu.fieldIds)
                setFieldMenu(null)
              }}
              style={menuButtonStyle()}
            >
              {fieldMenu.fieldIds.every((id) => fields.find((f) => f.id === id)?.required)
                ? 'Mark optional'
                : 'Mark required'}
            </UnstyledButton>
            <UnstyledButton
              onClick={() => {
                const idSet = new Set(fieldMenu.fieldIds)
                onFieldsChange(
                  fields.map((f) => {
                    if (!idSet.has(f.id)) return f
                    const size = DEFAULT_FIELD_SIZE[f.field_type]
                    return { ...f, w: size.w, h: size.h, label: f.label || size.label }
                  }),
                )
                setFieldMenu(null)
              }}
              style={menuButtonStyle()}
            >
              Reset to default size
            </UnstyledButton>
            <Divider my={4} />
            <UnstyledButton
              onClick={() => duplicateFields(fieldMenu.fieldIds)}
              style={menuButtonStyle()}
            >
              <IconCopy size={14} />
              Duplicate
              {fieldMenu.fieldIds.length > 1 ? ` ${fieldMenu.fieldIds.length} fields` : ''}
            </UnstyledButton>
            <UnstyledButton
              onClick={() => deleteFields(fieldMenu.fieldIds)}
              style={menuButtonStyle(true)}
            >
              <IconTrash size={14} />
              Delete
              {fieldMenu.fieldIds.length > 1 ? ` ${fieldMenu.fieldIds.length} fields` : ''}
            </UnstyledButton>
          </Stack>
        </Paper>
      )}

      {canvasMenu && (
        <Paper
          withBorder
          shadow="md"
          radius="md"
          p={4}
          style={{
            position: 'fixed',
            left: canvasMenu.x,
            top: canvasMenu.y,
            zIndex: 1000,
            minWidth: 180,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Stack gap={2}>
            <div style={{ position: 'relative' }}>
              <UnstyledButton
                onMouseEnter={() => setCanvasFieldsFlyout(true)}
                onFocus={() => setCanvasFieldsFlyout(true)}
                onClick={() => setCanvasFieldsFlyout((o) => !o)}
                style={{
                  ...menuButtonStyle(),
                  justifyContent: 'space-between',
                  background: canvasFieldsFlyout ? 'var(--mantine-color-gray-0)' : undefined,
                }}
              >
                <Group gap={8} wrap="nowrap">
                  <IconForms size={14} />
                  Fields
                </Group>
                <IconChevronRight size={14} style={{ opacity: 0.55 }} />
              </UnstyledButton>
              {canvasFieldsFlyout && (
                <Paper
                  withBorder
                  shadow="md"
                  radius="md"
                  p={4}
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: 0,
                    marginLeft: 4,
                    minWidth: 160,
                    zIndex: 1001,
                  }}
                  onMouseEnter={() => setCanvasFieldsFlyout(true)}
                >
                  <Stack gap={2}>
                    {FIELD_TOOLS.map((tool) => (
                      <UnstyledButton
                        key={tool.type}
                        onClick={() =>
                          placeField(canvasMenu.clientX, canvasMenu.clientY, {
                            field_type: tool.type,
                          })
                        }
                        style={menuButtonStyle()}
                      >
                        <tool.icon size={14} />
                        {tool.label}
                      </UnstyledButton>
                    ))}
                  </Stack>
                </Paper>
              )}
            </div>
            <Divider my={4} />
            <Text size="xs" c="dimmed" px={10} tt="uppercase" fw={600}>
              Add for signer
            </Text>
            {roles.map((s, idx) => (
              <UnstyledButton
                key={idx}
                onClick={() =>
                  placeField(canvasMenu.clientX, canvasMenu.clientY, {
                    recipientIndex: idx,
                    field_type: activeTool,
                  })
                }
                style={menuButtonStyle()}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: SIGNER_COLORS[idx % SIGNER_COLORS.length],
                    flexShrink: 0,
                  }}
                />
                {roleLabel(s, idx)} ({DEFAULT_FIELD_SIZE[activeTool].label})
              </UnstyledButton>
            ))}
          </Stack>
        </Paper>
      )}
    </Group>
  )
}
