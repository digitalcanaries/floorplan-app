import { useEffect, useRef, useCallback } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'
import { getAABB, getOverlapRect, buildCutPolygon } from '../engine/geometry.js'

const SET_PREFIX = 'set-rect-'
const LABEL_PREFIX = 'set-label-'
const RULE_PREFIX = 'rule-line-'
const OVERLAP_PREFIX = 'overlap-zone-'
const CUTAWAY_PREFIX = 'cutaway-ghost-'
const GAP_PREFIX = 'wall-gap-'
const SNAP_LINE_NAME = 'snap-guide-line'
const TOOLTIP_NAME = 'hover-tooltip'
const TOOLTIP_BG_NAME = 'hover-tooltip-bg'

export default function FloorCanvas({ onCanvasSize }) {
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const containerRef = useRef(null)
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const snapLinesRef = useRef([])

  const {
    pdfImage, pdfRotation, pdfPosition, setPdfPosition,
    pixelsPerUnit, setPixelsPerUnit,
    gridVisible, snapToGrid, snapToSets, gridSize,
    labelsVisible, showOverlaps,
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

      const lockedLabel = setData.lockedToPdf ? ' [Locked]' : ''
      const catLabel = setData.category && setData.category !== 'Set' ? ` [${setData.category}]` : ''
      const gapLabel = setData.wallGap > 0 ? ` Gap:${setData.wallGap}${unit}` : ''
      const tooltipText = `${setData.name}  (${setData.width}${unit} x ${setData.height}${unit})${catLabel}${gapLabel}${lockedLabel}`
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
        stroke: setData.lockedToPdf ? '#f59e0b' : setData.color,
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
      // Save position when moved — locked sets move via setPdfPosition in store
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

  // Helper: clear snap guide lines
  const clearSnapLines = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name === SNAP_LINE_NAME).forEach(o => fc.remove(o))
    snapLinesRef.current = []
  }, [])

  // Helper: draw a snap guide line
  const drawSnapLine = useCallback((x1, y1, x2, y2) => {
    const fc = fabricRef.current
    if (!fc) return
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: '#22d3ee',
      strokeWidth: 1,
      strokeDashArray: [4, 4],
      selectable: false,
      evented: false,
      name: SNAP_LINE_NAME,
      opacity: 0.8,
    })
    fc.add(line)
    snapLinesRef.current.push(line)
  }, [])

  // Sync set rectangles to canvas
  const syncSets = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return

    const ppu = pixelsPerUnit

    // Remove old set objects, rule lines, overlap zones, gap zones, snap lines
    fc.getObjects()
      .filter(o =>
        o.name?.startsWith(SET_PREFIX) ||
        o.name?.startsWith(LABEL_PREFIX) ||
        o.name?.startsWith(RULE_PREFIX) ||
        o.name?.startsWith(OVERLAP_PREFIX) ||
        o.name?.startsWith(CUTAWAY_PREFIX) ||
        o.name?.startsWith(GAP_PREFIX) ||
        o.name === SNAP_LINE_NAME
      )
      .forEach(o => fc.remove(o))

    // Also remove any stale tooltips
    fc.getObjects()
      .filter(o => o.name === TOOLTIP_NAME || o.name === TOOLTIP_BG_NAME)
      .forEach(o => fc.remove(o))

    // Draw rule lines (only for visible sets)
    for (const rule of rules) {
      if (rule.type === 'FIXED') continue
      const a = sets.find(s => s.id === rule.setA && s.onPlan !== false)
      const b = sets.find(s => s.id === rule.setB && s.onPlan !== false)
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

    // Draw set shapes (only sets that are on the plan and not hidden)
    // Sort by zIndex for rendering order
    const visibleSets = sets
      .filter(s => s.onPlan !== false && !s.hidden)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

    for (const s of visibleSets) {
      const w = s.width * ppu
      const h = s.height * ppu
      const isSelected = s.id === selectedSetId
      const isLocked = s.lockedToPdf
      const hasCutouts = s.cutouts && s.cutouts.length > 0
      const setOpacity = s.opacity ?? 1

      // Compute fill alpha based on opacity and lock state
      const fillAlpha = isLocked ? Math.round(setOpacity * 0x55).toString(16).padStart(2, '0')
        : Math.round(setOpacity * 0x40).toString(16).padStart(2, '0')

      let shape
      if (hasCutouts) {
        // Ghost rectangle showing the cut-away area at very low opacity
        const ghostRect = new fabric.Rect({
          left: s.x,
          top: s.y,
          width: w,
          height: h,
          fill: s.color + '0D',
          stroke: s.color + '30',
          strokeWidth: 1,
          strokeDashArray: [4, 4],
          angle: s.rotation || 0,
          originX: 'left',
          originY: 'top',
          name: CUTAWAY_PREFIX + s.id,
          selectable: false,
          evented: false,
        })
        fc.add(ghostRect)

        const localPoints = buildCutPolygon(s.width, s.height, s.cutouts)
        const pixelPoints = localPoints.map(p => ({ x: p.x * ppu, y: p.y * ppu }))
        shape = new fabric.Polygon(pixelPoints, {
          left: s.x,
          top: s.y,
          fill: s.color + fillAlpha,
          stroke: isSelected ? '#ffffff' : isLocked ? '#f59e0b' : s.color,
          strokeWidth: isSelected ? 3 : 2,
          strokeDashArray: isLocked ? [6, 3] : [],
          angle: s.rotation || 0,
          originX: 'left',
          originY: 'top',
          name: SET_PREFIX + s.id,
          hasControls: false,
          lockRotation: true,
          cornerSize: 0,
          selectable: !isLocked,
          evented: true,
          hoverCursor: isLocked ? 'default' : 'move',
          objectCaching: false,
        })
        // Fabric.js Polygon offsets by pathOffset — compensate
        const po = shape.pathOffset
        shape.set({ left: s.x - po.x, top: s.y - po.y })
      } else {
        shape = new fabric.Rect({
          left: s.x,
          top: s.y,
          width: w,
          height: h,
          fill: s.color + fillAlpha,
          stroke: isSelected ? '#ffffff' : isLocked ? '#f59e0b' : s.color,
          strokeWidth: isSelected ? 3 : 2,
          strokeDashArray: isLocked ? [6, 3] : [],
          angle: s.rotation || 0,
          originX: 'left',
          originY: 'top',
          name: SET_PREFIX + s.id,
          hasControls: false,
          lockRotation: true,
          cornerSize: 0,
          selectable: !isLocked,
          evented: true,
          hoverCursor: isLocked ? 'default' : 'move',
        })
      }

      if (!isLocked) {
        const isPolygon = hasCutouts
        // Collect other set AABBs for edge snapping
        const otherSets = visibleSets.filter(o => o.id !== s.id)

        shape.on('moving', function () {
          let x = isPolygon ? this.left + this.pathOffset.x : this.left
          let y = isPolygon ? this.top + this.pathOffset.y : this.top

          // Grid snapping
          if (snapToGrid) {
            x = Math.round(x / gridSize) * gridSize
            y = Math.round(y / gridSize) * gridSize
          }

          // Edge snapping to other sets
          clearSnapLines()
          if (snapToSets && otherSets.length > 0) {
            const SNAP_THRESHOLD = 8
            const myAABB = getAABB({ ...s, x, y }, ppu)
            const myEdges = {
              left: myAABB.x,
              right: myAABB.x + myAABB.w,
              top: myAABB.y,
              bottom: myAABB.y + myAABB.h,
            }

            let snapDx = 0, snapDy = 0
            let foundSnapX = false, foundSnapY = false

            for (const other of otherSets) {
              const oAABB = getAABB(other, ppu)
              const oEdges = {
                left: oAABB.x,
                right: oAABB.x + oAABB.w,
                top: oAABB.y,
                bottom: oAABB.y + oAABB.h,
              }

              // Snap X edges
              if (!foundSnapX) {
                const xPairs = [
                  [myEdges.left, oEdges.left],
                  [myEdges.left, oEdges.right],
                  [myEdges.right, oEdges.left],
                  [myEdges.right, oEdges.right],
                ]
                for (const [myE, oE] of xPairs) {
                  if (Math.abs(myE - oE) < SNAP_THRESHOLD) {
                    snapDx = oE - myE
                    foundSnapX = true
                    // Draw vertical snap line
                    drawSnapLine(oE, Math.min(myEdges.top, oEdges.top) - 20, oE, Math.max(myEdges.bottom, oEdges.bottom) + 20)
                    break
                  }
                }
              }

              // Snap Y edges
              if (!foundSnapY) {
                const yPairs = [
                  [myEdges.top, oEdges.top],
                  [myEdges.top, oEdges.bottom],
                  [myEdges.bottom, oEdges.top],
                  [myEdges.bottom, oEdges.bottom],
                ]
                for (const [myE, oE] of yPairs) {
                  if (Math.abs(myE - oE) < SNAP_THRESHOLD) {
                    snapDy = oE - myE
                    foundSnapY = true
                    // Draw horizontal snap line
                    drawSnapLine(Math.min(myEdges.left, oEdges.left) - 20, oE, Math.max(myEdges.right, oEdges.right) + 20, oE)
                    break
                  }
                }
              }

              if (foundSnapX && foundSnapY) break
            }

            x += snapDx
            y += snapDy
          }

          if (isPolygon) {
            this.set({ left: x - this.pathOffset.x, top: y - this.pathOffset.y })
          } else {
            this.set({ left: x, top: y })
          }
        })

        shape.on('modified', function () {
          clearSnapLines()
          const fx = isPolygon ? this.left + this.pathOffset.x : this.left
          const fy = isPolygon ? this.top + this.pathOffset.y : this.top
          updateSet(s.id, { x: fx, y: fy })
        })

        shape.on('mousedblclick', function () {
          const newRot = ((s.rotation || 0) + 90) % 360
          updateSet(s.id, { rotation: newRot })
        })
      }

      shape.on('mousedown', function () {
        setSelectedSetId(s.id)
      })

      fc.add(shape)

      // Wall gap zone — dashed outline around set showing access area
      if (s.wallGap && s.wallGap > 0) {
        const gapPx = s.wallGap * ppu
        const isRotated = (s.rotation || 0) % 180 !== 0
        const gapW = (isRotated ? h : w) + gapPx * 2
        const gapH = (isRotated ? w : h) + gapPx * 2

        const gapZone = new fabric.Rect({
          left: s.x - gapPx,
          top: s.y - gapPx,
          width: gapW,
          height: gapH,
          fill: 'transparent',
          stroke: '#f59e0b55',
          strokeWidth: 1.5,
          strokeDashArray: [8, 4],
          selectable: false,
          evented: false,
          name: GAP_PREFIX + s.id,
        })
        fc.add(gapZone)
      }

      // Labels — only if global labelsVisible is on and per-set labelHidden is off
      if (labelsVisible && !s.labelHidden) {
        const labelFontSize = Math.min(12, Math.max(8, w / 8))
        const label = new fabric.FabricText(s.name, {
          left: s.x + 4,
          top: s.y + 4,
          fontSize: labelFontSize,
          fill: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 'bold',
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id,
          shadow: new fabric.Shadow({ color: '#000000', blur: 3 }),
        })
        fc.add(label)

        const dimLabel = new fabric.FabricText(`${s.width}x${s.height}`, {
          left: s.x + 4,
          top: s.y + 4 + labelFontSize + 2,
          fontSize: Math.min(10, labelFontSize - 1),
          fill: '#ffffffaa',
          fontFamily: 'system-ui, sans-serif',
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id + '-dim',
        })
        fc.add(dimLabel)

        // Category badge for non-Set types
        if (s.category && s.category !== 'Set') {
          const catLabel = new fabric.FabricText(s.category, {
            left: s.x + 4,
            top: s.y + 4 + labelFontSize + 2 + Math.min(10, labelFontSize - 1) + 2,
            fontSize: 8,
            fill: '#fbbf24aa',
            fontFamily: 'system-ui, sans-serif',
            selectable: false,
            evented: false,
            name: LABEL_PREFIX + s.id + '-cat',
          })
          fc.add(catLabel)
        }

        if (isLocked) {
          const pinIcon = new fabric.FabricText('\u{1F4CC}', {
            left: s.x + w - 18,
            top: s.y + 2,
            fontSize: 13,
            selectable: false,
            evented: false,
            name: LABEL_PREFIX + s.id + '-pin',
          })
          fc.add(pinIcon)
        }

        if (s.rotation && s.rotation !== 0) {
          const rotLabel = new fabric.FabricText(`${s.rotation}\u00B0`, {
            left: s.x + w - 20,
            top: s.y + h - 14,
            fontSize: 9,
            fill: '#fbbf24aa',
            fontFamily: 'system-ui, sans-serif',
            selectable: false,
            evented: false,
            name: LABEL_PREFIX + s.id + '-rot',
          })
          fc.add(rotLabel)
        }
      }
    }

    // Draw overlap zones between visible sets (if enabled)
    if (showOverlaps) {
      const visibleAABBs = visibleSets.map(s => getAABB(s, ppu))
      for (let i = 0; i < visibleAABBs.length; i++) {
        for (let j = i + 1; j < visibleAABBs.length; j++) {
          const overlap = getOverlapRect(visibleAABBs[i], visibleAABBs[j])
          if (!overlap || overlap.w < 2 || overlap.h < 2) continue

          const zone = new fabric.Rect({
            left: overlap.x,
            top: overlap.y,
            width: overlap.w,
            height: overlap.h,
            fill: '#EF444430',
            stroke: '#EF4444',
            strokeWidth: 1.5,
            strokeDashArray: [6, 3],
            selectable: false,
            evented: false,
            name: OVERLAP_PREFIX + visibleAABBs[i].id + '-' + visibleAABBs[j].id,
          })
          fc.add(zone)
        }
      }
    }

    // Draw FIXED indicators (only for visible sets)
    for (const rule of rules) {
      if (rule.type !== 'FIXED') continue
      const s = sets.find(ss => ss.id === rule.setA && ss.onPlan !== false)
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
  }, [sets, rules, pixelsPerUnit, selectedSetId, snapToGrid, snapToSets, gridSize, labelsVisible, showOverlaps])

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
