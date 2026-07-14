import type { EnvelopeDetail, TemplateLayoutItem } from './types'
import { api } from '../../shared/api'

export async function applyTemplateLayout(
  envelopeId: number,
  layout: TemplateLayoutItem[],
  options?: {
    contact?: number | null
    name?: string
    email?: string
    roles?: Array<{ key: string; label: string; order: number }>
    mergeValues?: Record<string, string>
  },
): Promise<EnvelopeDetail> {
  let recipientsPayload: Array<{
    name: string
    email: string
    role: 'signer'
    routing_order: number
    contact: number | null
    role_key: string
  }>

  if (options?.roles?.length) {
    const sorted = [...options.roles].sort((a, b) => a.order - b.order)
    recipientsPayload = sorted.map((r, idx) => {
      const isFirst = idx === 0 && options?.email
      return {
        name: isFirst ? options!.name || r.label : r.label,
        email: isFirst
          ? options!.email!
          : `signer-${idx + 1}-${envelopeId}@draft.local`,
        role: 'signer' as const,
        routing_order: idx + 1,
        contact: isFirst ? options?.contact || null : null,
        role_key: r.key,
      }
    })
  } else {
    const maxIndex = layout.reduce((max, item) => Math.max(max, item.recipient_index ?? 0), 0)
    const signerCount = Math.max(1, maxIndex + 1)
    recipientsPayload = Array.from({ length: signerCount }, (_, idx) => {
      const isFirst = idx === 0 && options?.email
      const roleKey = layout.find((item) => (item.recipient_index ?? 0) === idx)?.role_key || ''
      return {
        name: isFirst ? options!.name || `Signer ${idx + 1}` : `Signer ${idx + 1}`,
        email: isFirst
          ? options!.email!
          : `signer-${idx + 1}-${envelopeId}@draft.local`,
        role: 'signer' as const,
        routing_order: idx + 1,
        contact: isFirst ? options?.contact || null : null,
        role_key: roleKey,
      }
    })
  }

  const createdRecipients = await api<
    Array<{ id: number; role_key?: string }>
  >(`/api/envelopes/${envelopeId}/recipients/`, {
    method: 'PUT',
    json: recipientsPayload,
  })

  const fields = layout.map((item) => {
    let recipientIndex = item.recipient_index ?? 0
    if (item.role_key) {
      const byKey = createdRecipients.findIndex((r) => r.role_key === item.role_key)
      if (byKey >= 0) recipientIndex = byKey
    }
    recipientIndex = Math.min(Math.max(recipientIndex, 0), createdRecipients.length - 1)
    const mergeToken = item.merge_token || ''
    const value =
      mergeToken && options?.mergeValues?.[mergeToken]
        ? options.mergeValues[mergeToken]
        : item.value || ''
    const fillMode =
      item.fill_mode === 'document' || item.fill_mode === 'signer'
        ? item.fill_mode
        : mergeToken.startsWith('listing.') ||
            mergeToken.startsWith('deal.') ||
            mergeToken.startsWith('custom.')
          ? 'document'
          : 'signer'
    return {
      recipient: createdRecipients[recipientIndex].id,
      field_type: item.field_type,
      page: item.page || 1,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      required: item.required ?? true,
      label: item.label || '',
      merge_token: mergeToken,
      fill_mode: fillMode,
      value,
    }
  })

  await api(`/api/envelopes/${envelopeId}/fields/`, {
    method: 'PUT',
    json: fields,
  })

  return api<EnvelopeDetail>(`/api/envelopes/${envelopeId}/`)
}
