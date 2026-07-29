// Draw a serialised fabric annotation object onto a plain 2D canvas
// context. Objects are expected to be in image-native pixel space with
// originX='left', originY='top' (see extractObjectsFromSaved which
// normalises them). Fabric's own composite-render path was producing
// warped output in the app's PNG paths — this replaces it with plain
// 2D drawing that's provably correct.
//
// Extracted to its own module so both AnnotateImageModal and
// ReferenceSheetModal can import it without a circular dependency.
export function drawObjectOnCtx(ctx, o) {
  ctx.save()
  ctx.globalAlpha = (o.opacity == null ? 1 : o.opacity)
  ctx.strokeStyle = o.stroke || '#ef4444'
  ctx.lineWidth = o.strokeWidth || 3
  ctx.lineCap = o.strokeLineCap || 'round'
  ctx.lineJoin = o.strokeLineJoin || 'round'
  ctx.fillStyle = (o.fill && o.fill !== 'transparent' && o.fill !== '') ? o.fill : 'rgba(0,0,0,0)'

  const type = (o.type || '').toLowerCase()

  if (type === 'path' && Array.isArray(o.path)) {
    ctx.beginPath()
    for (const cmd of o.path) {
      const op = cmd[0]
      if (op === 'M' || op === 'm') ctx.moveTo(cmd[1], cmd[2])
      else if (op === 'L' || op === 'l') ctx.lineTo(cmd[1], cmd[2])
      else if (op === 'Q' || op === 'q') ctx.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4])
      else if (op === 'C' || op === 'c') ctx.bezierCurveTo(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6])
      else if (op === 'Z' || op === 'z') ctx.closePath()
    }
    if (o.fill && o.fill !== 'transparent' && o.fill !== '') ctx.fill()
    if (o.stroke) ctx.stroke()
  } else if (type === 'rect') {
    const x = o.left || 0, y = o.top || 0, w = o.width || 0, h = o.height || 0
    if (o.fill && o.fill !== 'transparent' && o.fill !== '') ctx.fillRect(x, y, w, h)
    if (o.stroke) ctx.strokeRect(x, y, w, h)
  } else if (type === 'ellipse') {
    const rx = o.rx || 0, ry = o.ry || 0
    const cx = (o.left || 0) + rx, cy = (o.top || 0) + ry
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    if (o.fill && o.fill !== 'transparent' && o.fill !== '') ctx.fill()
    if (o.stroke) ctx.stroke()
  } else if (type === 'line') {
    const x1 = (o.left || 0) + (o.x1 || 0)
    const y1 = (o.top || 0) + (o.y1 || 0)
    const x2 = (o.left || 0) + (o.x2 || 0)
    const y2 = (o.top || 0) + (o.y2 || 0)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  } else if (type === 'i-text' || type === 'itext' || type === 'text' || type === 'textbox') {
    const fontSize = o.fontSize || 24
    const fontFamily = o.fontFamily || 'sans-serif'
    const fontStyle = o.fontStyle || 'normal'
    const fontWeight = o.fontWeight || 'normal'
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = o.fill || '#000'
    const lines = String(o.text || '').split('\n')
    const lineHeight = fontSize * (o.lineHeight || 1.16)
    let y = o.top || 0
    for (const line of lines) {
      ctx.fillText(line, o.left || 0, y)
      y += lineHeight
    }
  }
  ctx.restore()
}
