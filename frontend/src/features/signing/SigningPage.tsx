import {
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../shared/api'
import { fieldTypeLabel, sortFieldsForSigning, type SignField } from './fieldOverlay'
import { SignatureAdoptDialog, type AdoptedAssets } from './SignatureAdoptDialog'
import { SigningDocumentViewer } from './SigningDocumentViewer'

function todayIsoDate() {
  return dayjs().format('YYYY-MM-DD')
}

function signApi<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  return api<T>(path, { ...options, public: true })
}

export function SigningPage() {
  const { token } = useParams()
  const qc = useQueryClient()
  const fieldRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [consented, setConsented] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [adopted, setAdopted] = useState<AdoptedAssets | null>(null)
  const [adoptDialogOpen, setAdoptDialogOpen] = useState(false)
  const [pendingFieldId, setPendingFieldId] = useState<number | null>(null)
  const [fieldPreviews, setFieldPreviews] = useState<Record<number, string>>({})
  const [textDrafts, setTextDrafts] = useState<Record<number, string>>({})

  const { data, error, isLoading } = useQuery({
    queryKey: ['sign', token],
    queryFn: () => signApi<any>(`/api/sign/${token}/`),
    refetchInterval: (query) => {
      const session = query.state.data
      const waitingForPdf =
        session?.recipient?.status === 'signed' && !session?.downloads_ready
      return waitingForPdf ? 1500 : false
    },
  })

  const consent = useMutation({
    mutationFn: () => signApi(`/api/sign/${token}/consent/`, { method: 'POST', json: {} }),
    onSuccess: () => {
      setConsented(true)
      setActiveIdx(0)
    },
  })

  const completeField = useMutation({
    mutationFn: async ({
      fieldId,
      value,
      image_data,
    }: {
      fieldId: number
      value: string
      image_data?: string
    }) =>
      signApi(`/api/sign/${token}/fields/${fieldId}/`, {
        method: 'POST',
        json: { value, image_data },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  })

  const submit = useMutation({
    mutationFn: () => signApi(`/api/sign/${token}/submit/`, { method: 'POST', json: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  })

  const decline = useMutation({
    mutationFn: () =>
      signApi(`/api/sign/${token}/decline/`, {
        method: 'POST',
        json: { reason: 'Declined by recipient' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  })

  const fields: SignField[] = useMemo(() => {
    const list = data?.fields || []
    return sortFieldsForSigning(list)
  }, [data?.fields])

  const required = fields.filter((f) => f.required)

  const isFieldSatisfied = useCallback(
    (field: SignField) => {
      if (field.completed_at) return true
      if (field.field_type === 'text') {
        return Boolean((textDrafts[field.id] ?? '').trim())
      }
      return false
    },
    [textDrafts],
  )

  const satisfiedCount = required.filter(isFieldSatisfied).length
  const progress = required.length ? (satisfiedCount / required.length) * 100 : 100
  const readyToFinish = required.length > 0 && required.every(isFieldSatisfied)
  const accent = data?.envelope?.accent_color || '#0B6E4F'
  const currentField = fields[activeIdx] ?? null
  const activeFieldId = currentField?.id ?? null
  const isLastField = activeIdx >= fields.length - 1
  const currentComplete = Boolean(currentField?.completed_at)

  const done = useMemo(
    () => data?.recipient?.status === 'signed' || data?.envelope?.status === 'completed',
    [data],
  )

  useEffect(() => {
    if (!currentField?.id) return
    const el = fieldRefs.current[currentField.id]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentField?.id, activeIdx])

  const stampField = useCallback(
    async (field: SignField, assets: AdoptedAssets) => {
      const image_data =
        field.field_type === 'signature' ? assets.signaturePng : assets.initialsPng
      await completeField.mutateAsync({
        fieldId: field.id,
        value: assets.displayName,
        image_data,
      })
      setFieldPreviews((prev) => ({ ...prev, [field.id]: image_data }))
    },
    [completeField],
  )

  const handleAdopt = useCallback(
    async (assets: AdoptedAssets) => {
      setAdopted(assets)
      setAdoptDialogOpen(false)

      if (pendingFieldId != null) {
        const field = fields.find((f) => f.id === pendingFieldId)
        if (field && ['signature', 'initials'].includes(field.field_type)) {
          await stampField(field, assets)
        }
        setPendingFieldId(null)
      }
    },
    [fields, pendingFieldId, stampField],
  )

  const completeDateField = useCallback(
    async (field: SignField) => {
      if (field.completed_at) return
      const today = todayIsoDate()
      await completeField.mutateAsync({
        fieldId: field.id,
        value: today,
      })
    },
    [completeField],
  )

  const focusField = useCallback(
    (field: SignField) => {
      const idx = fields.findIndex((f) => f.id === field.id)
      if (idx >= 0) setActiveIdx(idx)
    },
    [fields],
  )

  const flushPendingTextFields = useCallback(async () => {
    for (const field of fields) {
      if (field.field_type !== 'text' || field.completed_at) continue
      const value = (textDrafts[field.id] ?? '').trim()
      if (!value) continue
      await completeField.mutateAsync({ fieldId: field.id, value })
    }
  }, [completeField, fields, textDrafts])

  const handleFinish = useCallback(async () => {
    await flushPendingTextFields()
    await submit.mutateAsync()
  }, [flushPendingTextFields, submit])

  const handleFieldClick = useCallback(
    async (field: SignField) => {
      focusField(field)

      if (field.field_type === 'text') return

      if (['signature', 'initials'].includes(field.field_type)) {
        if (!adopted) {
          setPendingFieldId(field.id)
          setAdoptDialogOpen(true)
          return
        }
        if (!field.completed_at) {
          await stampField(field, adopted)
        }
        return
      }

      if (field.field_type === 'checkbox') {
        const next = field.value === 'true' ? 'false' : 'true'
        await completeField.mutateAsync({
          fieldId: field.id,
          value: next,
        })
        return
      }

      if (field.field_type === 'date' && !field.completed_at) {
        await completeDateField(field)
      }
    },
    [adopted, completeDateField, completeField, focusField, stampField],
  )

  const handleNext = useCallback(() => {
    if (!isLastField) setActiveIdx((i) => i + 1)
  }, [isLastField])

  if (isLoading) return null
  if (error) {
    return (
      <Container py={80}>
        <Title order={2}>Link unavailable</Title>
        <Text c="dimmed">This signing link is invalid or no longer active.</Text>
      </Container>
    )
  }

  if (done) {
    const isCc = data.recipient.role === 'cc'
    return (
      <div className="signer-shell">
        <Container size={640} py={80}>
          <Card withBorder radius="lg" p="xl">
            <Title order={2}>{isCc ? 'Document complete' : "You're all set"}</Title>
            <Text mt="sm">
              {isCc ? (
                <>
                  <strong>{data.envelope.title}</strong> has been signed by all parties.
                </>
              ) : (
                <>
                  Thanks, {data.recipient.name}. Your signature on{' '}
                  <strong>{data.envelope.title}</strong> has been recorded.
                </>
              )}
            </Text>
            {data.downloads_ready ? (
              <Stack mt="xl" gap="sm">
                <Text size="sm" c="dimmed">
                  Download your copy — no account needed.
                </Text>
                <Group>
                  <Button
                    component="a"
                    href={data.signed_download_url}
                    style={{ background: accent }}
                  >
                    Download signed PDF
                  </Button>
                  {data.certificate_download_url && (
                    <Button component="a" href={data.certificate_download_url} variant="default">
                      Download certificate
                    </Button>
                  )}
                </Group>
              </Stack>
            ) : (
              <Text mt="xl" size="sm" c="dimmed">
                Preparing your signed document…
              </Text>
            )}
          </Card>
        </Container>
      </div>
    )
  }

  if (!consented) {
    return (
      <div className="signer-shell">
        <Container size={640} py={80}>
          <Card withBorder radius="lg" p="xl">
            <Text size="sm" c="dimmed" mb={4}>
              {data.envelope.tenant_name}
            </Text>
            <Title order={2}>{data.envelope.title}</Title>
            <Text mt="md" mb="lg">
              {data.consent_text}
            </Text>
            <Checkbox
              label="I agree to use electronic records and signatures"
              checked={consented}
              onChange={() => undefined}
              mb="md"
              styles={{ label: { cursor: 'pointer' } }}
              onClick={() => consent.mutate()}
            />
            <Button
              fullWidth
              style={{ background: accent }}
              loading={consent.isPending}
              onClick={() => consent.mutate()}
            >
              Continue to document
            </Button>
          </Card>
        </Container>
      </div>
    )
  }

  const fieldStepLabel = currentField
    ? `Field ${activeIdx + 1} of ${fields.length}: ${fieldTypeLabel(currentField)}`
    : ''

  return (
    <div className="signer-shell">
      <div className="signing-header">
        <Container size={960} py="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" c="dimmed">
                {data.envelope.tenant_name}
              </Text>
              <Title order={3}>{data.envelope.title}</Title>
              <Progress value={progress} color="forest" mt="sm" size="sm" />
              <Text size="sm" mt={4}>
                {satisfiedCount} of {required.length} required fields
              </Text>
              {currentField && (
                <Text size="sm" mt={4} fw={500}>
                  {fieldStepLabel}
                  {currentField.field_type === 'date' && !currentComplete && (
                    <Text span c="dimmed" fw={400}>
                      {' '}
                      — click the date field to apply today&apos;s date
                    </Text>
                  )}
                </Text>
              )}
            </div>
            <Group gap="xs" wrap="nowrap">
              {adopted && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setPendingFieldId(null)
                    setAdoptDialogOpen(true)
                  }}
                >
                  Change signature
                </Button>
              )}
              <Button variant="subtle" color="red" size="sm" onClick={() => decline.mutate()}>
                Decline
              </Button>
              {!isLastField && (
                <Button size="sm" variant="default" onClick={handleNext}>
                  Next
                </Button>
              )}
              <Button
                size="sm"
                style={{ background: accent }}
                disabled={!readyToFinish}
                loading={submit.isPending || completeField.isPending}
                onClick={() => void handleFinish()}
              >
                Finish signing
              </Button>
            </Group>
          </Group>
        </Container>
      </div>

      <Container size={960} py="lg" pb={80}>
        {data.document?.file_url ? (
          <SigningDocumentViewer
            fileUrl={data.document.file_url}
            fields={fields}
            accent={accent}
            fieldPreviews={fieldPreviews}
            adopted={adopted}
            activeFieldId={activeFieldId}
            textDrafts={textDrafts}
            onTextChange={(fieldId, value) =>
              setTextDrafts((prev) => ({ ...prev, [fieldId]: value }))
            }
            onFieldClick={(field) => void handleFieldClick(field)}
            fieldRefs={fieldRefs}
          />
        ) : (
          <Text c="dimmed">No document attached.</Text>
        )}
      </Container>

      <SignatureAdoptDialog
        opened={adoptDialogOpen}
        onClose={() => {
          setAdoptDialogOpen(false)
          setPendingFieldId(null)
        }}
        onAdopt={handleAdopt}
        recipientName={data.recipient.name}
        accent={accent}
        loading={completeField.isPending}
      />
    </div>
  )
}
