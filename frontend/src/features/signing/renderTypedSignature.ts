function renderTextToPng(
  text: string,
  fontFamily: string,
  width: number,
  height: number,
  fontSizeRatio: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#102a23'
  ctx.textBaseline = 'middle'

  let fontSize = Math.floor(height * fontSizeRatio)
  ctx.font = `${fontSize}px ${fontFamily}`
  while (ctx.measureText(text).width > width * 0.9 && fontSize > 14) {
    fontSize -= 2
    ctx.font = `${fontSize}px ${fontFamily}`
  }

  const textWidth = ctx.measureText(text).width
  const x = Math.max(8, (width - textWidth) / 2)
  ctx.fillText(text, x, height / 2)

  return canvas.toDataURL('image/png')
}

export function renderTypedSignature(
  text: string,
  fontFamily: string,
  width = 640,
  height = 180,
): string {
  return renderTextToPng(text, fontFamily, width, height, 0.55)
}

export function renderTypedInitials(
  text: string,
  fontFamily: string,
  width = 320,
  height = 120,
): string {
  return renderTextToPng(text, fontFamily, width, height, 0.65)
}

export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return parts
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}
