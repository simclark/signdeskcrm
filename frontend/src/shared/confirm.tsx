import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const ConfirmContext = createContext<((options: ConfirmOptions | string) => Promise<boolean>) | null>(
  null,
)

type ActiveConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveConfirm | null>(null)
  const queueRef = useRef<ActiveConfirm[]>([])

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      const item: ActiveConfirm = { ...opts, resolve }
      setActive((current) => {
        if (current) {
          queueRef.current.push(item)
          return current
        }
        return item
      })
    })
  }, [])

  function close(result: boolean) {
    setActive((current) => {
      if (!current) return current
      current.resolve(result)
      return queueRef.current.shift() ?? null
    })
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={active != null}
        title={active?.title}
        message={active?.message ?? ''}
        confirmLabel={active?.confirmLabel}
        cancelLabel={active?.cancelLabel}
        danger={active?.danger}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return confirm
}
