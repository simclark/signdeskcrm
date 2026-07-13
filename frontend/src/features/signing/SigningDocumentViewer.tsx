import { Text } from '@mantine/core'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { AdoptedAssets } from './SignatureAdoptDialog'
import { fieldToOverlayStyle, fieldTypeLabel, type SignField } from './fieldOverlay'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

const MAX_DOC_WIDTH = 900

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

function formatDisplayDate(iso: string) {
  const parsed = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parsed) return iso
  return `${parsed[2]}/${parsed[3]}/${parsed[1]}`
}

function inkPreview(
  field: SignField,
  fieldPreviews: Record<number, string>,
  adopted: AdoptedAssets | null,
): string | null {
  if (fieldPreviews[field.id]) return fieldPreviews[field.id]
  if (!field.completed_at || !adopted) return null
  if (field.field_type === 'signature') return adopted.signaturePng
  if (field.field_type === 'initials') return adopted.initialsPng
  return null
}

type PageBlockProps = {
  pdfDoc: pdfjs.PDFDocumentProxy
  pageNum: number
  fields: SignField[]
  accent: string
  fieldPreviews: Record<number, string>
  adopted: AdoptedAssets | null
  activeFieldId: number | null
  textDrafts: Record<number, string>
  onTextChange: (fieldId: number, value: string) => void
  onFieldClick: (field: SignField) => void
  fieldRefs: MutableRefObject<Record<number, HTMLDivElement | null>>
}

function PageBlock({
  pdfDoc,
  pageNum,
  fields,
  accent,
  fieldPreviews,
  adopted,
  activeFieldId,
  textDrafts,
  onTextChange,
  onFieldClick,
  fieldRefs,
}: PageBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(
    null,
  )

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !wrapRef.current) return

    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    ;(async () => {
      try {
        const pdfPage = await pdfDoc.getPage(pageNum)
        if (cancelled || !canvasRef.current || !wrapRef.current) return

        const wrapWidth = Math.min(wrapRef.current.clientWidth || MAX_DOC_WIDTH, MAX_DOC_WIDTH)
        const baseViewport = pdfPage.getViewport({ scale: 1 })
        const scale = wrapWidth / baseViewport.width
        const viewport = pdfPage.getViewport({ scale: scale * 2 })

        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height

        renderTask = pdfPage.render({
          canvas,
          viewport,
          background: 'rgb(255,255,255)',
        })
        await renderTask.promise

        if (cancelled) return
        const displayHeight = wrapWidth * (baseViewport.height / baseViewport.width)
        setDisplaySize({ width: wrapWidth, height: displayHeight })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        if (/cancel/i.test(message)) return
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
  }, [pdfDoc, pageNum])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const sync = () => {
      const width = Math.min(wrap.clientWidth || MAX_DOC_WIDTH, MAX_DOC_WIDTH)
      if (width <= 0) return
      const canvas = canvasRef.current
      if (!canvas || canvas.width <= 0) return
      const aspect = canvas.height / canvas.width
      const height = width * aspect
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

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="signing-page-block">
      <div
        ref={wrapRef}
        className="signing-page-wrap"
        style={{
          height: displaySize?.height ?? 240,
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
        {displaySize &&
          fields.map((field) => {
            const completed = Boolean(field.completed_at)
            const preview = inkPreview(field, fieldPreviews, adopted)
            const isActive = field.id === activeFieldId
            const isChecked = field.value === 'true'
            const displayValue =
              field.field_type === 'date' || field.field_type === 'text'
                ? field.field_type === 'date' && field.value
                  ? formatDisplayDate(field.value)
                  : field.value
                : null

            const overlayClass = [
              'signing-field-overlay',
              completed ? 'signing-field-overlay--done' : '',
              isActive ? 'signing-field-overlay--active' : 'signing-field-overlay--idle',
            ]
              .filter(Boolean)
              .join(' ')

            const overlayStyle = {
              ...fieldToOverlayStyle(field),
              ...(completed
                ? { borderColor: 'rgba(11, 110, 79, 0.55)' }
                : isActive
                  ? { borderColor: accent }
                  : { borderColor: 'rgba(16, 42, 35, 0.28)' }),
            }

            if (field.field_type === 'text' && !completed) {
              if (isActive) {
                return (
                  <div
                    key={field.id}
                    ref={(el) => {
                      fieldRefs.current[field.id] = el
                    }}
                    className={overlayClass}
                    style={overlayStyle}
                  >
                    <input
                      className="signing-field-inline-input"
                      value={textDrafts[field.id] ?? ''}
                      onChange={(e) => onTextChange(field.id, e.target.value)}
                      placeholder={field.label || 'Type here'}
                      autoFocus
                    />
                  </div>
                )
              }

              const draft = textDrafts[field.id]?.trim()
              return (
                <div
                  key={field.id}
                  ref={(el) => {
                    fieldRefs.current[field.id] = el
                  }}
                  role="button"
                  tabIndex={0}
                  className={overlayClass}
                  style={overlayStyle}
                  onClick={() => onFieldClick(field)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onFieldClick(field)
                    }
                  }}
                >
                  {draft ? (
                    <span className="signing-field-value">{draft}</span>
                  ) : (
                    <span className="signing-field-label">{fieldTypeLabel(field)}</span>
                  )}
                </div>
              )
            }

            return (
              <div
                key={field.id}
                ref={(el) => {
                  fieldRefs.current[field.id] = el
                }}
                role="button"
                tabIndex={0}
                className={overlayClass}
                style={overlayStyle}
                onClick={() => onFieldClick(field)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onFieldClick(field)
                  }
                }}
              >
                {preview ? (
                  <img src={preview} alt="" className="signing-field-preview-img" />
                ) : completed && field.field_type === 'text' && displayValue ? (
                  <span className="signing-field-value">{displayValue}</span>
                ) : completed && field.field_type === 'checkbox' ? (
                  <span className="signing-field-checkbox-mark">{isChecked ? '✓' : ''}</span>
                ) : completed && displayValue ? (
                  <span className="signing-field-value">{displayValue}</span>
                ) : field.field_type === 'checkbox' ? (
                  <span className="signing-field-checkbox-mark">{isChecked ? '✓' : ''}</span>
                ) : (
                  <span className="signing-field-label">{fieldTypeLabel(field)}</span>
                )}
              </div>
            )
          })}
      </div>
      <Text size="xs" c="dimmed" ta="center" mt={6} mb={4}>
        Page {pageNum}
      </Text>
    </div>
  )
}

type ViewerProps = {
  fileUrl: string
  fields: SignField[]
  accent: string
  fieldPreviews: Record<number, string>
  adopted: AdoptedAssets | null
  activeFieldId: number | null
  textDrafts: Record<number, string>
  onTextChange: (fieldId: number, value: string) => void
  onFieldClick: (field: SignField) => void
  fieldRefs: MutableRefObject<Record<number, HTMLDivElement | null>>
}

export function SigningDocumentViewer({
  fileUrl,
  fields,
  accent,
  fieldPreviews,
  adopted,
  activeFieldId,
  textDrafts,
  onTextChange,
  onFieldClick,
  fieldRefs,
}: ViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [loadError, setLoadError] = useState(false)

  const resolvedUrl = useMemo(() => toAppMediaUrl(fileUrl), [fileUrl])

  useEffect(() => {
    if (!resolvedUrl) return
    let cancelled = false
    setLoadError(false)
    setPdfDoc(null)
    ;(async () => {
      try {
        const doc = await pdfjs.getDocument({ url: resolvedUrl }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setPageCount(doc.numPages)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolvedUrl])

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, SignField[]>()
    for (const field of fields) {
      const list = map.get(field.page) ?? []
      list.push(field)
      map.set(field.page, list)
    }
    return map
  }, [fields])

  if (loadError) {
    return <div className="signing-doc-error">Could not load document preview.</div>
  }

  if (!pdfDoc) {
    return <div className="signing-doc-loading">Loading document…</div>
  }

  return (
    <div className="signing-doc-stack">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
        <PageBlock
          key={pageNum}
          pdfDoc={pdfDoc}
          pageNum={pageNum}
          fields={fieldsByPage.get(pageNum) ?? []}
          accent={accent}
          fieldPreviews={fieldPreviews}
          adopted={adopted}
          activeFieldId={activeFieldId}
          textDrafts={textDrafts}
          onTextChange={onTextChange}
          onFieldClick={onFieldClick}
          fieldRefs={fieldRefs}
        />
      ))}
    </div>
  )
}
