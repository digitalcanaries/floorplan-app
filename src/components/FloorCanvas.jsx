import { useEffect, useRef, useCallback } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'

const SET_PREFIX = 'set-rect-'
const LABEL_PREFIX = 'set-label-'
const RULE_PREFIX = 'rule-line-'
const TOOLTIP_NAME = 'hover-tooltip'
const TOOLTIP_BG_NAME = 'hover-tooltip-bg'

export default function FloorCanvas({ onCanvasSize }) {
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const containerRef = useRef(null)
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const {
    pdfImage, pdfRotation, pdfPosition, setPdfPosition,
    pixelsPerUnit, setPixelsPerUnit,
    gridVisible, snapToGrid, gridSize,
    sets, updateSet, selectedSetId, setSelectedSetId,
    rules,
    calibrating, setCalibrating, addCalibrationPoint, calibrationPoints,
    unit,
  } = useStore()

  // Initialize fabric canvas
  useEffect(() => {
    if (fabricRef.current) return

    const el = canvasRef.current
    const container = containerRef.current
    const w = container.clientWidth
    const h = container.clientHeight

    const fc = new fabric.Canvas(el, {
      width: w,
      height: h,
      backgroundColor: '#1a1a2e',
      selection: false,
    })

    fabricRef.current = fc
    onCanvasSize?.({ w, h })

    // Resize handler
    const handleResize = () => {
      const nw = container.clientWidth
      const nh = container.clientHeight
      fc.setDimensions({ width: nw, height: nh })
      onCanvasSize?.({ w: nw, h: nh })
      fc.requestRenderAll()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      fc.dispose()
      fabricRef.current = null
    }
  }, [])

  // Zoom with scroll
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const handleWheel = (opt) => {
      const e = opt.e
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY
      let zoom = fc.getZoom()
      zoom *= 0.999 ** delta
      zoom = Math.min(Math.max(zoom, 0.1), 10)
      fc.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom)
      fc.requestRenderAll()
    }

    fc.on('mouse:wheel', handleWheel)
    return () => fc.off('mouse:wheel', handleWheel)
  }, [])

  // Pan with Ctrl+drag
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const onDown = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) {
        isPanning.current = true
        lastPan.current = { x: opt.e.clientX, y: opt.e.clientY }
        fc.selection = false
        fc.setCursor('grabbing')
      }
    }
    const onMove = (opt) => {
      if (!isPanning.current) return
      const vpt = fc.viewportTransform
      vpt[4] += opt.e.clientX - lastPan.current.x
      vpt[5] += opt.e.clientY - lastPan.current.y
      lastPan.current = { x: opt.e.clientX, y: opt.e.clientY }
      fc.requestRenderAll()
    }
    const onUp = () => {
      isPanning.current = false
      fc.setCursor('default')
    }

    fc.on('mouse:down', onDown)
    fc.on('mouse:move', onMove)
    fc.on('mouse:up', onUp)
    return () => {
      fc.off('mouse:down', onDown)
      fc.off('mouse:move', onMove)
      fc.off('mouse:up', onUp)
    }
  }, [])

  // Hover tooltip
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const removeTooltip = () => {
      fc.getObjects()
        .filter(o => o.name === TOOLTIP_NAME || o.name === TOOLTIP_BG_NAME)
        .forEach(o => fc.remove(o))
    }

    const onOver = (opt) => {
      const target = opt.target
      if (!target || !target.name?.startsWith(SET_PREFIX)) return

      const setId = parseInt(target.name.replace(SET_PREFIX, ''))
      const setData = sets.find(s => s.id === setId)
      if (!setData) return

      removeTooltip()

      const tooltipText = `${setData.name}  (${setData.width}${unit} x ${setData.height}${unit})`
      const padding = 6

      const label = new fabric.FabricText(tooltipText, {
        fontSize: 13,
        fill: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '600',
        selectable: false,
        evented: false,
        name: TOOLTIP_NAME,
      })

      // Position tooltip above the rectangle
      const rectTop = target.top
      const rectLeft = target.left
      const tooltipLeft = rectLeft
      const tooltipTop = rectTop - 28

      label.set({ left: tooltipLeft + padding + 2, top: tooltipTop + padding })

      const bg = new fabric.Rect({
        left: tooltipLeft,
        top: tooltipTop,
        width: label.width + padding * 2 + 4,
        height: 24,
        fill: '#1f2937ee',
        rx: 4,
        ry: 4,
        stroke: setData.color,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        name: TOOLTIP_BG_NAME,
      })

      fc.add(bg)
      fc.add(label)
      fc.requestRenderAll()
    }

    const onOut = (opt) => {
      const target = opt.target
      if (!target || !target.name?.startsWith(SET_PREFIX)) return
      removeTooltip()
      fc.requestRenderAll()
    }

    fc.on('mouse:over', onOver)
    fc.on('mouse:out', onOut)

    return () => {
      fc.off('mouse:over', onOver)
      fc.off('mouse:out', onOut)
      removeTooltip()
    }
  }, [sets, unit])

  // Calibration click handler
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || !calibrating) return

    const onClick = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) return
      const pointer = fc.getScenePoint(opt.e)
      const points = addCalibrationPoint({ x: pointer.x, y: pointer.y })

      if (points.length >= 2) {
        const dx = points[1].x - points[0].x
        const dy = points[1].y - points[0].y
        const pixelDist = Math.sqrt(dx * dx + dy * dy)
        const realDist = prompt(`Enter the real-world distance between the two points (in ${unit}):`)
        if (realDist && parseFloat(realDist) > 0) {
          setPixelsPerUnit(pixelDist / parseFloat(realDist))
        }
        setCalibrating(false)
      }
    }

    fc.on('mouse:down', onClick)
    return () => fc.off('mouse:down', onClick)
  }, [calibrating, unit])

  // Draw PDF background
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    // Remove old background
    const oldBg = fc.getObjects().find(o => o.name === 'pdf-bg')
    if (oldBg) fc.remove(oldBg)

    if (!pdfImage) {
      fc.requestRenderAll()
      return
    }

    // Use Fabric.js v7 async image loading
    fabric.FabricImage.fromURL(pdfImage).then((fImg) => {
      fImg.set({
        left: pdfPosition.x,
        top: pdfPosition.y,
        angle: pdfRotation,
        selectable: true,
        evented: true,
        name: 'pdf-bg',
        opacity: 0.6,
        hasControls: false,
        hasBorders: true,
        borderColor: '#6366F1',
        borderDashArray: [5, 5],
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
      })
      // Save position when moved
      fImg.on('modified', function () {
        setPdfPosition({ x: this.left, y: this.top })
      })
      // Remove any bg that was added while we were loading
      const existing = fc.getObjects().find(o => o.name === 'pdf-bg')
      if (existing) fc.remove(existing)
      fc.add(fImg)
      fc.sendObjectToBack(fImg)
      fc.requestRenderAll()
    }).catch((err) => {
      console.error('Failed to load PDF image onto canvas:', err)
    })
  }, [pdfImage, pdfRotation])

  // Draw grid
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    // Remove old grid lines
    fc.getObjects().filter(o => o.name === 'grid-line').forEach(o => fc.remove(o))

    if (!gridVisible) {
      fc.requestRenderAll()
      return
    }

    const w = fc.width / fc.getZoom() + 2000
    const h = fc.height / fc.getZoom() + 2000
    const step = gridSize

    for (let x = 0; x < w; x += step) {
      const line = new fabric.Line([x, 0, x, h], {
        stroke: '#ffffff10',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        name: 'grid-line',
      })
      fc.add(line)
      fc.sendObjectToBack(line)
    }
    for (let y = 0; y < h; y += step) {
      const line = new fabric.Line([0, y, w, y], {
        stroke: '#ffffff10',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        name: 'grid-line',
      })
      fc.add(line)
      fc.sendObjectToBack(line)
    }

    // Keep PDF behind grid
    const pdfBg = fc.getObjects().find(o => o.name === 'pdf-bg')
    if (pdfBg) fc.sendObjectToBack(pdfBg)

    fc.requestRenderAll()
  }, [gridVisible, gridSize])

  // Sync set rectangles to canvas
  const syncSets = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return

    const ppu = pixelsPerUnit

    // Remove old set objects and rule lines
    fc.getObjects()
      .filter(o => o.name?.startsWith(SET_PREFIX) || o.name?.startsWith(LABEL_PREFIX) || o.name?.startsWith(RULE_PREFIX))
      .forEach(o => fc.remove(o))

    // Also remove any stale tooltips
    fc.getObjects()
      .filter(o => o.name === TOOLTIP_NAME || o.name === TOOLTIP_BG_NAME)
      .forEach(o => fc.remove(o))

    // Draw rule lines
    for (const rule of rules) {
      if (rule.type === 'FIXED') continue
      const a = sets.find(s => s.id === rule.setA)
      const b = sets.find(s => s.id === rule.setB)
      if (!a || !b) continue

      const aw = a.width * ppu, ah = a.height * ppu
      const bw = b.width * ppu, bh = b.height * ppu
      const ax = a.x + aw / 2, ay = a.y + ah / 2
      const bx = b.x + bw / 2, by = b.y + bh / 2

      const color = rule.type === 'NEAR' ? '#10B981' : rule.type === 'CONNECT' ? '#3B82F6' : '#EF4444'
      const dash = rule.type === 'CONNECT' ? [] : [8, 4]

      const line = new fabric.Line([ax, ay, bx, by], {
        stroke: color,
        strokeWidth: 2,
        strokeDashArray: dash,
        selectable: false,
        evented: false,
        name: RULE_PREFIX + rule.id,
        opacity: 0.6,
      })
      fc.add(line)
    }

    // Draw set rectangles
    for (const set of sets) {
      const w = set.width * ppu
      const h = set.height * ppu
      const isSelected = set.id === selectedSetId

      const rect = new fabric.Rect({
        left: set.x,
        top: set.y,
        width: w,
        height: h,
        fill: set.color + '40',
        stroke: isSelected ? '#ffffff' : set.color,
        strokeWidth: isSelected ? 3 : 2,
        angle: set.rotation || 0,
        originX: 'left',
        originY: 'top',
        name: SET_PREFIX + set.id,
        hasControls: false,
        lockRotation: true,
        cornerSize: 0,
        hoverCursor: 'move',
      })

      // Drag handler
      rect.on('moving', function () {
        let x = this.left
        let y = this.top
        if (snapToGrid) {
          x = Math.round(x / gridSize) * gridSize
          y = Math.round(y / gridSize) * gridSize
          this.set({ left: x, top: y })
        }
      })

      rect.on('modified', function () {
        updateSet(set.id, { x: this.left, y: this.top })
      })

      rect.on('mousedown', function () {
        setSelectedSetId(set.id)
      })

      // Double-click to rotate 90 degrees
      rect.on('mousedblclick', function () {
        const newRot = ((set.rotation || 0) + 90) % 360
        updateSet(set.id, { rotation: newRot })
      })

      fc.add(rect)

      // Label — only show set name abbreviated for small rects, full for large
      const labelFontSize = Math.min(12, Math.max(8, w / 8))
      const label = new fabric.FabricText(set.name, {
        left: set.x + 4,
        top: set.y + 4,
        fontSize: labelFontSize,
        fill: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 'bold',
        selectable: false,
        evented: false,
        name: LABEL_PREFIX + set.id,
        shadow: new fabric.Shadow({ color: '#000000', blur: 3 }),
      })
      fc.add(label)

      // Dimensions label
      const dimLabel = new fabric.FabricText(`${set.width}x${set.height}`, {
        left: set.x + 4,
        top: set.y + 4 + labelFontSize + 2,
        fontSize: Math.min(10, labelFontSize - 1),
        fill: '#ffffffaa',
        fontFamily: 'system-ui, sans-serif',
        selectable: false,
        evented: false,
        name: LABEL_PREFIX + set.id + '-dim',
      })
      fc.add(dimLabel)

      // Rotation indicator
      if (set.rotation && set.rotation !== 0) {
        const rotLabel = new fabric.FabricText(`${set.rotation}°`, {
          left: set.x + w - 20,
          top: set.y + h - 14,
          fontSize: 9,
          fill: '#fbbf24aa',
          fontFamily: 'system-ui, sans-serif',
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + set.id + '-rot',
        })
        fc.add(rotLabel)
      }
    }

    // Draw FIXED indicators
    for (const rule of rules) {
      if (rule.type !== 'FIXED') continue
      const s = sets.find(ss => ss.id === rule.setA)
      if (!s) continue
      const lockIcon = new fabric.FabricText('\u{1F512}', {
        left: s.x + s.width * ppu - 16,
        top: s.y + 2,
        fontSize: 12,
        selectable: false,
        evented: false,
        name: RULE_PREFIX + rule.id + '-icon',
      })
      fc.add(lockIcon)
    }

    fc.requestRenderAll()
  }, [sets, rules, pixelsPerUnit, selectedSetId, snapToGrid, gridSize])

  useEffect(() => {
    syncSets()
  }, [syncSets])

  // Calibration visual indicators
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    fc.getObjects().filter(o => o.name === 'cal-point').forEach(o => fc.remove(o))

    if (calibrating && calibrationPoints.length > 0) {
      for (const pt of calibrationPoints) {
        const circle = new fabric.Circle({
          left: pt.x - 6,
          top: pt.y - 6,
          radius: 6,
          fill: '#EF4444',
          stroke: '#ffffff',
          strokeWidth: 2,
          selectable: false,
          evented: false,
          name: 'cal-point',
        })
        fc.add(circle)
      }
    }

    fc.requestRenderAll()
  }, [calibrating, calibrationPoints])

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-900">
      <canvas ref={canvasRef} />
      {calibrating && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10">
          Click two points on the floor plan to calibrate scale
          ({calibrationPoints.length}/2 points selected)
        </div>
      )}
    </div>
  )
}
