// Icon rendering for architectural components on the fabric.js canvas
// Each function returns an array of fabric.js objects to add to the canvas

import * as fabric from 'fabric'

export const ICON_PREFIX = 'comp-icon-'

/**
 * Draw component icon detail lines inside a set shape.
 * @param {string} iconType - Type of icon to draw
 * @param {object} set - The set object with x, y, width, height, rotation, color
 * @param {number} w - Rendered width in pixels (already accounts for rotation)
 * @param {number} h - Rendered height in pixels (already accounts for rotation)
 * @param {number} ppu - Pixels per unit
 * @param {object} properties - Component properties (panes, style, etc)
 * @returns {Array} Array of fabric.js objects
 */
export function drawComponentIcon(iconType, set, w, h, ppu, properties = {}) {
  const x = set.x
  const y = set.y
  const color = set.color || '#888888'
  const alpha = set.opacity ?? 1
  // Icon lines use the set color at 60% opacity for subtle detail
  const lineColor = hexToRgba(color, 0.6 * alpha)
  const fillColor = hexToRgba(color, 0.15 * alpha)
  const prefix = ICON_PREFIX + set.id + '-'

  switch (iconType) {
    case 'window':
      return drawWindowIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'door':
      return drawDoorIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'door-double':
      return drawDoubleDoorIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'door-arch':
      return drawArchDoorIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'flat':
      return drawFlatIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'flat-double':
      return drawDoubleFlatIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'flat-braced':
      return drawBracedWallIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'column':
      return drawColumnIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    case 'stair':
      return drawStairIcon(prefix, x, y, w, h, lineColor, fillColor, properties)
    default:
      return []
  }
}

/**
 * Window icon — surround frame with pane dividers
 */
function drawWindowIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const panes = props.panes || 1
  const pad = Math.min(w, h) * 0.08 // surround width in pixels

  // Surround rectangle
  objects.push(new fabric.Rect({
    left: x + pad,
    top: y + pad,
    width: w - pad * 2,
    height: h - pad * 2,
    fill: 'transparent',
    stroke: lineColor,
    strokeWidth: 1.5,
    selectable: false,
    evented: false,
    name: prefix + 'surround',
  }))

  // Glass fill (light blue tint)
  objects.push(new fabric.Rect({
    left: x + pad,
    top: y + pad,
    width: w - pad * 2,
    height: h - pad * 2,
    fill: hexToRgba('#87CEEB', 0.15),
    stroke: 'transparent',
    selectable: false,
    evented: false,
    name: prefix + 'glass',
  }))

  // Pane dividers (vertical)
  if (panes > 1) {
    const innerW = w - pad * 2
    const divW = Math.max(2, innerW * 0.02) // divider visual width
    for (let i = 1; i < panes; i++) {
      const dx = x + pad + (innerW / panes) * i
      objects.push(new fabric.Line(
        [dx, y + pad, dx, y + h - pad],
        {
          stroke: lineColor,
          strokeWidth: divW,
          selectable: false,
          evented: false,
          name: prefix + 'div-' + i,
        }
      ))
    }
  }

  // Cross pattern for single pane windows (diagonal lines)
  if (panes === 1 && w > 20 && h > 20) {
    objects.push(new fabric.Line(
      [x + pad, y + pad, x + w - pad, y + h - pad],
      {
        stroke: hexToRgba('#87CEEB', 0.3),
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
        name: prefix + 'cross1',
      }
    ))
    objects.push(new fabric.Line(
      [x + w - pad, y + pad, x + pad, y + h - pad],
      {
        stroke: hexToRgba('#87CEEB', 0.3),
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
        name: prefix + 'cross2',
      }
    ))
  }

  return objects
}

/**
 * Single door icon — threshold line + swing arc
 */
function drawDoorIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const swing = props.swing || 'left'

  // Threshold line (along the wider dimension)
  const isWide = w >= h
  if (isWide) {
    // Door opens upward — hinge on left or right
    const hingeX = swing === 'right' ? x + w : x
    const arcEndX = swing === 'right' ? x : x + w

    // Threshold line at bottom
    objects.push(new fabric.Line(
      [x, y + h, x + w, y + h],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'threshold' }
    ))

    // Door panel (closed position along bottom)
    objects.push(new fabric.Line(
      [hingeX, y + h, arcEndX, y + h],
      { stroke: lineColor, strokeWidth: 2.5, selectable: false, evented: false, name: prefix + 'panel' }
    ))

    // Swing arc (quarter circle)
    const radius = w
    const startAngle = swing === 'right' ? 180 : 0
    const endAngle = swing === 'right' ? 270 : -90
    objects.push(createArc(prefix + 'arc', hingeX, y + h, radius, startAngle, endAngle, lineColor))
  } else {
    // Tall door — opens to the right, hinge at top or bottom
    const hingeY = swing === 'right' ? y : y + h
    const arcEndY = swing === 'right' ? y + h : y

    // Threshold line at left
    objects.push(new fabric.Line(
      [x, y, x, y + h],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'threshold' }
    ))

    // Door panel
    objects.push(new fabric.Line(
      [x, hingeY, x, arcEndY],
      { stroke: lineColor, strokeWidth: 2.5, selectable: false, evented: false, name: prefix + 'panel' }
    ))

    // Swing arc
    const radius = h
    const startAngle = swing === 'right' ? 270 : 0
    const endAngle = swing === 'right' ? 360 : 90
    objects.push(createArc(prefix + 'arc', x, hingeY, radius, startAngle, endAngle, lineColor))
  }

  return objects
}

/**
 * Double door icon — two opposing swing arcs
 */
function drawDoubleDoorIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const isWide = w >= h

  if (isWide) {
    const midX = x + w / 2

    // Threshold line
    objects.push(new fabric.Line(
      [x, y + h, x + w, y + h],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'threshold' }
    ))

    // Left door panel
    objects.push(new fabric.Line(
      [x, y + h, midX, y + h],
      { stroke: lineColor, strokeWidth: 2.5, selectable: false, evented: false, name: prefix + 'panel-l' }
    ))

    // Right door panel
    objects.push(new fabric.Line(
      [midX, y + h, x + w, y + h],
      { stroke: lineColor, strokeWidth: 2.5, selectable: false, evented: false, name: prefix + 'panel-r' }
    ))

    // Left swing arc (from left hinge)
    const radius = w / 2
    objects.push(createArc(prefix + 'arc-l', x, y + h, radius, 0, -90, lineColor))

    // Right swing arc (from right hinge)
    objects.push(createArc(prefix + 'arc-r', x + w, y + h, radius, 180, 270, lineColor))
  } else {
    const midY = y + h / 2

    // Threshold line
    objects.push(new fabric.Line(
      [x, y, x, y + h],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'threshold' }
    ))

    // Top door
    objects.push(new fabric.Line(
      [x, y, x, midY],
      { stroke: lineColor, strokeWidth: 2.5, selectable: false, evented: false, name: prefix + 'panel-t' }
    ))

    // Bottom door
    objects.push(new fabric.Line(
      [x, midY, x, y + h],
      { stroke: lineColor, strokeWidth: 2.5, selectable: false, evented: false, name: prefix + 'panel-b' }
    ))

    const radius = h / 2
    objects.push(createArc(prefix + 'arc-t', x, y, radius, 0, 90, lineColor))
    objects.push(createArc(prefix + 'arc-b', x, y + h, radius, 270, 360, lineColor))
  }

  return objects
}

/**
 * Arch door — rectangle with arched top
 */
function drawArchDoorIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []

  // Draw an arch at the top of the opening
  const archHeight = Math.min(w / 2, h * 0.3)
  const cx = x + w / 2
  const cy = y + archHeight

  // Arch curve (semi-circle at top)
  const points = []
  const steps = 20
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI + (Math.PI * i / steps)
    const px = cx + (w / 2 - 2) * Math.cos(angle)
    const py = cy + archHeight * Math.sin(angle)
    points.push({ x: px, y: py })
  }

  // Side lines
  objects.push(new fabric.Line(
    [x + 2, cy, x + 2, y + h],
    { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'side-l' }
  ))
  objects.push(new fabric.Line(
    [x + w - 2, cy, x + w - 2, y + h],
    { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'side-r' }
  ))

  // Threshold
  objects.push(new fabric.Line(
    [x, y + h, x + w, y + h],
    { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'threshold' }
  ))

  // Arch polyline
  if (points.length > 1) {
    const polyline = new fabric.Polyline(points, {
      fill: 'transparent',
      stroke: lineColor,
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
      name: prefix + 'arch',
    })
    objects.push(polyline)
  }

  return objects
}

/**
 * Single flat icon — hatching pattern to show lumber framing
 */
function drawFlatIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []

  // Single line along centre to indicate single-sided
  const isWide = w >= h
  if (isWide) {
    objects.push(new fabric.Line(
      [x + 2, y + h / 2, x + w - 2, y + h / 2],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'centre' }
    ))
  } else {
    objects.push(new fabric.Line(
      [x + w / 2, y + 2, x + w / 2, y + h - 2],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'centre' }
    ))
  }

  return objects
}

/**
 * Double flat icon — two parallel lines for double-sided
 */
function drawDoubleFlatIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const gap = Math.min(w, h) * 0.2

  const isWide = w >= h
  if (isWide) {
    objects.push(new fabric.Line(
      [x + 2, y + h / 2 - gap, x + w - 2, y + h / 2 - gap],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'line1' }
    ))
    objects.push(new fabric.Line(
      [x + 2, y + h / 2 + gap, x + w - 2, y + h / 2 + gap],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'line2' }
    ))
  } else {
    objects.push(new fabric.Line(
      [x + w / 2 - gap, y + 2, x + w / 2 - gap, y + h - 2],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'line1' }
    ))
    objects.push(new fabric.Line(
      [x + w / 2 + gap, y + 2, x + w / 2 + gap, y + h - 2],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'line2' }
    ))
  }

  return objects
}

/**
 * Braced access wall — two parallel lines with dashed gap indicators
 */
function drawBracedWallIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const offset = Math.min(w, h) * 0.25

  const isWide = w >= h
  if (isWide) {
    // Top wall line
    objects.push(new fabric.Line(
      [x + 2, y + offset, x + w - 2, y + offset],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'wall1' }
    ))
    // Bottom wall line
    objects.push(new fabric.Line(
      [x + 2, y + h - offset, x + w - 2, y + h - offset],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'wall2' }
    ))
    // Dashed centre line (access gap)
    objects.push(new fabric.Line(
      [x + 2, y + h / 2, x + w - 2, y + h / 2],
      {
        stroke: lineColor, strokeWidth: 1, strokeDashArray: [4, 4],
        selectable: false, evented: false, name: prefix + 'gap',
      }
    ))
    // Vertical braces
    const braceSpacing = Math.max(w / 4, 20)
    for (let bx = x + braceSpacing; bx < x + w - 5; bx += braceSpacing) {
      objects.push(new fabric.Line(
        [bx, y + offset, bx, y + h - offset],
        {
          stroke: lineColor, strokeWidth: 0.8, strokeDashArray: [3, 3],
          selectable: false, evented: false, name: prefix + 'brace-' + Math.round(bx),
        }
      ))
    }
  } else {
    // Left wall line
    objects.push(new fabric.Line(
      [x + offset, y + 2, x + offset, y + h - 2],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'wall1' }
    ))
    // Right wall line
    objects.push(new fabric.Line(
      [x + w - offset, y + 2, x + w - offset, y + h - 2],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'wall2' }
    ))
    // Dashed centre
    objects.push(new fabric.Line(
      [x + w / 2, y + 2, x + w / 2, y + h - 2],
      {
        stroke: lineColor, strokeWidth: 1, strokeDashArray: [4, 4],
        selectable: false, evented: false, name: prefix + 'gap',
      }
    ))
    // Horizontal braces
    const braceSpacing = Math.max(h / 4, 20)
    for (let by = y + braceSpacing; by < y + h - 5; by += braceSpacing) {
      objects.push(new fabric.Line(
        [x + offset, by, x + w - offset, by],
        {
          stroke: lineColor, strokeWidth: 0.8, strokeDashArray: [3, 3],
          selectable: false, evented: false, name: prefix + 'brace-' + Math.round(by),
        }
      ))
    }
  }

  return objects
}

/**
 * Column icon — circle/ellipse inside the set bounds
 */
function drawColumnIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const shape = props.shape || 'round'

  if (shape === 'round') {
    const cx = x + w / 2
    const cy = y + h / 2
    const rx = (w - 4) / 2
    const ry = (h - 4) / 2

    objects.push(new fabric.Ellipse({
      left: cx - rx,
      top: cy - ry,
      rx: rx,
      ry: ry,
      fill: fillColor,
      stroke: lineColor,
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
      name: prefix + 'circle',
    }))

    // Cross hairs
    objects.push(new fabric.Line(
      [cx - rx * 0.5, cy, cx + rx * 0.5, cy],
      { stroke: lineColor, strokeWidth: 0.8, selectable: false, evented: false, name: prefix + 'xh' }
    ))
    objects.push(new fabric.Line(
      [cx, cy - ry * 0.5, cx, cy + ry * 0.5],
      { stroke: lineColor, strokeWidth: 0.8, selectable: false, evented: false, name: prefix + 'xv' }
    ))
  } else {
    // Square column — X pattern
    objects.push(new fabric.Line(
      [x + 3, y + 3, x + w - 3, y + h - 3],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'x1' }
    ))
    objects.push(new fabric.Line(
      [x + w - 3, y + 3, x + 3, y + h - 3],
      { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'x2' }
    ))
  }

  return objects
}

/**
 * Staircase icon — parallel tread lines
 */
function drawStairIcon(prefix, x, y, w, h, lineColor, fillColor, props) {
  const objects = []
  const treads = props.treads || Math.max(4, Math.round(h / w * 3))

  const isWide = w >= h
  if (isWide) {
    // Treads are vertical lines
    const spacing = w / (treads + 1)
    for (let i = 1; i <= treads; i++) {
      const lx = x + spacing * i
      objects.push(new fabric.Line(
        [lx, y + 2, lx, y + h - 2],
        { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'tread-' + i }
      ))
    }
    // Arrow showing direction of travel
    const arrowY = y + h / 2
    objects.push(new fabric.Line(
      [x + 4, arrowY, x + w - 4, arrowY],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'arrow' }
    ))
    // Arrowhead
    objects.push(new fabric.Polygon(
      [
        { x: x + w - 4, y: arrowY },
        { x: x + w - 12, y: arrowY - 4 },
        { x: x + w - 12, y: arrowY + 4 },
      ],
      { fill: lineColor, selectable: false, evented: false, name: prefix + 'arrowhead' }
    ))
  } else {
    // Treads are horizontal lines
    const spacing = h / (treads + 1)
    for (let i = 1; i <= treads; i++) {
      const ly = y + spacing * i
      objects.push(new fabric.Line(
        [x + 2, ly, x + w - 2, ly],
        { stroke: lineColor, strokeWidth: 1, selectable: false, evented: false, name: prefix + 'tread-' + i }
      ))
    }
    // Arrow
    const arrowX = x + w / 2
    objects.push(new fabric.Line(
      [arrowX, y + 4, arrowX, y + h - 4],
      { stroke: lineColor, strokeWidth: 1.5, selectable: false, evented: false, name: prefix + 'arrow' }
    ))
    objects.push(new fabric.Polygon(
      [
        { x: arrowX, y: y + h - 4 },
        { x: arrowX - 4, y: y + h - 12 },
        { x: arrowX + 4, y: y + h - 12 },
      ],
      { fill: lineColor, selectable: false, evented: false, name: prefix + 'arrowhead' }
    ))
  }

  return objects
}


// ── Helpers ──

/**
 * Create a quarter-circle arc as a polyline (fabric.js doesn't have native arc)
 */
function createArc(name, cx, cy, radius, startDeg, endDeg, color) {
  const points = []
  const steps = 16
  const startRad = (startDeg * Math.PI) / 180
  const endRad = (endDeg * Math.PI) / 180

  for (let i = 0; i <= steps; i++) {
    const angle = startRad + ((endRad - startRad) * i) / steps
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  }

  return new fabric.Polyline(points, {
    fill: 'transparent',
    stroke: color,
    strokeWidth: 1,
    strokeDashArray: [4, 3],
    selectable: false,
    evented: false,
    name,
  })
}

/**
 * Convert hex color + alpha to rgba string
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16) || 0
  const g = parseInt(hex.slice(3, 5), 16) || 0
  const b = parseInt(hex.slice(5, 7), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}
