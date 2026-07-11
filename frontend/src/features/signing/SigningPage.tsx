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
import { useParams } from 'react-router-dom'
import { useMemo, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { api } from '../../shared/api'

export function SigningPage() {
  const { token } = useParams()
  const qc = useQueryClient()
  const [consented, setConsented] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [typedName, setTypedName] = useState('')
  const sigRef = useRef<SignatureCanvas | null>(null)

  const { data, error, isLoading } = useQuery({
    queryKey: ['sign', token],
    queryFn: () => api<any>(`/api/sign/${token}/`),
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
    return (
      <div className="signer-shell">
        <Container size={640} py={80}>
          <Card withBorder radius="lg" p="xl">
            <Title order={2}>You're all set</Title>
            <Text mt="sm">
              Thanks, {data.recipient.name}. Your signature on <strong>{data.envelope.title}</strong>{' '}
              has been recorded.
            </Text>
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
                style={{ width: '100%', height: 420, border: 'none', borderRadius: 12 }}
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
                      onClick={async () => {
                        const image_data = sigRef.current?.isEmpty()
                          ? undefined
                          : sigRef.current?.toDataURL('image/png')
                        await completeField.mutateAsync({
                          fieldId: current.id,
                          value: typedName || data.recipient.name,
                          image_data,
                        })
                        setActiveIdx((i) => Math.min(i + 1, fields.length - 1))
                      }}
                    >
                      Apply & next
                    </Button>
                  </Group>
                </Stack>
              ) : current.field_type === 'checkbox' ? (
                <Checkbox
                  label={current.label || 'I agree'}
                  onChange={async (e) => {
                    await completeField.mutateAsync({
                      fieldId: current.id,
                      value: e.currentTarget.checked ? 'true' : 'false',
                    })
                    setActiveIdx((i) => Math.min(i + 1, fields.length - 1))
                  }}
                />
              ) : (
                <TextInput
                  label={current.label || 'Value'}
                  onBlur={async (e) => {
                    await completeField.mutateAsync({
                      fieldId: current.id,
                      value: e.currentTarget.value,
                    })
                  }}
                />
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
