import type { EnvelopeDetail, TemplateLayoutItem } from './types'
import { api } from '../../shared/api'

export async function applyTemplateLayout(
  envelopeId: number,
  layout: TemplateLayoutItem[],
  options?: { contact?: number | null; name?: string; email?: string },
): Promise<EnvelopeDetail> {
  const maxIndex = layout.reduce((max, item) => Math.max(max, item.recipient_index ?? 0), 0)
  const signerCount = Math.max(1, maxIndex + 1)

  const recipients = Array.from({ length: signerCount }, (_, idx) => {
    const isFirst = idx === 0 && options?.email
    return {
      name: isFirst ? options!.name || `Signer ${idx + 1}` : `Signer ${idx + 1}`,
      email: isFirst
        ? options!.email!
        : `signer-${idx + 1}-${envelopeId}@draft.local`,
      role: 'signer' as const,
      routing_order: idx + 1,
      contact: isFirst ? options?.contact || null : null,
    }
  })

  const createdRecipients = await api<Array<{ id: number }>>(`/api/envelopes/${envelopeId}/recipients/`, {
    method: 'PUT',
    json: recipients,
  })

  const fields = layout.map((item) => {
    const recipientIndex = Math.min(Math.max(item.recipient_index ?? 0, 0), createdRecipients.length - 1)
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
    }
  })

  await api(`/api/envelopes/${envelopeId}/fields/`, {
    method: 'PUT',
    json: fields,
  })

  return api<EnvelopeDetail>(`/api/envelopes/${envelopeId}/`)
}
