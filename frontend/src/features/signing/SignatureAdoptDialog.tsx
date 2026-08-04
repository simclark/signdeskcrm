import {
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { deriveInitials, renderTypedInitials, renderTypedSignature } from './renderTypedSignature'
import {
  ensureSignatureFontsLoaded,
  getSignatureFontFamily,
  SIGNATURE_FONTS,
  type SignatureFontId,
} from './signatureFonts'

export type AdoptedAssets = {
  signaturePng: string
  initialsPng: string
  displayName: string
  method: 'draw' | 'type'
  fontId?: SignatureFontId
}

type Props = {
  opened: boolean
  onClose: () => void
  onAdopt: (assets: AdoptedAssets) => void | Promise<void>
  recipientName: string
  accent: string
  loading?: boolean
}

export function SignatureAdoptDialog({
  opened,
  onClose,
  onAdopt,
  recipientName,
  accent,
  loading = false,
}: Props) {
  const signatureRef = useRef<SignatureCanvas | null>(null)
  const initialsRef = useRef<SignatureCanvas | null>(null)
  const [tab, setTab] = useState<string | null>('draw')
  const [typedName, setTypedName] = useState(recipientName)
  const [typedInitials, setTypedInitials] = useState(() => deriveInitials(recipientName))
  const [fontId, setFontId] = useState<SignatureFontId>('great-vibes')
  const [adopting, setAdopting] = useState(false)

  useEffect(() => {
    if (!opened) return
    setTypedName(recipientName)
    setTypedInitials(deriveInitials(recipientName))
    setTab('draw')
    signatureRef.current?.clear()
    initialsRef.current?.clear()
  }, [opened, recipientName])

  useEffect(() => {
    if (tab === 'type') {
      void ensureSignatureFontsLoaded()
    }
  }, [tab])

  const handleAdoptDraw = async () => {
    const sigEmpty = signatureRef.current?.isEmpty() ?? true
    const initEmpty = initialsRef.current?.isEmpty() ?? true
    if (sigEmpty || initEmpty) return

    setAdopting(true)
    try {
      await onAdopt({
        signaturePng: signatureRef.current!.toDataURL('image/png'),
        initialsPng: initialsRef.current!.toDataURL('image/png'),
        displayName: typedName.trim() || recipientName,
        method: 'draw',
      })
    } finally {
      setAdopting(false)
    }
  }

  const handleAdoptType = async () => {
    const name = typedName.trim() || recipientName
    const initials = typedInitials.trim() || deriveInitials(name)
    if (!name || !initials) return

    setAdopting(true)
    try {
      await ensureSignatureFontsLoaded()
      const family = getSignatureFontFamily(fontId)
      const signaturePng = renderTypedSignature(name, family)
      const initialsPng = renderTypedInitials(initials, family)
      if (!signaturePng || !initialsPng) return

      await onAdopt({
        signaturePng,
        initialsPng,
        displayName: name,
        method: 'type',
        fontId,
      })
    } finally {
      setAdopting(false)
    }
  }

  const selectedFamily = getSignatureFontFamily(fontId)
  const previewName = typedName.trim() || recipientName
  const previewInitials = typedInitials.trim() || deriveInitials(previewName)
  const busy = loading || adopting

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div>
          <Text fw={700} size="lg" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            Adopt your signature
          </Text>
          <Text size="sm" c="dimmed" mt={4} fw={400}>
            Create a signature and initials once — they apply to every field on this document.
          </Text>
        </div>
      }
      size="lg"
      centered
      radius="md"
      padding="lg"
      closeOnClickOutside={false}
      classNames={{ content: 'signing-adopt-modal', header: 'signing-adopt-modal__header' }}
    >
      <Tabs value={tab} onChange={setTab} className="signing-adopt-tabs">
        <Tabs.List grow mb="lg">
          <Tabs.Tab value="draw">Draw</Tabs.Tab>
          <Tabs.Tab value="type">Type</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="draw">
          <Stack gap="lg">
            <div className="signing-pad-block">
              <Group justify="space-between" align="baseline" mb={8}>
                <Text size="sm" fw={600}>
                  Signature
                </Text>
                <Text size="xs" c="dimmed">
                  Sign above the line
                </Text>
              </Group>
              <div className="signing-pad-wrap signing-pad-wrap--signature">
                <SignatureCanvas
                  ref={signatureRef as any}
                  penColor="#102a23"
                  canvasProps={{
                    width: 720,
                    height: 168,
                    className: 'signing-pad-canvas',
                    'aria-label': 'Signature drawing pad',
                  }}
                />
                <div className="signing-pad-baseline" aria-hidden />
              </div>
            </div>

            <div className="signing-pad-block signing-pad-block--initials">
              <Group justify="space-between" align="baseline" mb={8}>
                <Text size="sm" fw={600}>
                  Initials
                </Text>
                <Text size="xs" c="dimmed">
                  Compact mark
                </Text>
              </Group>
              <div className="signing-pad-wrap signing-pad-wrap--initials">
                <SignatureCanvas
                  ref={initialsRef as any}
                  penColor="#102a23"
                  canvasProps={{
                    width: 220,
                    height: 120,
                    className: 'signing-pad-canvas',
                    'aria-label': 'Initials drawing pad',
                  }}
                />
                <div className="signing-pad-baseline" aria-hidden />
              </div>
            </div>

            <Divider />

            <Group justify="space-between">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => {
                  signatureRef.current?.clear()
                  initialsRef.current?.clear()
                }}
                disabled={busy}
              >
                Clear pads
              </Button>
              <Button style={{ background: accent }} loading={busy} onClick={() => void handleAdoptDraw()}>
                Adopt signature
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="type">
          <Stack gap="lg">
            <Group grow align="flex-start" preventGrowOverflow={false} wrap="wrap">
              <TextInput
                label="Full name"
                value={typedName}
                style={{ flex: '1 1 240px' }}
                onChange={(e) => {
                  const next = e.currentTarget.value
                  setTypedName(next)
                  if (!typedInitials || typedInitials === deriveInitials(typedName)) {
                    setTypedInitials(deriveInitials(next))
                  }
                }}
              />
              <TextInput
                label="Initials"
                value={typedInitials}
                style={{ flex: '0 0 120px', maxWidth: 140 }}
                onChange={(e) => setTypedInitials(e.currentTarget.value)}
              />
            </Group>

            <div>
              <Text size="sm" fw={600} mb={8}>
                Style
              </Text>
              <div className="signing-font-grid">
                {SIGNATURE_FONTS.map((font) => (
                  <UnstyledButton
                    key={font.id}
                    className={`signing-font-card${fontId === font.id ? ' signing-font-card--active' : ''}`}
                    onClick={() => setFontId(font.id)}
                  >
                    <Text className="signing-font-preview" style={{ fontFamily: font.family }}>
                      {previewName}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {font.label}
                    </Text>
                  </UnstyledButton>
                ))}
              </div>
            </div>

            <div>
              <Text size="sm" fw={600} mb={8}>
                Preview
              </Text>
              <div className="signing-type-preview">
                <div className="signing-type-preview__sig-box">
                  <Text size="xs" c="dimmed" mb={6}>
                    Signature
                  </Text>
                  <Text className="signing-type-preview__sig" style={{ fontFamily: selectedFamily }}>
                    {previewName}
                  </Text>
                </div>
                <div className="signing-type-preview__init-box">
                  <Text size="xs" c="dimmed" mb={6}>
                    Initials
                  </Text>
                  <Text className="signing-type-preview__init" style={{ fontFamily: selectedFamily }}>
                    {previewInitials}
                  </Text>
                </div>
              </div>
            </div>

            <Divider />

            <Group justify="flex-end">
              <Button style={{ background: accent }} loading={busy} onClick={() => void handleAdoptType()}>
                Adopt signature
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}
