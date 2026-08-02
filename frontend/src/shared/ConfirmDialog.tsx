import { Button, Group, Modal, Text } from '@mantine/core'
import type { ReactNode } from 'react'

export type ConfirmDialogProps = {
  open: boolean
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      opened={open}
      onClose={onCancel}
      title={title}
      centered
      role="alertdialog"
      aria-describedby="confirm-dialog-message"
    >
      <Text id="confirm-dialog-message" size="sm" mb="lg">
        {message}
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button color={danger ? 'red' : undefined} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  )
}
