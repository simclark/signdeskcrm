import {
  IconAlertCircle,
  IconBan,
  IconClockOff,
  IconHandStop,
  IconLinkOff,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import { ApiError } from '../../shared/api'

export type SigningUnavailableContent = {
  title: string
  message: string
  hint: string
  Icon: TablerIcon
}

const UNAVAILABLE_BY_REASON: Record<string, SigningUnavailableContent> = {
  voided: {
    title: 'Document canceled',
    message: 'The sender voided this document, so it can no longer be signed.',
    hint: 'Contact the sender if you think you received this link in error.',
    Icon: IconBan,
  },
  expired: {
    title: 'Link expired',
    message: 'This signing request is past its expiration date and is no longer available.',
    hint: 'Ask the sender to send a new envelope if you still need to sign.',
    Icon: IconClockOff,
  },
  declined: {
    title: 'Signing declined',
    message: 'Someone declined to sign this document, so it can no longer be completed.',
    hint: 'Contact the sender if you need a new signing request.',
    Icon: IconHandStop,
  },
}

function reasonFromDetail(detail: string): string | null {
  const normalized = detail.toLowerCase()
  if (normalized.includes('voided')) return 'voided'
  if (normalized.includes('expired')) return 'expired'
  if (normalized.includes('declined')) return 'declined'
  return null
}

export function getSigningUnavailableContent(error: unknown): SigningUnavailableContent {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return {
        title: 'Link not found',
        message: 'This signing link is invalid or has been removed.',
        hint: 'Double-check the link in your email, or contact the sender for a new one.',
        Icon: IconLinkOff,
      }
    }

    if (error.status === 410) {
      const detail =
        typeof error.data === 'object' &&
        error.data !== null &&
        'detail' in error.data &&
        typeof (error.data as { detail: unknown }).detail === 'string'
          ? (error.data as { detail: string }).detail
          : error.message

      const reason = reasonFromDetail(detail)
      if (reason && UNAVAILABLE_BY_REASON[reason]) {
        return UNAVAILABLE_BY_REASON[reason]
      }

      return {
        title: 'Document unavailable',
        message: detail || 'This signing link is no longer active.',
        hint: 'Contact the sender if you need help.',
        Icon: IconAlertCircle,
      }
    }
  }

  return {
    title: 'Something went wrong',
    message: 'We could not load this signing session. Please try again in a moment.',
    hint: 'If the problem continues, contact the sender.',
    Icon: IconAlertCircle,
  }
}

export function isSigningSessionTerminalError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 410)
}
