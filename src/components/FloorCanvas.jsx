import { useEffect, useRef, useCallback } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'
import { getAABB, getOverlapRect, buildCutPolygon, getLabelPosition } from '../engine/geometry.js'
import { drawComponentIcon, ICON_PREFIX } from '../engine/componentIcons.js'

const SET_PREFIX = 'set-rect-'
const LABEL_PREFIX = 'set-label-'
const RULE_PREFIX = 'rule-line-'
const OVERLAP_PREFIX = 'overlap-zone-'
const CUTAWAY_PREFIX = 'cutaway-ghost-'
const GAP_PREFIX = 'wall-gap-'
const WALL_LINE_PREFIX = 'wall-line-'
const LEADER_PREFIX = 'leader-line-'
const SNAP_LINE_NAME = 'snap-guide-line'
const TOOLTIP_NAME = 'hover-tooltip'
const TOOLTIP_BG_NAME = 'hover-tooltip-bg'
const DIM_PREFIX = 'dim-line-'
const ANNO_PREFIX = 'annotation-'
const BWALL_PREFIX = 'building-wall-'
const DRAWING_PREVIEW_NAME = 'drawing-preview'
const DRAWING_POINT_NAME = 'drawing-point'

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
    labelsVisible, labelMode, showOverlaps,
    sets, updateSet, selectedSetId, setSelectedSetId, deleteSet,
    rules,
    calibrating, setCalibrating, addCalibrationPoint, calibrationPoints,
    unit, viewMode,
    undo, redo,
    annotations, updateAnnotation,
    layerVisibility, showDimensions,
    showHoverTooltips, showLockIndicators, hideAllSets,
    copySet, pasteSet, duplicateSet,
    buildingWalls, buildingWallsVisible,
    drawingMode, drawingWallPoints, addDrawingPoint, cancelDrawing,
    breakDrawingChain, drawingWallSnap,
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

    // If tooltips disabled, just clean up and return
    if (!showHoverTooltips) {
      removeTooltip()
      return
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
  }, [sets, unit, showHoverTooltips])

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

    // Remove old set objects, rule lines, overlap zones, gap zones, snap lines, dimensions, annotations
    fc.getObjects()
      .filter(o =>
        o.name?.startsWith(SET_PREFIX) ||
        o.name?.startsWith(LABEL_PREFIX) ||
        o.name?.startsWith(RULE_PREFIX) ||
        o.name?.startsWith(OVERLAP_PREFIX) ||
        o.name?.startsWith(CUTAWAY_PREFIX) ||
        o.name?.startsWith(GAP_PREFIX) ||
        o.name?.startsWith(WALL_LINE_PREFIX) ||
        o.name?.startsWith(LEADER_PREFIX) ||
        o.name?.startsWith(ICON_PREFIX) ||
        o.name?.startsWith(DIM_PREFIX) ||
        o.name?.startsWith(ANNO_PREFIX) ||
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

    // Draw set shapes (only sets that are on the plan, not hidden, and layer is visible)
    // Sort by zIndex for rendering order
    const visibleSets = hideAllSets ? [] : sets
      .filter(s => s.onPlan !== false && !s.hidden && (layerVisibility[s.category || 'Set'] !== false))
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

    for (const s of visibleSets) {
      const w = s.width * ppu
      const h = s.height * ppu
      const isSelected = s.id === selectedSetId
      const isLocked = s.lockedToPdf
      const showLockVis = isLocked && showLockIndicators // visual indicator only
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
          stroke: isSelected ? '#ffffff' : showLockVis ? '#f59e0b' : s.color,
          strokeWidth: isSelected ? 3 : 2,
          strokeDashArray: showLockVis ? [6, 3] : [],
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
          stroke: isSelected ? '#ffffff' : showLockVis ? '#f59e0b' : s.color,
          strokeWidth: isSelected ? 3 : 2,
          strokeDashArray: showLockVis ? [6, 3] : [],
          angle: s.rotation || 0,
          originX: 'left',
          originY: 'top',
          name: SET_PREFIX + s.id,
          hasControls: !isLocked,
          lockRotation: true,
          cornerSize: !isLocked ? 7 : 0,
          cornerStyle: 'circle',
          cornerColor: '#6366f1',
          cornerStrokeColor: '#ffffff',
          transparentCorners: false,
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

          // Building wall collision — prevent sets from overlapping building walls
          const bwalls = useStore.getState().buildingWalls
          if (bwalls.length > 0) {
            const testAABB = getAABB({ ...s, x, y }, ppu)
            const setL = testAABB.x, setR = testAABB.x + testAABB.w
            const setT = testAABB.y, setB = testAABB.y + testAABB.h
            for (const bw of bwalls) {
              const thk = bw.thickness * ppu
              const wdx = bw.x2 - bw.x1, wdy = bw.y2 - bw.y1
              const wlen = Math.sqrt(wdx * wdx + wdy * wdy)
              if (wlen < 1) continue
              const wnx = -wdy / wlen * (thk / 2), wny = wdx / wlen * (thk / 2)
              // Wall AABB
              const wxs = [bw.x1 + wnx, bw.x1 - wnx, bw.x2 + wnx, bw.x2 - wnx]
              const wys = [bw.y1 + wny, bw.y1 - wny, bw.y2 + wny, bw.y2 - wny]
              const wL = Math.min(...wxs), wR = Math.max(...wxs)
              const wT = Math.min(...wys), wB = Math.max(...wys)
              // AABB overlap test
              if (setR > wL && setL < wR && setB > wT && setT < wB) {
                // Push set out — find minimum push distance
                const pushL = wR - setL, pushR = setR - wL
                const pushT = wB - setT, pushB = setB - wT
                const minPush = Math.min(pushL, pushR, pushT, pushB)
                if (minPush === pushL) x += pushL
                else if (minPush === pushR) x -= pushR
                else if (minPush === pushT) y += pushT
                else y -= pushB
              }
            }
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
          // Check if shape was scaled (resized)
          const sx = this.scaleX || 1
          const sy = this.scaleY || 1
          if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
            // Resize: convert scale to new width/height in feet, snap to 0.5ft
            const newW = Math.max(0.5, Math.round(s.width * sx * 2) / 2)
            const newH = Math.max(0.5, Math.round(s.height * sy * 2) / 2)
            this.set({ scaleX: 1, scaleY: 1, width: newW * ppu, height: newH * ppu })
            updateSet(s.id, { x: fx, y: fy, width: newW, height: newH })
          } else {
            updateSet(s.id, { x: fx, y: fy })
          }
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

      // Per-side wall line rendering with overlap clipping
      // Works for ALL categories at 0° rotation where AABB matches the rect exactly.
      const isRoomSet = !s.category || s.category === 'Set'
      const hasRemovedWalls = s.removedWalls && Object.values(s.removedWalls).some(v => v)
      const hasHiddenWalls = s.hiddenWalls && Object.values(s.hiddenWalls).some(v => v)
      const hasWallExtensions = s.wallExtensions && Object.values(s.wallExtensions).some(v => v > 0)
      const setRot = ((s.rotation || 0) % 360 + 360) % 360
      if (setRot === 0 && (hasRemovedWalls || hasHiddenWalls || hasWallExtensions || isRoomSet)) {
        // Compute room AABBs for overlap detection (pixel coords) — only for room sets
        const myAABB = getAABB(s, ppu)
        const otherRoomAABBs = isRoomSet ? visibleSets
          .filter(o => o.id !== s.id && (!o.category || o.category === 'Set'))
          .map(o => getAABB(o, ppu)) : []

        // Check if any other room overlaps this one
        const hasOverlap = isRoomSet && otherRoomAABBs.some(oabb => {
          const overlap = getOverlapRect(myAABB, oabb)
          return overlap && overlap.w > 2 && overlap.h > 2
        })

        if (hasRemovedWalls || hasHiddenWalls || hasWallExtensions || hasOverlap) {
          // Make the rect stroke transparent — use individual wall lines instead
          shape.set({ stroke: 'transparent', strokeWidth: 0 })

          const wallColor = isSelected ? '#ffffff' : showLockVis ? '#f59e0b' : s.color
          const wallWidth = isSelected ? 3 : 2
          const wallDash = showLockVis ? [6, 3] : []
          const removedWalls = s.removedWalls || {}
          const hiddenWalls = s.hiddenWalls || {}
          const wallExtensions = s.wallExtensions || {}

          // At 0° rotation, AABB matches the rect exactly
          const bx = s.x, by = s.y, bw = w, bh = h

          // Define 4 wall sides in pixel coords
          const wallSides = [
            { side: 'top',    fixed: by,      rangeMin: bx, rangeMax: bx + bw, dir: 'h' },
            { side: 'bottom', fixed: by + bh, rangeMin: bx, rangeMax: bx + bw, dir: 'h' },
            { side: 'left',   fixed: bx,      rangeMin: by, rangeMax: by + bh, dir: 'v' },
            { side: 'right',  fixed: bx + bw, rangeMin: by, rangeMax: by + bh, dir: 'v' },
          ]

          for (const ws of wallSides) {
            // Skip manually removed walls
            if (removedWalls[ws.side]) continue
            const isHidden = hiddenWalls[ws.side]
            const extension = (wallExtensions[ws.side] || 0) * ppu // convert feet to pixels

            // Compute overlap intervals — portions of this wall inside another room
            const clipIntervals = []
            for (const oabb of otherRoomAABBs) {
              if (ws.dir === 'h') {
                if (ws.fixed > oabb.y + 1 && ws.fixed < oabb.y + oabb.h - 1) {
                  const oMin = Math.max(ws.rangeMin, oabb.x)
                  const oMax = Math.min(ws.rangeMax, oabb.x + oabb.w)
                  if (oMax > oMin + 1) clipIntervals.push({ min: oMin, max: oMax })
                }
              } else {
                if (ws.fixed > oabb.x + 1 && ws.fixed < oabb.x + oabb.w - 1) {
                  const oMin = Math.max(ws.rangeMin, oabb.y)
                  const oMax = Math.min(ws.rangeMax, oabb.y + oabb.h)
                  if (oMax > oMin + 1) clipIntervals.push({ min: oMin, max: oMax })
                }
              }
            }

            // Subtract clip intervals from the wall range to get visible segments
            let segments = [{ min: ws.rangeMin, max: ws.rangeMax }]
            if (clipIntervals.length > 0) {
              const sorted = [...clipIntervals].sort((a, b) => a.min - b.min)
              const merged = []
              for (const iv of sorted) {
                if (merged.length > 0 && iv.min <= merged[merged.length - 1].max + 0.5) {
                  merged[merged.length - 1].max = Math.max(merged[merged.length - 1].max, iv.max)
                } else {
                  merged.push({ min: iv.min, max: iv.max })
                }
              }
              const result = []
              let cursor = ws.rangeMin
              for (const m of merged) {
                const cMin = Math.max(m.min, ws.rangeMin)
                const cMax = Math.min(m.max, ws.rangeMax)
                if (cMin >= cMax) continue
                if (cMin > cursor + 0.5) result.push({ min: cursor, max: cMin })
                cursor = Math.max(cursor, cMax)
              }
              if (cursor < ws.rangeMax - 0.5) result.push({ min: cursor, max: ws.rangeMax })
              segments = result
            }

            // Draw visible wall line segments
            for (let si = 0; si < segments.length; si++) {
              const seg = segments[si]
              let x1, y1, x2, y2
              if (ws.dir === 'h') {
                x1 = seg.min; y1 = ws.fixed; x2 = seg.max; y2 = ws.fixed
              } else {
                x1 = ws.fixed; y1 = seg.min; x2 = ws.fixed; y2 = seg.max
              }
              // Determine style: hidden walls get ghosted look
              const lineStroke = isHidden ? (wallColor + '40') : wallColor
              const lineDash = isHidden ? [4, 4] : (wallDash.length ? [...wallDash] : undefined)
              const lineWidth = isHidden ? 1 : wallWidth

              fc.add(new fabric.Line([x1, y1, x2, y2], {
                stroke: lineStroke,
                strokeWidth: lineWidth,
                strokeDashArray: lineDash,
                selectable: false,
                evented: false,
                name: WALL_LINE_PREFIX + s.id + '-' + ws.side + '-' + si,
              }))
            }

            // Draw wall extension lines beyond the set boundary
            if (extension > 0 && !isHidden) {
              const lastSeg = segments[segments.length - 1]
              const firstSeg = segments[0]
              if (firstSeg && lastSeg) {
                let ex1, ey1, ex2, ey2, ex3, ey3, ex4, ey4
                if (ws.dir === 'h') {
                  // Extend horizontally: before first segment and after last segment
                  ex1 = firstSeg.min - extension; ey1 = ws.fixed; ex2 = firstSeg.min; ey2 = ws.fixed
                  ex3 = lastSeg.max; ey3 = ws.fixed; ex4 = lastSeg.max + extension; ey4 = ws.fixed
                } else {
                  ex1 = ws.fixed; ey1 = firstSeg.min - extension; ex2 = ws.fixed; ey2 = firstSeg.min
                  ex3 = ws.fixed; ey3 = lastSeg.max; ex4 = ws.fixed; ey4 = lastSeg.max + extension
                }
                // Extension before
                fc.add(new fabric.Line([ex1, ey1, ex2, ey2], {
                  stroke: '#fbbf24', strokeWidth: 2, strokeDashArray: [8, 4],
                  selectable: false, evented: false,
                  name: WALL_LINE_PREFIX + s.id + '-' + ws.side + '-ext-before',
                }))
                // Extension after
                fc.add(new fabric.Line([ex3, ey3, ex4, ey4], {
                  stroke: '#fbbf24', strokeWidth: 2, strokeDashArray: [8, 4],
                  selectable: false, evented: false,
                  name: WALL_LINE_PREFIX + s.id + '-' + ws.side + '-ext-after',
                }))
              }
            }
          }
        }
      }

      // Component icon detail lines (windows, doors, flats, etc.)
      if (s.iconType && s.iconType !== 'rect') {
        const isRotated = (s.rotation || 0) % 180 !== 0
        const iconW = isRotated ? h : w
        const iconH = isRotated ? w : h
        const iconObjects = drawComponentIcon(s.iconType, s, iconW, iconH, ppu, s.componentProperties || {}, viewMode)
        iconObjects.forEach(obj => fc.add(obj))
      }

      // Wall gap zone — per-side dashed outline around set showing access area
      if (s.wallGap && s.wallGap > 0) {
        const gapPx = s.wallGap * ppu
        const isRotated = (s.rotation || 0) % 180 !== 0
        const setW = isRotated ? h : w
        const setH = isRotated ? w : h
        const sides = s.gapSides || { top: true, right: true, bottom: true, left: true }

        // Map sides based on rotation
        let mappedSides = sides
        if (isRotated) {
          const rot = (s.rotation || 0) % 360
          if (rot === 90) mappedSides = { top: sides.left, right: sides.top, bottom: sides.right, left: sides.bottom }
          else if (rot === 270) mappedSides = { top: sides.right, right: sides.bottom, bottom: sides.left, left: sides.top }
        }

        const gapStyle = { fill: '#f59e0b15', stroke: '#f59e0b55', strokeWidth: 1.5, strokeDashArray: [8, 4], selectable: false, evented: false }

        if (mappedSides.top) {
          fc.add(new fabric.Rect({ ...gapStyle, left: s.x, top: s.y - gapPx, width: setW, height: gapPx, name: GAP_PREFIX + s.id + '-top' }))
        }
        if (mappedSides.bottom) {
          fc.add(new fabric.Rect({ ...gapStyle, left: s.x, top: s.y + setH, width: setW, height: gapPx, name: GAP_PREFIX + s.id + '-bottom' }))
        }
        if (mappedSides.left) {
          fc.add(new fabric.Rect({ ...gapStyle, left: s.x - gapPx, top: s.y - (mappedSides.top ? gapPx : 0), width: gapPx, height: setH + (mappedSides.top ? gapPx : 0) + (mappedSides.bottom ? gapPx : 0), name: GAP_PREFIX + s.id + '-left' }))
        }
        if (mappedSides.right) {
          fc.add(new fabric.Rect({ ...gapStyle, left: s.x + setW, top: s.y - (mappedSides.top ? gapPx : 0), width: gapPx, height: setH + (mappedSides.top ? gapPx : 0) + (mappedSides.bottom ? gapPx : 0), name: GAP_PREFIX + s.id + '-right' }))
        }
      }

      // Labels — inline mode only (callout mode renders labels separately below)
      if (labelsVisible && !s.labelHidden && labelMode === 'inline') {
        const labelFontSize = Math.min(12, Math.max(8, w / 8))
        const dimFontSize = Math.min(10, labelFontSize - 1)
        const catHeight = (s.category && s.category !== 'Set') ? 8 : 0
        const totalHeight = labelFontSize + 2 + dimFontSize + (catHeight > 0 ? 2 + catHeight : 0)
        const pos = getLabelPosition({ x: s.x, y: s.y, w, h }, s.labelPosition || 'top-left', totalHeight)

        const label = new fabric.FabricText(s.name, {
          left: pos.left,
          top: pos.top,
          fontSize: labelFontSize,
          fill: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 'bold',
          originX: pos.originX,
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id,
          shadow: new fabric.Shadow({ color: '#000000', blur: 3 }),
        })
        fc.add(label)

        const dimLabel = new fabric.FabricText(`${s.width}x${s.height}`, {
          left: pos.left,
          top: pos.top + labelFontSize + 2,
          fontSize: dimFontSize,
          fill: '#ffffffaa',
          fontFamily: 'system-ui, sans-serif',
          originX: pos.originX,
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id + '-dim',
        })
        fc.add(dimLabel)

        // Category badge for non-Set types
        if (s.category && s.category !== 'Set') {
          const catLabel = new fabric.FabricText(s.category, {
            left: pos.left,
            top: pos.top + labelFontSize + 2 + dimFontSize + 2,
            fontSize: 8,
            fill: '#fbbf24aa',
            fontFamily: 'system-ui, sans-serif',
            originX: pos.originX,
            selectable: false,
            evented: false,
            name: LABEL_PREFIX + s.id + '-cat',
          })
          fc.add(catLabel)
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

    // Callout mode — labels stacked on left or right margin with leader lines
    if (labelsVisible && labelMode !== 'inline') {
      const side = labelMode === 'callout-right' ? 'right' : 'left'
      const canvasW = fc.getWidth()
      const calloutSets = visibleSets.filter(s => !s.labelHidden)
        .map(s => ({ ...s, aabb: getAABB(s, ppu) }))
        .sort((a, b) => a.aabb.y - b.aabb.y)

      const fontSize = 11
      const dimFontSize = 9
      const lineHeight = fontSize + 2 + dimFontSize + 4
      const marginWidth = 160
      const marginPad = 16
      const startY = 20

      // Calculate gap - reduce if too many labels
      let gap = 8
      const totalNeeded = calloutSets.length * lineHeight + (calloutSets.length - 1) * gap
      const canvasH = fc.getHeight()
      if (totalNeeded > canvasH - 40) {
        gap = Math.max(2, (canvasH - 40 - calloutSets.length * lineHeight) / Math.max(1, calloutSets.length - 1))
      }

      calloutSets.forEach((s, i) => {
        const labelY = startY + i * (lineHeight + gap)
        const labelX = side === 'right' ? canvasW - marginPad : marginPad
        const originX = side === 'right' ? 'right' : 'left'

        // Background rect for readability
        const bgWidth = marginWidth
        const bgX = side === 'right' ? canvasW - marginPad - bgWidth : marginPad
        const bg = new fabric.Rect({
          left: bgX,
          top: labelY - 2,
          width: bgWidth,
          height: lineHeight,
          fill: 'rgba(26, 26, 46, 0.85)',
          stroke: s.color + '60',
          strokeWidth: 1,
          rx: 3,
          ry: 3,
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id + '-callout-bg',
        })
        fc.add(bg)

        // Name label
        const nameLabel = new fabric.FabricText(s.name, {
          left: labelX,
          top: labelY,
          fontSize,
          fill: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 'bold',
          originX,
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id + '-callout',
          shadow: new fabric.Shadow({ color: '#000000', blur: 2 }),
        })
        fc.add(nameLabel)

        // Dimensions
        const dimText = `${s.width}x${s.height}${s.category && s.category !== 'Set' ? '  ' + s.category : ''}`
        const dimLabel = new fabric.FabricText(dimText, {
          left: labelX,
          top: labelY + fontSize + 2,
          fontSize: dimFontSize,
          fill: '#ffffffaa',
          fontFamily: 'system-ui, sans-serif',
          originX,
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id + '-callout-dim',
        })
        fc.add(dimLabel)

        // Leader line from label to set center
        const setCenterX = s.aabb.x + s.aabb.w / 2
        const setCenterY = s.aabb.y + s.aabb.h / 2
        const lineStartX = side === 'right' ? canvasW - marginPad - marginWidth : marginPad + marginWidth
        const lineStartY = labelY + lineHeight / 2

        const leaderLine = new fabric.Line(
          [lineStartX, lineStartY, setCenterX, setCenterY],
          {
            stroke: s.color + 'CC',
            strokeWidth: 1,
            strokeDashArray: [4, 3],
            selectable: false,
            evented: false,
            name: LEADER_PREFIX + s.id,
          }
        )
        fc.add(leaderLine)

        // Arrowhead at set end
        const dx = setCenterX - lineStartX
        const dy = setCenterY - lineStartY
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        const arrowSize = 7
        const arrowhead = new fabric.Polygon(
          [
            { x: 0, y: 0 },
            { x: -arrowSize, y: -arrowSize / 2.5 },
            { x: -arrowSize, y: arrowSize / 2.5 },
          ],
          {
            left: setCenterX,
            top: setCenterY,
            originX: 'center',
            originY: 'center',
            angle,
            fill: s.color + 'CC',
            selectable: false,
            evented: false,
            name: LEADER_PREFIX + s.id + '-arrow',
          }
        )
        fc.add(arrowhead)

        // Small dot at label end
        const dot = new fabric.Circle({
          left: lineStartX,
          top: lineStartY,
          radius: 2.5,
          originX: 'center',
          originY: 'center',
          fill: s.color + 'CC',
          selectable: false,
          evented: false,
          name: LEADER_PREFIX + s.id + '-dot',
        })
        fc.add(dot)
      })
    }

    // Draw dimension lines between adjacent sets
    if (showDimensions) {
      for (let i = 0; i < visibleSets.length; i++) {
        const si = visibleSets[i]
        const siAABB = getAABB(si, ppu)

        // Show width and height dimensions for each set
        const dimColor = '#94a3b8'
        const dimFont = Math.max(9, Math.min(12, siAABB.w / 10))

        // Width dimension (bottom)
        const widthText = `${si.width}${unit}`
        const wLabel = new fabric.FabricText(widthText, {
          left: siAABB.x + siAABB.w / 2,
          top: siAABB.y + siAABB.h + 6,
          fontSize: dimFont,
          fill: dimColor,
          fontFamily: 'system-ui, sans-serif',
          originX: 'center',
          selectable: false,
          evented: false,
          name: DIM_PREFIX + si.id + '-w',
        })
        fc.add(wLabel)

        // Width dimension lines
        const wLine = new fabric.Line(
          [siAABB.x, siAABB.y + siAABB.h + 4, siAABB.x + siAABB.w, siAABB.y + siAABB.h + 4],
          {
            stroke: dimColor, strokeWidth: 0.8,
            selectable: false, evented: false,
            name: DIM_PREFIX + si.id + '-wl',
          }
        )
        fc.add(wLine)

        // Height dimension (right)
        const heightText = `${si.height}${unit}`
        const hLabel = new fabric.FabricText(heightText, {
          left: siAABB.x + siAABB.w + 6,
          top: siAABB.y + siAABB.h / 2,
          fontSize: dimFont,
          fill: dimColor,
          fontFamily: 'system-ui, sans-serif',
          originX: 'left',
          originY: 'center',
          selectable: false,
          evented: false,
          name: DIM_PREFIX + si.id + '-h',
        })
        fc.add(hLabel)

        // Height dimension line
        const hLine = new fabric.Line(
          [siAABB.x + siAABB.w + 3, siAABB.y, siAABB.x + siAABB.w + 3, siAABB.y + siAABB.h],
          {
            stroke: dimColor, strokeWidth: 0.8,
            selectable: false, evented: false,
            name: DIM_PREFIX + si.id + '-hl',
          }
        )
        fc.add(hLine)

        // Distance to nearest neighbors
        for (let j = i + 1; j < visibleSets.length; j++) {
          const sj = visibleSets[j]
          const sjAABB = getAABB(sj, ppu)

          // Check horizontal gap (si right to sj left or vice versa)
          const hOverlap = !(siAABB.y + siAABB.h < sjAABB.y || sjAABB.y + sjAABB.h < siAABB.y)
          if (hOverlap) {
            const gapRight = sjAABB.x - (siAABB.x + siAABB.w)
            const gapLeft = siAABB.x - (sjAABB.x + sjAABB.w)
            const gap = gapRight > 2 ? gapRight : gapLeft > 2 ? gapLeft : 0
            if (gap > 2 && gap < 500) {
              const fromX = gapRight > 2 ? siAABB.x + siAABB.w : sjAABB.x + sjAABB.w
              const toX = gapRight > 2 ? sjAABB.x : siAABB.x
              const midY = Math.max(siAABB.y, sjAABB.y) + Math.min(siAABB.y + siAABB.h, sjAABB.y + sjAABB.h)
              const y = midY / 2
              const distFt = Math.round((gap / ppu) * 10) / 10
              const dLine = new fabric.Line([fromX, y, toX, y], {
                stroke: '#f59e0b88', strokeWidth: 1, strokeDashArray: [3, 3],
                selectable: false, evented: false, name: DIM_PREFIX + si.id + '-' + sj.id,
              })
              fc.add(dLine)
              const dLabel = new fabric.FabricText(`${distFt}${unit}`, {
                left: (fromX + toX) / 2, top: y - 12,
                fontSize: 9, fill: '#f59e0b', fontFamily: 'system-ui, sans-serif',
                originX: 'center', selectable: false, evented: false,
                name: DIM_PREFIX + si.id + '-' + sj.id + '-t',
              })
              fc.add(dLabel)
            }
          }
        }
      }
    }

    // Draw building walls
    fc.getObjects()
      .filter(o => o.name?.startsWith(BWALL_PREFIX))
      .forEach(o => fc.remove(o))

    if (buildingWallsVisible) {
      for (const bw of buildingWalls) {
        const thicknessPx = bw.thickness * ppu
        const dx = bw.x2 - bw.x1
        const dy = bw.y2 - bw.y1
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) continue

        const nx = -dy / len * (thicknessPx / 2) // perpendicular normal
        const ny = dx / len * (thicknessPx / 2)

        // Oriented rectangle as polygon
        const points = [
          { x: bw.x1 + nx, y: bw.y1 + ny },
          { x: bw.x2 + nx, y: bw.y2 + ny },
          { x: bw.x2 - nx, y: bw.y2 - ny },
          { x: bw.x1 - nx, y: bw.y1 - ny },
        ]
        const poly = new fabric.Polygon(points, {
          fill: bw.color + '99',
          stroke: bw.color,
          strokeWidth: 2,
          selectable: false,
          evented: false,
          name: BWALL_PREFIX + bw.id,
        })
        fc.add(poly)

        // Length label at midpoint
        if (labelsVisible) {
          const lengthFt = len / ppu
          if (lengthFt > 0.5) {
            const midX = (bw.x1 + bw.x2) / 2
            const midY = (bw.y1 + bw.y2) / 2
            const label = new fabric.FabricText(
              `${Math.round(lengthFt * 10) / 10}${unit}`,
              {
                left: midX, top: midY - 10,
                fontSize: 9, fill: '#ffffff',
                fontFamily: 'system-ui, sans-serif',
                originX: 'center',
                selectable: false, evented: false,
                name: BWALL_PREFIX + bw.id + '-label',
                shadow: new fabric.Shadow({ color: '#000000', blur: 3 }),
              }
            )
            fc.add(label)
          }
        }
      }
    }

    // Draw drawing-in-progress points
    fc.getObjects()
      .filter(o => o.name === DRAWING_POINT_NAME)
      .forEach(o => fc.remove(o))

    if (drawingMode === 'building-wall') {
      for (const pt of drawingWallPoints) {
        const dot = new fabric.Circle({
          left: pt.x - 4, top: pt.y - 4,
          radius: 4,
          fill: '#EF4444',
          stroke: '#ffffff', strokeWidth: 2,
          selectable: false, evented: false,
          name: DRAWING_POINT_NAME,
        })
        fc.add(dot)
      }
    }

    // Draw annotations (text labels)
    for (const anno of annotations) {
      const text = new fabric.FabricText(anno.text, {
        left: anno.x,
        top: anno.y,
        fontSize: anno.fontSize || 14,
        fill: anno.color || '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 'bold',
        angle: anno.rotation || 0,
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: true,
        borderColor: '#6366F1',
        hoverCursor: 'move',
        name: ANNO_PREFIX + anno.id,
        shadow: new fabric.Shadow({ color: '#000000', blur: 4 }),
      })

      if (anno.bgColor) {
        const bgRect = new fabric.Rect({
          left: anno.x - 4,
          top: anno.y - 2,
          width: text.width + 8,
          height: (anno.fontSize || 14) + 4,
          fill: anno.bgColor,
          rx: 3, ry: 3,
          selectable: false,
          evented: false,
          name: ANNO_PREFIX + anno.id + '-bg',
        })
        fc.add(bgRect)
      }

      text.on('modified', function () {
        updateAnnotation(anno.id, { x: this.left, y: this.top })
      })
      text.on('mousedblclick', function () {
        const newText = prompt('Edit annotation text:', anno.text)
        if (newText !== null) updateAnnotation(anno.id, { text: newText })
      })

      fc.add(text)
    }

    fc.requestRenderAll()
  }, [sets, rules, pixelsPerUnit, selectedSetId, snapToGrid, snapToSets, gridSize, labelsVisible, labelMode, showOverlaps, viewMode, layerVisibility, showDimensions, annotations, buildingWalls, buildingWallsVisible, drawingMode, drawingWallPoints, showLockIndicators, hideAllSets])

  useEffect(() => {
    syncSets()
  }, [syncSets])

  // Building wall drawing mode — click to place points
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || drawingMode !== 'building-wall') return

    const onClick = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) return // pan
      if (opt.e.button !== 0) return // left click only

      const pointer = fc.getScenePoint(opt.e)
      let x = pointer.x, y = pointer.y

      // Grid snap
      if (snapToGrid) {
        x = Math.round(x / gridSize) * gridSize
        y = Math.round(y / gridSize) * gridSize
      }

      const state = useStore.getState()
      const pts = state.drawingWallPoints
      const snap = state.drawingWallSnap

      // Angle constraint: Shift constrains to 0/45/90° increments from previous point
      if (pts.length > 0) {
        const prev = pts[pts.length - 1]
        const dx = x - prev.x, dy = y - prev.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 2) {
          if (opt.e.shiftKey) {
            // Constrain to 45° increments
            const angle = Math.atan2(dy, dx)
            const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
            x = prev.x + Math.cos(snapped) * dist
            y = prev.y + Math.sin(snapped) * dist
          } else if (snap) {
            // Auto-constrain to H/V if close (within 15°) — only when snap enabled
            const angle = Math.abs(Math.atan2(dy, dx))
            if (angle < Math.PI / 12 || angle > 11 * Math.PI / 12) {
              y = prev.y // horizontal
            } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 12) {
              x = prev.x // vertical
            }
          }
        }
      }

      addDrawingPoint({ x, y })
    }

    // Double-click breaks the chain (stay in drawing mode, start fresh)
    const onDblClick = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) return
      breakDrawingChain()
    }

    fc.on('mouse:down', onClick)
    fc.on('mouse:dblclick', onDblClick)
    return () => {
      fc.off('mouse:down', onClick)
      fc.off('mouse:dblclick', onDblClick)
    }
  }, [drawingMode, snapToGrid, gridSize, addDrawingPoint, breakDrawingChain])

  // Building wall drawing mode — rubber-band preview line
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || drawingMode !== 'building-wall' || drawingWallPoints.length === 0) return

    const onMove = (opt) => {
      // Remove old preview
      fc.getObjects().filter(o => o.name === DRAWING_PREVIEW_NAME).forEach(o => fc.remove(o))

      const pointer = fc.getScenePoint(opt.e)
      let x = pointer.x, y = pointer.y

      // Grid snap
      if (snapToGrid) {
        x = Math.round(x / gridSize) * gridSize
        y = Math.round(y / gridSize) * gridSize
      }

      const state = useStore.getState()
      const pts = state.drawingWallPoints
      const snap = state.drawingWallSnap
      if (pts.length === 0) return
      const lastPt = pts[pts.length - 1]
      const dx = x - lastPt.x, dy = y - lastPt.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 2) {
        if (opt.e.shiftKey) {
          const angle = Math.atan2(dy, dx)
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
          x = lastPt.x + Math.cos(snapped) * dist
          y = lastPt.y + Math.sin(snapped) * dist
        } else if (snap) {
          const angle = Math.abs(Math.atan2(dy, dx))
          if (angle < Math.PI / 12 || angle > 11 * Math.PI / 12) {
            y = lastPt.y
          } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 12) {
            x = lastPt.x
          }
        }
      }

      const preview = new fabric.Line([lastPt.x, lastPt.y, x, y], {
        stroke: '#8B4513',
        strokeWidth: 3,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        name: DRAWING_PREVIEW_NAME,
        opacity: 0.7,
      })
      fc.add(preview)
      fc.requestRenderAll()
    }

    fc.on('mouse:move', onMove)
    return () => {
      fc.off('mouse:move', onMove)
      const fcc = fabricRef.current
      if (fcc) {
        fcc.getObjects().filter(o => o.name === DRAWING_PREVIEW_NAME).forEach(o => fcc.remove(o))
        fcc.requestRenderAll()
      }
    }
  }, [drawingMode, drawingWallPoints, snapToGrid, gridSize])

  // Pan canvas to center on newly selected set
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || !selectedSetId) return
    const s = sets.find(s => s.id === selectedSetId)
    if (!s || s.onPlan === false || s.hidden) return

    const ppu = pixelsPerUnit
    const w = s.width * ppu
    const h = s.height * ppu
    const isRotated = (s.rotation || 0) % 180 !== 0
    const sw = isRotated ? h : w
    const sh = isRotated ? w : h

    // Centre of the set in canvas coordinates
    const cx = s.x + sw / 2
    const cy = s.y + sh / 2

    // Check if the set centre is already visible in the viewport
    const zoom = fc.getZoom()
    const vpt = fc.viewportTransform
    const canvasW = fc.getWidth()
    const canvasH = fc.getHeight()

    // Convert set centre to screen coordinates
    const screenX = cx * zoom + vpt[4]
    const screenY = cy * zoom + vpt[5]

    // Only pan if the set is outside a generous visible margin (20% inset)
    const margin = 0.2
    const inView = screenX > canvasW * margin && screenX < canvasW * (1 - margin)
      && screenY > canvasH * margin && screenY < canvasH * (1 - margin)

    if (!inView) {
      // Pan so the set is centred
      const targetVptX = canvasW / 2 - cx * zoom
      const targetVptY = canvasH / 2 - cy * zoom
      vpt[4] = targetVptX
      vpt[5] = targetVptY
      fc.setViewportTransform(vpt)
      fc.requestRenderAll()
    }
  }, [selectedSetId])

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

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip when typing in input fields
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const state = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // Copy selected set
        if (state.selectedSetId) {
          e.preventDefault()
          copySet(state.selectedSetId)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Paste
        if (state._clipboard) {
          e.preventDefault()
          pasteSet()
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        // Duplicate
        if (state.selectedSetId) {
          e.preventDefault()
          duplicateSet(state.selectedSetId)
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected set
        if (state.selectedSetId) {
          e.preventDefault()
          deleteSet(state.selectedSetId)
        }
      } else if (e.key === 'Escape') {
        if (state.drawingMode) {
          e.preventDefault()
          cancelDrawing()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, copySet, pasteSet, duplicateSet, deleteSet, cancelDrawing])

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-900">
      <canvas ref={canvasRef} />
      {calibrating && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10">
          Click two points on the floor plan to calibrate scale
          ({calibrationPoints.length}/2 points selected)
        </div>
      )}
      {drawingMode === 'building-wall' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10 flex items-center gap-3">
          <span>Drawing Building Walls</span>
          <span className="text-amber-200 text-xs">Click=place · Dbl-click=break chain · Shift=45° · Esc=done</span>
          <button
            onClick={cancelDrawing}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded text-xs"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
