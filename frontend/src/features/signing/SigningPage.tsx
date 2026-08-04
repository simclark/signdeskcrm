import {
  Anchor,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Image,
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
import { setDocumentFavicon } from '../../shared/favicon'
import { toAppMediaUrl } from '../../shared/mediaUrl'
import { fieldTypeLabel, sortFieldsForSigning, type SignField } from './fieldOverlay'
import { SignatureAdoptDialog, type AdoptedAssets } from './SignatureAdoptDialog'
import { SigningDocumentViewer } from './SigningDocumentViewer'

function todayIsoDate() {
  return dayjs().format('YYYY-MM-DD')
}

function BrandMark({
  logoUrl,
  iconUrl,
  tenantName,
  compact = false,
}: {
  logoUrl?: string | null
  iconUrl?: string | null
  tenantName: string
  compact?: boolean
}) {
  const logo = toAppMediaUrl(logoUrl)
  const icon = toAppMediaUrl(iconUrl)
  if (logo) {
    if (compact) {
      return (
        <Image
          src={logo}
          alt={tenantName}
          h={36}
          w="auto"
          maw={200}
          fit="contain"
          style={{ display: 'block' }}
        />
      )
    }
    return (
      <div
        style={{
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid rgba(16, 42, 35, 0.08)',
        }}
      >
        <Image
          src={logo}
          alt={tenantName}
          h={64}
          w="auto"
          maw={340}
          fit="contain"
          style={{ display: 'block' }}
        />
      </div>
    )
  }
  if (icon) {
    return (
      <Group
        gap="sm"
        mb={compact ? 0 : 'md'}
        pb={compact ? 0 : 'md'}
        style={compact ? undefined : { borderBottom: '1px solid rgba(16, 42, 35, 0.08)' }}
      >
        <Image src={icon} alt="" w={compact ? 28 : 40} h={compact ? 28 : 40} radius="md" fit="contain" />
        <Text size="sm" c="dimmed" fw={500}>
          {tenantName}
        </Text>
      </Group>
    )
  }
  return (
    <Text size="sm" c="dimmed" mb={4}>
      {tenantName}
    </Text>
  )
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
  const [consentChecked, setConsentChecked] = useState(false)
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
      qc.invalidateQueries({ queryKey: ['sign', token] })
    },
  })

  useEffect(() => {
    if (data?.has_consented) {
      setConsented(true)
    }
  }, [data?.has_consented])

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
  const declineEnabled = Boolean(data?.envelope?.signer_decline_enabled)
  const changeSignatureEnabled = Boolean(data?.envelope?.signer_change_signature_enabled)
  const currentField = fields[activeIdx] ?? null
  const activeFieldId = currentField?.id ?? null
  const isLastField = activeIdx >= fields.length - 1
  const currentComplete = Boolean(currentField?.completed_at)
  const signingIconUrl = toAppMediaUrl(data?.envelope?.icon_url)

  useEffect(() => {
    if (!fields.length) return
    setTextDrafts((prev) => {
      const next = { ...prev }
      let changed = false
      for (const field of fields) {
        if (field.field_type !== 'text' && field.field_type !== 'date') continue
        if (next[field.id] !== undefined) continue
        if (field.value) {
          next[field.id] = field.value
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [fields])

  useEffect(() => {
    setDocumentFavicon(signingIconUrl)
    return () => setDocumentFavicon(null)
  }, [signingIconUrl])

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
            <BrandMark
              logoUrl={data.envelope.logo_url}
              iconUrl={data.envelope.icon_url}
              tenantName={data.envelope.tenant_name}
            />
            <Title order={2}>{data.envelope.title}</Title>
            <Text size="sm" c="dimmed" mt="xs" mb="md">
              Electronic records and signatures disclosure
              {data.consent_version ? ` · Version ${data.consent_version}` : ''}
            </Text>
            <Text
              size="sm"
              mb="lg"
              style={{
                whiteSpace: 'pre-wrap',
                maxHeight: 280,
                overflowY: 'auto',
                padding: '12px 14px',
                border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 8,
                background: 'var(--mantine-color-gray-0)',
              }}
            >
              {data.consent_text}
            </Text>
            {(data.envelope.support_email ||
              data.envelope.support_phone ||
              data.envelope.paper_copy_fee_policy ||
              data.envelope.document_retention_days) && (
              <Text size="sm" c="dimmed" mb="md">
                {data.envelope.support_email || data.envelope.support_phone ? (
                  <>
                    Contact the sender
                    {data.envelope.support_email ? (
                      <>
                        {' '}
                        at{' '}
                        <Anchor href={`mailto:${data.envelope.support_email}`}>
                          {data.envelope.support_email}
                        </Anchor>
                      </>
                    ) : null}
                    {data.envelope.support_phone
                      ? `${data.envelope.support_email ? ' or ' : ' at '}${data.envelope.support_phone}`
                      : ''}
                    .
                  </>
                ) : null}
                {data.envelope.paper_copy_fee_policy
                  ? ` ${data.envelope.paper_copy_fee_policy}`
                  : ''}
                {data.envelope.document_retention_days
                  ? ` Completed records remain downloadable for ${data.envelope.document_retention_days} days.`
                  : ''}
              </Text>
            )}
            <Checkbox
              label="I have read this disclosure, can access PDF documents, and agree to use electronic records and signatures"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.currentTarget.checked)}
              mb="md"
              styles={{ label: { cursor: 'pointer' } }}
            />
            <Button
              fullWidth
              style={{ background: accent }}
              loading={consent.isPending}
              disabled={!consentChecked}
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
              <BrandMark
                logoUrl={data.envelope.logo_url}
                iconUrl={data.envelope.icon_url}
                tenantName={data.envelope.tenant_name}
                compact
              />
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
              {adopted && changeSignatureEnabled ? (
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
              ) : null}
              {declineEnabled ? (
                <Button
                  variant="outline"
                  color="red"
                  size="sm"
                  loading={decline.isPending}
                  onClick={() => decline.mutate()}
                >
                  Decline
                </Button>
              ) : null}
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
