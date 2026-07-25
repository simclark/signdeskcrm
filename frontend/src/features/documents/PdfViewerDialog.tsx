import { Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { downloadMediaFile, loadPdfDocument } from '../../shared/loadPdf'
import { pdfjs } from '../../shared/pdfjs'

const MAX_PAGE_WIDTH = 820

type PageProps = {
  pdfDoc: pdfjs.PDFDocumentProxy
  pageNum: number
}

function PdfPage({ pdfDoc, pageNum }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !wrapRef.current) return

    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    ;(async () => {
      try {
        const pdfPage = await pdfDoc.getPage(pageNum)
        if (cancelled || !canvasRef.current || !wrapRef.current) return

        const wrapWidth = Math.min(wrapRef.current.clientWidth || MAX_PAGE_WIDTH, MAX_PAGE_WIDTH)
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

        setDisplaySize({
          width: wrapWidth,
          height: wrapWidth * (baseViewport.height / baseViewport.width),
        })
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

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          width: '100%',
          maxWidth: MAX_PAGE_WIDTH,
          margin: '0 auto',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          background: '#fff',
          lineHeight: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: displaySize?.width ?? '100%',
            height: displaySize?.height ?? 'auto',
            display: 'block',
          }}
        />
      </div>
      <Text size="xs" c="dimmed" ta="center" mt={6} mb={4}>
        Page {pageNum}
      </Text>
    </div>
  )
}

type Props = {
  opened: boolean
  onClose: () => void
  fileUrl: string | null | undefined
  title?: string
  /** Suggested filename when downloading from the viewer. */
  downloadFileName?: string
}

export function PdfViewerDialog({
  opened,
  onClose,
  fileUrl,
  title = 'Document',
  downloadFileName = 'document.pdf',
}: Props) {
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!opened) {
      setPdfDoc(null)
      setPageCount(0)
      setLoadError(false)
      return
    }

    if (!fileUrl) {
      setLoadError(true)
      return
    }

    let cancelled = false
    setLoadError(false)
    setPdfDoc(null)
    ;(async () => {
      try {
        const doc = await loadPdfDocument(fileUrl)
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
  }, [opened, fileUrl])

  async function handleDownload() {
    if (!fileUrl) return
    setDownloading(true)
    try {
      await downloadMediaFile(
        fileUrl,
        downloadFileName.endsWith('.pdf') ? downloadFileName : `${downloadFileName}.pdf`,
      )
    } catch {
      /* ignore — button stays usable for retry */
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group justify="space-between" wrap="nowrap" gap="md" style={{ width: '100%' }}>
          <Text fw={600} lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
            {title}
          </Text>
          {fileUrl && !loadError && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              loading={downloading}
              onClick={handleDownload}
            >
              Download
            </Button>
          )}
        </Group>
      }
      size="xl"
      centered
      styles={{
        header: { alignItems: 'center' },
        title: { flex: 1, marginRight: 8 },
        body: {
          maxHeight: 'min(80vh, 900px)',
          overflow: 'auto',
          background: 'var(--mantine-color-gray-1)',
          padding: 'var(--mantine-spacing-md)',
        },
      }}
    >
      {loadError ? (
        <Center py="xl">
          <Text c="dimmed">Could not load PDF.</Text>
        </Center>
      ) : !pdfDoc ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <Stack gap="md">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
            <PdfPage key={pageNum} pdfDoc={pdfDoc} pageNum={pageNum} />
          ))}
        </Stack>
      )}
    </Modal>
  )
}
