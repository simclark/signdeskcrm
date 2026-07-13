export const SIGNATURE_FONTS = [
  { id: 'great-vibes', label: 'Great Vibes', family: "'Great Vibes', cursive" },
  { id: 'allura', label: 'Allura', family: "'Allura', cursive" },
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    family: "'Dancing Script', cursive",
  },
] as const

export type SignatureFontId = (typeof SIGNATURE_FONTS)[number]['id']

export function getSignatureFontFamily(fontId: SignatureFontId): string {
  const font = SIGNATURE_FONTS.find((f) => f.id === fontId)
  return font?.family ?? SIGNATURE_FONTS[0].family
}

export async function ensureSignatureFontsLoaded(): Promise<void> {
  const loads = SIGNATURE_FONTS.map((font) =>
    document.fonts.load(`48px ${font.family}`),
  )
  await Promise.all(loads)
  await document.fonts.ready
}
