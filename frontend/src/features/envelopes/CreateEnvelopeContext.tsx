import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { CreateEnvelopeDialog } from './CreateEnvelopeDialog'

export type CreateEnvelopePrefill = {
  contact?: number | null
  name?: string
  email?: string
  /** Prefill “Existing document” source when opening from Documents. */
  documentId?: number
  /** Prefill “From template” source when opening from Templates. */
  templateId?: number
  title?: string
}

type CreateEnvelopeContextValue = {
  openCreateEnvelope: (prefill?: CreateEnvelopePrefill) => void
}

const CreateEnvelopeContext = createContext<CreateEnvelopeContextValue | null>(null)

export function CreateEnvelopeProvider({ children }: { children: ReactNode }) {
  const [opened, { open, close }] = useDisclosure(false)
  const [prefill, setPrefill] = useState<CreateEnvelopePrefill | undefined>()

  const openCreateEnvelope = useCallback(
    (next?: CreateEnvelopePrefill) => {
      setPrefill(next)
      open()
    },
    [open],
  )

  const value = useMemo(() => ({ openCreateEnvelope }), [openCreateEnvelope])

  return (
    <CreateEnvelopeContext.Provider value={value}>
      {children}
      <CreateEnvelopeDialog opened={opened} onClose={close} prefill={prefill} />
    </CreateEnvelopeContext.Provider>
  )
}

export function useCreateEnvelope() {
  const ctx = useContext(CreateEnvelopeContext)
  if (!ctx) {
    throw new Error('useCreateEnvelope must be used within CreateEnvelopeProvider')
  }
  return ctx
}
