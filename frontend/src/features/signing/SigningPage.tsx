import {
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { api } from '../../shared/api'

function todayIsoDate() {
  return dayjs().format('YYYY-MM-DD')
}

export function SigningPage() {
  const { token } = useParams()
  const qc = useQueryClient()
  const [consented, setConsented] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [typedName, setTypedName] = useState('')
  const [textValue, setTextValue] = useState('')
  const [dateValue, setDateValue] = useState(todayIsoDate())
  const sigRef = useRef<SignatureCanvas | null>(null)

  const { data, error, isLoading } = useQuery({
    queryKey: ['sign', token],
    queryFn: () => api<any>(`/api/sign/${token}/`),
    refetchInterval: (query) => {
      const session = query.state.data
      const waitingForPdf =
        session?.recipient?.status === 'signed' && !session?.downloads_ready
      return waitingForPdf ? 1500 : false
    },
  })

  const consent = useMutation({
    mutationFn: () => api(`/api/sign/${token}/consent/`, { method: 'POST', json: {} }),
    onSuccess: () => setConsented(true),
  })

  const completeField = useMutation({
    mutationFn: async ({ fieldId, value, image_data }: any) =>
      api(`/api/sign/${token}/fields/${fieldId}/`, {
        method: 'POST',
        json: { value, image_data },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  })

  const submit = useMutation({
    mutationFn: () => api(`/api/sign/${token}/submit/`, { method: 'POST', json: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  })

  const decline = useMutation({
    mutationFn: () =>
      api(`/api/sign/${token}/decline/`, {
        method: 'POST',
        json: { reason: 'Declined by recipient' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  })

  const fields = data?.fields || []
  const required = fields.filter((f: any) => f.required)
  const completedCount = required.filter((f: any) => f.completed_at).length
  const progress = required.length ? (completedCount / required.length) * 100 : 100
  const current = fields[activeIdx]

  const accent = data?.envelope?.accent_color || '#0B6E4F'

  const done = useMemo(
    () => data?.recipient?.status === 'signed' || data?.envelope?.status === 'completed',
    [data],
  )

  useEffect(() => {
    if (!current) return
    setTypedName('')
    setTextValue(current.value || '')
    if (current.field_type === 'date') {
      setDateValue(current.value || todayIsoDate())
    }
    sigRef.current?.clear()
  }, [current?.id])

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

  const goNext = () => setActiveIdx((i) => Math.min(i + 1, fields.length - 1))

  return (
    <div className="signer-shell">
      <Container size={720} py={40}>
        <Stack>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">
                {data.envelope.tenant_name}
              </Text>
              <Title order={2}>{data.envelope.title}</Title>
            </div>
            <Button variant="subtle" color="red" onClick={() => decline.mutate()}>
              Decline
            </Button>
          </Group>
          <Progress value={progress} color="forest" />
          <Text size="sm">
            {completedCount} of {required.length} required fields
          </Text>

          {data.document?.file_url && (
            <Card withBorder radius="lg" p="md">
              <Text size="sm" mb="xs">
                Document preview
              </Text>
              <iframe
                title="document"
                src={data.document.file_url}
                style={{
                  width: '100%',
                  height: '80vh',
                  minHeight: 640,
                  border: 'none',
                  borderRadius: 12,
                }}
              />
            </Card>
          )}

          {current && (
            <Card withBorder radius="lg" p="lg">
              <Title order={4} mb="sm">
                {current.label || current.field_type} (page {current.page})
              </Title>
              {['signature', 'initials'].includes(current.field_type) ? (
                <Stack>
                  <div
                    style={{
                      border: '1px dashed rgba(16,42,35,0.25)',
                      borderRadius: 12,
                      background: '#fff',
                    }}
                  >
                    <SignatureCanvas
                      ref={sigRef as any}
                      canvasProps={{ width: 640, height: 180, style: { width: '100%' } }}
                    />
                  </div>
                  <TextInput
                    label="Or type your name"
                    value={typedName}
                    onChange={(e) => setTypedName(e.currentTarget.value)}
                  />
                  <Group>
                    <Button variant="default" onClick={() => sigRef.current?.clear()}>
                      Clear
                    </Button>
                    <Button
                      style={{ background: accent }}
                      loading={completeField.isPending}
                      onClick={async () => {
                        const image_data = sigRef.current?.isEmpty()
                          ? undefined
                          : sigRef.current?.toDataURL('image/png')
                        await completeField.mutateAsync({
                          fieldId: current.id,
                          value: typedName || data.recipient.name,
                          image_data,
                        })
                        goNext()
                      }}
                    >
                      Apply & next
                    </Button>
                  </Group>
                </Stack>
              ) : current.field_type === 'checkbox' ? (
                <Checkbox
                  label={current.label || 'I agree'}
                  checked={current.value === 'true' || textValue === 'true'}
                  onChange={async (e) => {
                    const checked = e.currentTarget.checked
                    setTextValue(checked ? 'true' : 'false')
                    await completeField.mutateAsync({
                      fieldId: current.id,
                      value: checked ? 'true' : 'false',
                    })
                    if (checked) goNext()
                  }}
                />
              ) : current.field_type === 'date' ? (
                <Stack>
                  <TextInput
                    type="date"
                    label={current.label || 'Date'}
                    value={dateValue}
                    onChange={(e) => setDateValue(e.currentTarget.value)}
                  />
                  <Text size="xs" c="dimmed">
                    Defaults to today — change if needed.
                  </Text>
                  <Button
                    style={{ background: accent }}
                    loading={completeField.isPending}
                    onClick={async () => {
                      await completeField.mutateAsync({
                        fieldId: current.id,
                        value: dateValue || todayIsoDate(),
                      })
                      goNext()
                    }}
                  >
                    Apply & next
                  </Button>
                </Stack>
              ) : (
                <Stack>
                  <TextInput
                    label={current.label || 'Value'}
                    value={textValue}
                    onChange={(e) => setTextValue(e.currentTarget.value)}
                  />
                  <Button
                    style={{ background: accent }}
                    loading={completeField.isPending}
                    onClick={async () => {
                      await completeField.mutateAsync({
                        fieldId: current.id,
                        value: textValue,
                      })
                      goNext()
                    }}
                  >
                    Apply & next
                  </Button>
                </Stack>
              )}
            </Card>
          )}

          <Button
            size="lg"
            style={{ background: accent }}
            disabled={progress < 100}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Finish signing
          </Button>
        </Stack>
      </Container>
    </div>
  )
}
