import {
  Button,
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create your signature"
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <Text size="sm" c="dimmed" mb="md">
        Draw or type your signature and initials. They will be applied to all signing fields on
        this document.
      </Text>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="draw">Draw</Tabs.Tab>
          <Tabs.Tab value="type">Type</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="draw">
          <Stack gap="md">
            <div>
              <Text size="sm" fw={500} mb={6}>
                Signature
              </Text>
              <div className="signing-pad-wrap">
                <SignatureCanvas
                  ref={signatureRef as any}
                  penColor="#102a23"
                  canvasProps={{ width: 640, height: 160, style: { width: '100%' } }}
                />
              </div>
            </div>
            <div>
              <Text size="sm" fw={500} mb={6}>
                Initials
              </Text>
              <div className="signing-pad-wrap signing-pad-wrap--short">
                <SignatureCanvas
                  ref={initialsRef as any}
                  penColor="#102a23"
                  canvasProps={{ width: 640, height: 100, style: { width: '100%' } }}
                />
              </div>
            </div>
            <Group justify="space-between">
              <Button
                variant="default"
                onClick={() => {
                  signatureRef.current?.clear()
                  initialsRef.current?.clear()
                }}
              >
                Clear
              </Button>
              <Button
                style={{ background: accent }}
                loading={loading || adopting}
                onClick={() => void handleAdoptDraw()}
              >
                Adopt signature
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="type">
          <Stack gap="md">
            <TextInput
              label="Full name"
              value={typedName}
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
              onChange={(e) => setTypedInitials(e.currentTarget.value)}
            />

            <div>
              <Text size="sm" fw={500} mb={8}>
                Choose a style
              </Text>
              <div className="signing-font-grid">
                {SIGNATURE_FONTS.map((font) => (
                  <UnstyledButton
                    key={font.id}
                    className={`signing-font-card${fontId === font.id ? ' signing-font-card--active' : ''}`}
                    onClick={() => setFontId(font.id)}
                  >
                    <Text
                      className="signing-font-preview"
                      style={{ fontFamily: font.family }}
                    >
                      {previewName}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {font.label}
                    </Text>
                  </UnstyledButton>
                ))}
              </div>
            </div>

            <div className="signing-type-preview">
              <Text size="xs" c="dimmed" mb={4}>
                Preview
              </Text>
              <Text className="signing-type-preview__sig" style={{ fontFamily: selectedFamily }}>
                {previewName}
              </Text>
              <Text className="signing-type-preview__init" style={{ fontFamily: selectedFamily }}>
                {previewInitials}
              </Text>
            </div>

            <Group justify="flex-end">
              <Button
                style={{ background: accent }}
                loading={loading || adopting}
                onClick={() => void handleAdoptType()}
              >
                Adopt signature
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}
