import { useEffect, useRef, useCallback, useState } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'
import { getAABB, getOverlapRect, buildCutPolygon, getLabelPosition } from '../engine/geometry.js'
import { drawComponentIcon, ICON_PREFIX } from '../engine/componentIcons.js'
import { autoLayout } from '../engine/autoLayout.js'
import { getComponentClearance } from '../engine/scoring.js'

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
const BCOL_PREFIX = 'building-col-'
const DRAWING_PREVIEW_NAME = 'drawing-preview'
const DRAWING_POINT_NAME = 'drawing-point'
const EXCL_PREFIX = 'exclusion-zone-'
const CLEAR_PREFIX = 'clearance-'

// Helper: creates selection decorations (wall gaps, FIXED icons, rotation label) on the canvas
function addSelectionDecorations(fc, s, ppu, rules) {
  if (!s) return
  const w = s.width * ppu
  const h = s.height * ppu

  // Wall gap zones
  if (s.wallGap && s.wallGap > 0) {
    const gapPx = s.wallGap * ppu
    const isRotated = (s.rotation || 0) % 180 !== 0
    const setW = isRotated ? h : w
    const setH = isRotated ? w : h
    const sides = s.gapSides || { top: true, right: true, bottom: true, left: true }
    let mappedSides = sides
    if (isRotated) {
      const rot = (s.rotation || 0) % 360
      if (rot === 90) mappedSides = { top: sides.left, right: sides.top, bottom: sides.right, left: sides.bottom }
      else if (rot === 270) mappedSides = { top: sides.right, right: sides.bottom, bottom: sides.left, left: sides.top }
    }
    const gapStyle = { fill: '#f59e0b08', stroke: '#f59e0b33', strokeWidth: 1, strokeDashArray: [6, 4], selectable: false, evented: false }
    if (mappedSides.top) fc.add(new fabric.Rect({ ...gapStyle, left: s.x, top: s.y - gapPx, width: setW, height: gapPx, name: GAP_PREFIX + s.id + '-top' }))
    if (mappedSides.bottom) fc.add(new fabric.Rect({ ...gapStyle, left: s.x, top: s.y + setH, width: setW, height: gapPx, name: GAP_PREFIX + s.id + '-bottom' }))
    if (mappedSides.left) fc.add(new fabric.Rect({ ...gapStyle, left: s.x - gapPx, top: s.y - (mappedSides.top ? gapPx : 0), width: gapPx, height: setH + (mappedSides.top ? gapPx : 0) + (mappedSides.bottom ? gapPx : 0), name: GAP_PREFIX + s.id + '-left' }))
    if (mappedSides.right) fc.add(new fabric.Rect({ ...gapStyle, left: s.x + setW, top: s.y - (mappedSides.top ? gapPx : 0), width: gapPx, height: setH + (mappedSides.top ? gapPx : 0) + (mappedSides.bottom ? gapPx : 0), name: GAP_PREFIX + s.id + '-right' }))
  }

  // FIXED rule indicators
  if (rules) {
    for (const rule of rules) {
      if (rule.type !== 'FIXED' || rule.setA !== s.id) continue
      fc.add(new fabric.FabricText('\u{1F512}', {
        left: s.x + s.width * ppu - 16, top: s.y + 2,
        fontSize: 12, selectable: false, evented: false,
        name: RULE_PREFIX + rule.id + '-icon',
      }))
    }
  }

  // Rotation indicator
  const rot = s.rotation || 0
  if (rot !== 0) {
    const rad = rot * Math.PI / 180
    const cosR = Math.cos(rad), sinR = Math.sin(rad)
    const brX = s.x + w * cosR - h * sinR
    const brY = s.y + w * sinR + h * cosR
    fc.add(new fabric.FabricText(`${rot}\u00B0`, {
      left: brX - 16 * cosR, top: brY - 16 * sinR,
      fontSize: 8, fill: '#fbbf24cc',
      fontFamily: 'Arial, Helvetica, sans-serif',
      originX: 'center', originY: 'center',
      selectable: false, evented: false,
      name: LABEL_PREFIX + s.id + '-rot',
    }))
  }
}

export default function FloorCanvas({ onCanvasSize }) {
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const containerRef = useRef(null)
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const snapLinesRef = useRef([])
  const labelRefsMap = useRef({})  // setId -> [fabric label objects] for O(1) drag lookup
  const shapeRefsMap = useRef({})  // setId -> fabric shape object for O(1) selection updates
  const prevSelectedRef = useRef(null)  // track previous selectedSetId for in-place deselection
  const [zoomLevel, setZoomLevel] = useState(100)

  // --- Zoom control functions ---
  const zoomTo = useCallback((newZoom, centerPoint) => {
    const fc = fabricRef.current
    if (!fc) return
    const clamped = Math.min(Math.max(newZoom, 0.05), 20)
    if (centerPoint) {
      fc.zoomToPoint(centerPoint, clamped)
    } else {
      // Zoom to center of viewport
      fc.zoomToPoint(new fabric.Point(fc.getWidth() / 2, fc.getHeight() / 2), clamped)
    }
    setZoomLevel(Math.round(clamped * 100))
    fc.requestRenderAll()
  }, [])

  const zoomIn = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    zoomTo(fc.getZoom() * 1.3)
  }, [zoomTo])

  const zoomOut = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    zoomTo(fc.getZoom() / 1.3)
  }, [zoomTo])

  const zoomReset = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    // Reset viewport transform to identity
    fc.setViewportTransform([1, 0, 0, 1, 0, 0])
    setZoomLevel(100)
    fc.requestRenderAll()
  }, [])

  const fitAll = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    const state = useStore.getState()
    const allSets = state.sets.filter(s => s.onPlan !== false && !s.hidden)
    const ppu = state.pixelsPerUnit
    const bwalls = state.buildingWalls || []

    if (allSets.length === 0 && bwalls.length === 0) {
      // Nothing to fit — just reset
      zoomReset()
      return
    }

    // Calculate bounding box of ALL content (sets + building walls)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const s of allSets) {
      const w = s.width * ppu
      const h = s.height * ppu
      const isRotated = (s.rotation || 0) % 180 !== 0
      const sw = isRotated ? h : w
      const sh = isRotated ? w : h
      minX = Math.min(minX, s.x)
      minY = Math.min(minY, s.y)
      maxX = Math.max(maxX, s.x + sw)
      maxY = Math.max(maxY, s.y + sh)
    }

    for (const bw of bwalls) {
      minX = Math.min(minX, bw.x1, bw.x2)
      minY = Math.min(minY, bw.y1, bw.y2)
      maxX = Math.max(maxX, bw.x1, bw.x2)
      maxY = Math.max(maxY, bw.y1, bw.y2)
    }

    let contentW = maxX - minX
    let contentH = maxY - minY
    // If all sets overlap at the same position, expand bounding box so we don't bail out
    if (contentW < 1) { minX -= 200; maxX += 200; contentW = maxX - minX }
    if (contentH < 1) { minY -= 200; maxY += 200; contentH = maxY - minY }

    // Fit with 10% padding
    const canvasW = fc.getWidth()
    const canvasH = fc.getHeight()
    const padding = 0.1
    const scaleX = (canvasW * (1 - padding * 2)) / contentW
    const scaleY = (canvasH * (1 - padding * 2)) / contentH
    const zoom = Math.min(scaleX, scaleY, 20) // don't exceed max zoom

    // Center the content
    const centerX = minX + contentW / 2
    const centerY = minY + contentH / 2
    const vpCenterX = canvasW / 2
    const vpCenterY = canvasH / 2

    fc.setViewportTransform([zoom, 0, 0, zoom, vpCenterX - centerX * zoom, vpCenterY - centerY * zoom])
    setZoomLevel(Math.round(zoom * 100))
    fc.requestRenderAll()
  }, [zoomReset])

  const {
    pdfImage, pdfRotation, pdfPosition, setPdfPosition,
    pdfScale, setPdfScale, pdfOriginalSize,
    pdfLayers, updatePdfLayer,
    pixelsPerUnit, setPixelsPerUnit,
    gridVisible, snapToGrid, snapToSets, gridSize,
    labelsVisible, labelMode, labelFontSize: globalLabelFontSize, labelColor: globalLabelColor, showOverlaps,
    sets, addSet, updateSet, selectedSetId, setSelectedSetId, deleteSet,
    rules,
    calibrating, setCalibrating, addCalibrationPoint, calibrationPoints,
    unit, viewMode,
    undo, redo,
    annotations, updateAnnotation,
    layerVisibility, showDimensions, dimMode,
    showHoverTooltips, showLockIndicators, hideAllSets,
    showClearance, exclusionZones,
    copySet, pasteSet, duplicateSet,
    buildingWalls, buildingWallsVisible,
    buildingColumns, buildingColumnsVisible,
    updateBuildingColumn, selectedBuildingColumnId, setSelectedBuildingColumnId,
    duplicateBuildingColumn, addBuildingColumn, columnPlacementTemplate,
    componentPlacementTemplate,
    drawingMode, drawingWallPoints, addDrawingPoint, cancelDrawing,
    breakDrawingChain, drawingWallSnap,
    pendingFitAll,
  } = useStore()

  // Auto-fit after project import
  useEffect(() => {
    if (pendingFitAll && fabricRef.current) {
      useStore.setState({ pendingFitAll: false })
      // Delay to let syncSets run first
      setTimeout(() => {
        const state = useStore.getState()
        const visibleSets = state.sets.filter(s => s.onPlan !== false && !s.hidden)
        if (visibleSets.length > 1) {
          const xs = new Set(visibleSets.map(s => Math.round(s.x)))
          const ys = new Set(visibleSets.map(s => Math.round(s.y)))
          if (xs.size <= 1 && ys.size <= 1) {
            const fc = fabricRef.current
            const result = autoLayout(state.sets, state.rules || [], state.pixelsPerUnit, fc.getWidth(), fc.getHeight())
            useStore.getState().setSets(result)
            setTimeout(() => fitAll(), 150)
            return
          }
        }
        fitAll()
      }, 100)
    }
  }, [pendingFitAll, fitAll])

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

    // Auto-fit on first load (deferred so syncSets runs first)
    const fitTimer = setTimeout(() => {
      const state = useStore.getState()
      const visibleSets = state.sets.filter(s => s.onPlan !== false && !s.hidden)
      if (visibleSets.length > 1) {
        // Detect if all sets are stacked at (nearly) the same position
        const xs = new Set(visibleSets.map(s => Math.round(s.x)))
        const ys = new Set(visibleSets.map(s => Math.round(s.y)))
        if (xs.size <= 1 && ys.size <= 1) {
          // All stacked — auto-layout first, then fit
          const result = autoLayout(state.sets, state.rules || [], state.pixelsPerUnit, fc.getWidth(), fc.getHeight())
          useStore.getState().setSets(result)
          setTimeout(() => fitAll(), 150)
        } else {
          fitAll()
        }
      } else if (visibleSets.length === 1 || (state.buildingWalls || []).length > 0) {
        fitAll()
      }
    }, 200)

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
      clearTimeout(fitTimer)
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
      zoom = Math.min(Math.max(zoom, 0.05), 20)
      fc.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom)
      setZoomLevel(Math.round(zoom * 100))
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
        fontFamily: 'Arial, Helvetica, sans-serif',
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

  // Track which PDF layers are on canvas by ID, so we only add/remove what changed
  const pdfFabricRefs = useRef({}) // { [layerId]: fabricImageObj }

  // Compute a structural key: only changes when layers are added, removed, or visibility/opacity/image changes
  // Position and scale changes from dragging should NOT trigger a full rebuild
  const pdfStructureKey = pdfLayers.map(l => `${l.id}:${l.visible}:${l.opacity}:${l.image ? 1 : 0}:${l.zOrder || 'back'}:${l.flipX ? 1 : 0}:${l.flipY ? 1 : 0}`).join('|')

  // Draw PDF layers — only rebuilds when structure changes, not on every drag
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const currentIds = new Set(pdfLayers.filter(l => l.visible).map(l => l.id))
    const renderedIds = new Set(Object.keys(pdfFabricRefs.current).map(Number))

    // Remove layers no longer visible or deleted
    for (const id of renderedIds) {
      if (!currentIds.has(id)) {
        const obj = pdfFabricRefs.current[id]
        if (obj) fc.remove(obj)
        delete pdfFabricRefs.current[id]
      }
    }

    if (pdfLayers.length === 0) {
      pdfFabricRefs.current = {}
      fc.requestRenderAll()
      return
    }

    // Update existing layers' properties (non-destructive)
    for (const layer of pdfLayers.filter(l => l.visible)) {
      const existing = pdfFabricRefs.current[layer.id]
      if (existing) {
        existing.set({
          opacity: layer.opacity,
          flipX: !!layer.flipX,
          flipY: !!layer.flipY,
          scaleX: layer.scaleX || layer.scale,
          scaleY: layer.scaleY || layer.scale,
        })
        existing.setCoords()
      }
    }

    // Add new layers that aren't on canvas yet
    const layersToAdd = pdfLayers.filter(l => l.visible && !pdfFabricRefs.current[l.id])
    let loaded = 0

    if (layersToAdd.length === 0) {
      fc.requestRenderAll()
      return
    }

    layersToAdd.forEach((layer) => {
      fabric.FabricImage.fromURL(layer.image).then((fImg) => {
        // Guard: check we haven't been superseded
        if (pdfFabricRefs.current[layer.id]) {
          fc.remove(pdfFabricRefs.current[layer.id])
        }

        fImg.set({
          left: layer.position.x,
          top: layer.position.y,
          angle: layer.rotation,
          flipX: !!layer.flipX,
          flipY: !!layer.flipY,
          scaleX: layer.scaleX || layer.scale,
          scaleY: layer.scaleY || layer.scale,
          selectable: true,
          evented: true,
          name: `pdf-bg-${layer.id}`,
          opacity: layer.opacity,
          hasControls: true,
          hasBorders: true,
          borderColor: '#6366F1',
          borderDashArray: [5, 5],
          lockRotation: true,
          lockUniScaling: false,
          cornerColor: '#6366F1',
          cornerStyle: 'circle',
          cornerSize: 10,
          transparentCorners: false,
        })
        // Hide rotation handle — keep mid-point handles for non-proportional scaling
        const c = fImg.controls
        if (c) {
          delete c.mtr
        }

        const layerId = layer.id
        fImg.on('modified', function () {
          const newPos = { x: this.left, y: this.top }
          const newScaleX = this.scaleX
          const newScaleY = this.scaleY
          const currentLayer = useStore.getState().pdfLayers.find(l => l.id === layerId)

          if (currentLayer && currentLayer.lockedToSetId) {
            // Locked to a set — recalculate offset relative to parent set
            const parentSet = useStore.getState().sets.find(s => s.id === currentLayer.lockedToSetId)
            if (parentSet) {
              updatePdfLayer(layerId, {
                position: newPos,
                scale: newScaleX, scaleX: newScaleX, scaleY: newScaleY,
                lockedToSetOffset: { dx: newPos.x - parentSet.x, dy: newPos.y - parentSet.y },
              })
            } else {
              updatePdfLayer(layerId, { position: newPos, scale: newScaleX, scaleX: newScaleX, scaleY: newScaleY })
            }
          } else {
            // Free-floating — only the MASTER (first) PDF moves locked walls/sets
            const masterLayerId = useStore.getState().pdfLayers[0]?.id
            if (layerId === masterLayerId) {
              setPdfPosition(newPos)
              setPdfScale(newScaleX)
              // Visually move overlay PDFs pinned to sets that just moved
              const movedState = useStore.getState()
              const pinnedLayers = movedState.pdfLayers.filter(l => l.lockedToSetId)
              for (const pl of pinnedLayers) {
                const fObj = pdfFabricRefs.current[pl.id]
                if (fObj) {
                  fObj.set({ left: pl.position.x, top: pl.position.y })
                  fObj.setCoords()
                }
              }
            }
            updatePdfLayer(layerId, { position: newPos, scale: newScaleX, scaleX: newScaleX, scaleY: newScaleY })
          }
        })

        // Also remove any stray canvas objects with this name
        const stray = fc.getObjects().find(o => o.name === `pdf-bg-${layerId}`)
        if (stray) fc.remove(stray)

        pdfFabricRefs.current[layerId] = fImg
        fc.add(fImg)

        loaded++
        if (loaded === layersToAdd.length) {
          // All PDF layers loaded — now set correct z-order:
          // Master plan (pdfLayers[0]) at the very bottom,
          // 'back' overlays above master but below sets,
          // 'front' overlays stay on top of everything.
          const allLayers = useStore.getState().pdfLayers.filter(l => l.visible)
          const masterLayerId = allLayers[0]?.id

          // First: send 'back' overlays to back (above master, below sets)
          for (const l of allLayers) {
            if (l.id === masterLayerId) continue // skip master for now
            if ((l.zOrder || 'back') === 'back') {
              const obj = pdfFabricRefs.current[l.id]
              if (obj) fc.sendObjectToBack(obj)
            }
          }
          // Then: send master to the very bottom (behind all overlays)
          const masterObj = pdfFabricRefs.current[masterLayerId]
          if (masterObj) fc.sendObjectToBack(masterObj)

          fc.requestRenderAll()
        }
      }).catch((err) => {
        console.error(`Failed to load PDF layer ${layer.name}:`, err)
        loaded++
      })
    })
  }, [pdfStructureKey])

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

    // Keep PDF layers behind grid
    fc.getObjects().filter(o => o.name && o.name.startsWith('pdf-bg')).forEach(o => fc.sendObjectToBack(o))

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

    // Remove old set objects, rule lines, gap zones, snap lines
    // (overlaps, dimensions, annotations, building walls/columns managed by separate effects)
    labelRefsMap.current = {}  // Clear label cache — will be rebuilt below
    shapeRefsMap.current = {}  // Clear shape cache — will be rebuilt below
    fc.getObjects()
      .filter(o =>
        o.name?.startsWith(SET_PREFIX) ||
        o.name?.startsWith(LABEL_PREFIX) ||
        o.name?.startsWith(RULE_PREFIX) ||
        o.name?.startsWith(CUTAWAY_PREFIX) ||
        o.name?.startsWith(GAP_PREFIX) ||
        o.name?.startsWith(WALL_LINE_PREFIX) ||
        o.name?.startsWith(LEADER_PREFIX) ||
        o.name?.startsWith(ICON_PREFIX) ||
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

    // --- Auto-cut: windows/doors automatically cut openings into overlapping sets ---
    const AUTOCUT_CATS = ['Window', 'Door']
    const autoCutMap = {} // setId -> [cutout, ...]
    const cutterItems = visibleSets.filter(s => AUTOCUT_CATS.includes(s.category) && !s.noCut)
    const parentCandidates = visibleSets.filter(s => !AUTOCUT_CATS.includes(s.category) && s.category !== 'Wall' && !s.noCut)

    for (const comp of cutterItems) {
      const cRot = (comp.rotation || 0) % 180 !== 0
      const cw = cRot ? comp.height * ppu : comp.width * ppu
      const ch = cRot ? comp.width * ppu : comp.height * ppu

      for (const parent of parentCandidates) {
        if (parent.id === comp.id) continue
        const pRot = (parent.rotation || 0) % 180 !== 0
        const pw = pRot ? parent.height * ppu : parent.width * ppu
        const ph = pRot ? parent.width * ppu : parent.height * ppu

        // AABB overlap check
        const ox1 = Math.max(comp.x, parent.x)
        const oy1 = Math.max(comp.y, parent.y)
        const ox2 = Math.min(comp.x + cw, parent.x + pw)
        const oy2 = Math.min(comp.y + ch, parent.y + ph)

        if (ox2 <= ox1 || oy2 <= oy1) continue // no overlap

        // Convert overlap to parent's local coordinate space (in ft)
        const dx = (ox1 - parent.x) / ppu
        const dy = (oy1 - parent.y) / ppu
        const ow = (ox2 - ox1) / ppu
        const oh = (oy2 - oy1) / ppu
        if (ow < 0.1 || oh < 0.1) continue

        const rot = (parent.rotation || 0) % 360
        let cutout
        switch (rot) {
          case 0:   cutout = { x: dx, y: dy, w: ow, h: oh }; break
          case 90:  cutout = { x: dy, y: parent.height - dx - ow, w: oh, h: ow }; break
          case 180: cutout = { x: parent.width - dx - ow, y: parent.height - dy - oh, w: ow, h: oh }; break
          case 270: cutout = { x: parent.width - dy - oh, y: dx, w: oh, h: ow }; break
          default:  cutout = { x: dx, y: dy, w: ow, h: oh }
        }
        if (!autoCutMap[parent.id]) autoCutMap[parent.id] = []
        autoCutMap[parent.id].push(cutout)
      }
    }

    for (const s of visibleSets) {
      const w = s.width * ppu
      const h = s.height * ppu
      // Selection state NOT used for shapes/labels here — applied by separate selection effect
      const isLocked = s.lockedToPdf || !!s.lockedToSetId
      const showLockVis = (s.lockedToPdf && showLockIndicators) // amber visual for PDF lock
      const allCutouts = [...(s.cutouts || []), ...(autoCutMap[s.id] || [])]
      const hasCutouts = allCutouts.length > 0
      const setOpacity = s.opacity ?? 1

      // Compute fill alpha based on opacity and lock state
      const fillAlpha = isLocked ? Math.round(setOpacity * 0x55).toString(16).padStart(2, '0')
        : Math.round(setOpacity * 0x40).toString(16).padStart(2, '0')

      // Always render in non-selected style — selection effect applies highlights
      const baseStroke = showLockVis ? '#f59e0b' : s.lockedToSetId ? '#8B5CF6' : s.color

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

        const localPoints = buildCutPolygon(s.width, s.height, allCutouts)
        const pixelPoints = localPoints.map(p => ({ x: p.x * ppu, y: p.y * ppu }))
        shape = new fabric.Polygon(pixelPoints, {
          left: s.x,
          top: s.y,
          fill: s.color + fillAlpha,
          stroke: baseStroke,
          strokeWidth: 2,
          strokeDashArray: showLockVis ? [6, 3] : [],
          angle: s.rotation || 0,
          flipX: !!s.flipX,
          flipY: !!s.flipY,
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
          stroke: baseStroke,
          strokeWidth: 2,
          strokeDashArray: showLockVis ? [6, 3] : [],
          angle: s.rotation || 0,
          flipX: !!s.flipX,
          flipY: !!s.flipY,
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
      shapeRefsMap.current[s.id] = shape  // Cache for O(1) selection updates

      if (!isLocked) {
        const isPolygon = hasCutouts

        // PRE-COMPUTE snap targets and wall collision boxes (once, not per frame)
        const otherSnapTargets = visibleSets.filter(o => o.id !== s.id).map(o => {
          const aabb = getAABB(o, ppu)
          return { left: aabb.x, right: aabb.x + aabb.w, top: aabb.y, bottom: aabb.y + aabb.h }
        })

        const wallCollisionBoxes = (useStore.getState().buildingWalls || []).map(bw => {
          const thk = bw.thickness * ppu
          const wdx = bw.x2 - bw.x1, wdy = bw.y2 - bw.y1
          const wlen = Math.sqrt(wdx * wdx + wdy * wdy)
          if (wlen < 1) return null
          const wnx = -wdy / wlen * (thk / 2), wny = wdx / wlen * (thk / 2)
          return {
            left: Math.min(bw.x1 + wnx, bw.x1 - wnx, bw.x2 + wnx, bw.x2 - wnx),
            right: Math.max(bw.x1 + wnx, bw.x1 - wnx, bw.x2 + wnx, bw.x2 - wnx),
            top: Math.min(bw.y1 + wny, bw.y1 - wny, bw.y2 + wny, bw.y2 - wny),
            bottom: Math.max(bw.y1 + wny, bw.y1 - wny, bw.y2 + wny, bw.y2 - wny),
          }
        }).filter(Boolean)

        // Pre-compute children locked to this set (for moving with parent)
        const childComponents = visibleSets.filter(c => c.lockedToSetId === s.id)

        // Pre-compute group membership for group drag
        const curGroups = useStore.getState().groups
        const parentGroup = curGroups.find(g => g.setIds.includes(s.id))
        const groupSiblingIds = parentGroup ? parentGroup.setIds.filter(sid => sid !== s.id) : []
        // Pre-compute sibling children for group drag
        const siblingChildren = {}
        for (const sid of groupSiblingIds) {
          siblingChildren[sid] = visibleSets.filter(c => c.lockedToSetId === sid)
        }

        shape.on('moving', function () {
          // Skip if being moved by group drag from another shape
          if (this._isBeingDraggedByGroup) return

          // Get raw Fabric.js position (works for both rotated and unrotated)
          const rawLeft = isPolygon ? this.left + this.pathOffset.x : this.left
          const rawTop = isPolygon ? this.top + this.pathOffset.y : this.top

          // Dead zone — don't snap until dragged 3px from start (in Fabric.js space)
          if (!this._dragStartPos) {
            this._dragStartPos = { x: rawLeft, y: rawTop }
          }
          const distFromStart = Math.sqrt((rawLeft - this._dragStartPos.x) ** 2 + (rawTop - this._dragStartPos.y) ** 2)
          const pastDeadZone = distFromStart > 3

          // Compute logical AABB from current Fabric.js position (rotation-safe)
          const currentAABB = getAABB({ ...s, x: rawLeft, y: rawTop }, ppu)
          let x = currentAABB.x  // logical AABB top-left
          let y = currentAABB.y

          let wasSnapped = false

          // Grid snapping (in logical AABB space)
          if (pastDeadZone && snapToGrid) {
            x = Math.round(x / gridSize) * gridSize
            y = Math.round(y / gridSize) * gridSize
            wasSnapped = true
          }

          // Edge snapping to other sets (using pre-computed AABBs — all in logical space)
          clearSnapLines()
          let foundSnapX = false, foundSnapY = false
          if (pastDeadZone && snapToSets && otherSnapTargets.length > 0) {
            const SNAP_THRESHOLD = 5
            const myEdges = {
              left: x, right: x + currentAABB.w,
              top: y, bottom: y + currentAABB.h,
            }

            let snapDx = 0, snapDy = 0

            for (const oEdges of otherSnapTargets) {
              // Snap X edges
              if (!foundSnapX) {
                const xPairs = [
                  [myEdges.left, oEdges.left], [myEdges.left, oEdges.right],
                  [myEdges.right, oEdges.left], [myEdges.right, oEdges.right],
                ]
                for (const [myE, oE] of xPairs) {
                  if (Math.abs(myE - oE) < SNAP_THRESHOLD) {
                    const candidateX = x + (oE - myE)
                    // If grid snap active, only accept edge snap if it aligns with grid
                    if (snapToGrid && Math.abs(candidateX - Math.round(candidateX / gridSize) * gridSize) > 1) continue
                    snapDx = oE - myE
                    foundSnapX = true
                    drawSnapLine(oE, Math.min(myEdges.top, oEdges.top) - 20, oE, Math.max(myEdges.bottom, oEdges.bottom) + 20)
                    break
                  }
                }
              }
              // Snap Y edges
              if (!foundSnapY) {
                const yPairs = [
                  [myEdges.top, oEdges.top], [myEdges.top, oEdges.bottom],
                  [myEdges.bottom, oEdges.top], [myEdges.bottom, oEdges.bottom],
                ]
                for (const [myE, oE] of yPairs) {
                  if (Math.abs(myE - oE) < SNAP_THRESHOLD) {
                    const candidateY = y + (oE - myE)
                    // If grid snap active, only accept edge snap if it aligns with grid
                    if (snapToGrid && Math.abs(candidateY - Math.round(candidateY / gridSize) * gridSize) > 1) continue
                    snapDy = oE - myE
                    foundSnapY = true
                    drawSnapLine(Math.min(myEdges.left, oEdges.left) - 20, oE, Math.max(myEdges.right, oEdges.right) + 20, oE)
                    break
                  }
                }
              }
              if (foundSnapX && foundSnapY) break
            }
            x += snapDx
            y += snapDy
            if (foundSnapX || foundSnapY) wasSnapped = true
          }

          // Building wall collision — skip when snapped to prevent fighting
          if (!wasSnapped && wallCollisionBoxes.length > 0) {
            const setL = x, setR = x + currentAABB.w
            const setT = y, setB = y + currentAABB.h
            for (const wBB of wallCollisionBoxes) {
              if (setR > wBB.left && setL < wBB.right && setB > wBB.top && setT < wBB.bottom) {
                const pushL = wBB.right - setL, pushR = setR - wBB.left
                const pushT = wBB.bottom - setT, pushB = setB - wBB.top
                const minPush = Math.min(pushL, pushR, pushT, pushB)
                if (minPush === pushL) x += pushL
                else if (minPush === pushR) x -= pushR
                else if (minPush === pushT) y += pushT
                else y -= pushB
              }
            }
          }

          // Convert logical displacement back to Fabric.js position (translation is rotation-invariant)
          const snapDeltaX = x - currentAABB.x
          const snapDeltaY = y - currentAABB.y
          const newLeft = rawLeft + snapDeltaX
          const newTop = rawTop + snapDeltaY

          if (isPolygon) {
            this.set({ left: newLeft - this.pathOffset.x, top: newTop - this.pathOffset.y })
          } else {
            this.set({ left: newLeft, top: newTop })
          }

          // Move associated labels in real-time during drag (O(1) via cached refs)
          const labelDx = newLeft - s.x
          const labelDy = newTop - s.y
          const cachedLabels = labelRefsMap.current[s.id]
          if (cachedLabels) {
            for (let li = 0; li < cachedLabels.length; li++) {
              const obj = cachedLabels[li]
              if (obj._labelOrigLeft === undefined) {
                obj._labelOrigLeft = obj.left
                obj._labelOrigTop = obj.top
              }
              obj.set({
                left: obj._labelOrigLeft + labelDx,
                top: obj._labelOrigTop + labelDy,
              })
            }
          }

          // Move child components locked to this set in real-time (using Fabric.js delta)
          for (const child of childComponents) {
            const childShape = shapeRefsMap.current[child.id]
            if (childShape) {
              const newCX = newLeft + (child.lockedToSetOffset?.dx || 0)
              const newCY = newTop + (child.lockedToSetOffset?.dy || 0)
              childShape.set({ left: newCX, top: newCY })
              // Move child labels too
              const childLabels = labelRefsMap.current[child.id]
              if (childLabels) {
                const cdx = newCX - child.x
                const cdy = newCY - child.y
                for (const lbl of childLabels) {
                  if (lbl._labelOrigLeft === undefined) {
                    lbl._labelOrigLeft = lbl.left
                    lbl._labelOrigTop = lbl.top
                  }
                  lbl.set({ left: lbl._labelOrigLeft + cdx, top: lbl._labelOrigTop + cdy })
                }
              }
            }
          }

          // Move PDF layers pinned to this set in real-time during drag
          const dragState = useStore.getState()
          const dragLockedPdfs = dragState.pdfLayers.filter(l => l.lockedToSetId === s.id)
          for (const lp of dragLockedPdfs) {
            const fObj = pdfFabricRefs.current[lp.id]
            if (fObj) {
              const off = lp.lockedToSetOffset || { dx: 0, dy: 0 }
              fObj.set({ left: newLeft + off.dx, top: newTop + off.dy })
            }
          }

          // Move group siblings + multi-selected peers in real-time
          const multiSel = dragState.multiSelected
          const coMovingIds = new Set(groupSiblingIds)
          if (multiSel.size > 1 && multiSel.has(s.id)) {
            for (const mid of multiSel) {
              if (mid !== s.id) coMovingIds.add(mid)
            }
          }

          if (coMovingIds.size > 0) {
            // Use Fabric.js delta (translation-invariant, works for rotated siblings)
            const dx = newLeft - s.x
            const dy = newTop - s.y

            for (const sibId of coMovingIds) {
              const sibShape = shapeRefsMap.current[sibId]
              if (!sibShape) continue
              const sibSet = visibleSets.find(vs => vs.id === sibId)
              if (!sibSet) continue

              sibShape._isBeingDraggedByGroup = true
              sibShape.set({ left: sibSet.x + dx, top: sibSet.y + dy })

              // Move sibling labels
              const sibLabels = labelRefsMap.current[sibId]
              if (sibLabels) {
                for (const lbl of sibLabels) {
                  if (lbl._labelOrigLeft === undefined) {
                    lbl._labelOrigLeft = lbl.left
                    lbl._labelOrigTop = lbl.top
                  }
                  lbl.set({ left: lbl._labelOrigLeft + dx, top: lbl._labelOrigTop + dy })
                }
              }

              // Move sibling's children
              const sibKids = siblingChildren[sibId] || visibleSets.filter(c => c.lockedToSetId === sibId)
              for (const child of sibKids) {
                const childShape = shapeRefsMap.current[child.id]
                if (childShape) {
                  const newCX = sibSet.x + dx + (child.lockedToSetOffset?.dx || 0)
                  const newCY = sibSet.y + dy + (child.lockedToSetOffset?.dy || 0)
                  childShape._isBeingDraggedByGroup = true
                  childShape.set({ left: newCX, top: newCY })
                  const childLabels = labelRefsMap.current[child.id]
                  if (childLabels) {
                    const cdx = newCX - child.x
                    const cdy = newCY - child.y
                    for (const lbl of childLabels) {
                      if (lbl._labelOrigLeft === undefined) {
                        lbl._labelOrigLeft = lbl.left
                        lbl._labelOrigTop = lbl.top
                      }
                      lbl.set({ left: lbl._labelOrigLeft + cdx, top: lbl._labelOrigTop + cdy })
                    }
                  }
                }
              }

              // Move sibling's pinned PDFs
              const sibPdfs = dragState.pdfLayers.filter(l => l.lockedToSetId === sibId)
              for (const lp of sibPdfs) {
                const fObj = pdfFabricRefs.current[lp.id]
                if (fObj) {
                  const off = lp.lockedToSetOffset || { dx: 0, dy: 0 }
                  fObj.set({ left: sibSet.x + dx + off.dx, top: sibSet.y + dy + off.dy })
                }
              }
            }
          }
        })

        shape.on('modified', function () {
          clearSnapLines()
          this._dragStartPos = null
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

          // Persist child component positions (use setState to avoid multiple undo pushes)
          if (childComponents.length > 0) {
            const curSets = useStore.getState().sets
            useStore.setState({
              sets: curSets.map(cs => {
                if (cs.lockedToSetId === s.id && cs.lockedToSetOffset) {
                  return { ...cs, x: fx + cs.lockedToSetOffset.dx, y: fy + cs.lockedToSetOffset.dy }
                }
                return cs
              }),
            })
            useStore.getState().autosave()
          }

          // Move PDF layers pinned to this set (visual sync — store already updated via updateSet)
          const curState = useStore.getState()
          const lockedPdfs = curState.pdfLayers.filter(l => l.lockedToSetId === s.id)
          for (const lp of lockedPdfs) {
            const off = lp.lockedToSetOffset || { dx: 0, dy: 0 }
            const fObj = pdfFabricRefs.current[lp.id]
            if (fObj) {
              fObj.set({ left: fx + off.dx, top: fy + off.dy })
              fObj.setCoords()
            }
          }

          // Persist group/multi-select sibling positions
          const modMultiSel = useStore.getState().multiSelected
          const modCoMovingIds = new Set(groupSiblingIds)
          if (modMultiSel.size > 1 && modMultiSel.has(s.id)) {
            for (const mid of modMultiSel) {
              if (mid !== s.id) modCoMovingIds.add(mid)
            }
          }

          if (modCoMovingIds.size > 0) {
            const dx = fx - s.x
            const dy = fy - s.y
            const latestSets = useStore.getState().sets
            useStore.setState({
              sets: latestSets.map(cs => {
                if (modCoMovingIds.has(cs.id)) {
                  return { ...cs, x: cs.x + dx, y: cs.y + dy }
                }
                // Children of co-movers
                if (cs.lockedToSetId && modCoMovingIds.has(cs.lockedToSetId) && cs.lockedToSetOffset) {
                  const parent = latestSets.find(p => p.id === cs.lockedToSetId)
                  if (parent) {
                    return { ...cs, x: parent.x + dx + cs.lockedToSetOffset.dx, y: parent.y + dy + cs.lockedToSetOffset.dy }
                  }
                }
                return cs
              }),
            })
            useStore.getState().autosave()

            // Clear group drag flags
            for (const sibId of modCoMovingIds) {
              const sibShape = shapeRefsMap.current[sibId]
              if (sibShape) sibShape._isBeingDraggedByGroup = false
              const sibKids = siblingChildren[sibId] || []
              for (const child of sibKids) {
                const childShape = shapeRefsMap.current[child.id]
                if (childShape) childShape._isBeingDraggedByGroup = false
              }
            }

            // Sync co-mover pinned PDFs
            const pdfState = useStore.getState()
            for (const sibId of modCoMovingIds) {
              const sibPdfs = pdfState.pdfLayers.filter(l => l.lockedToSetId === sibId)
              const sibSet = pdfState.sets.find(ss => ss.id === sibId)
              for (const lp of sibPdfs) {
                const off = lp.lockedToSetOffset || { dx: 0, dy: 0 }
                const fObj = pdfFabricRefs.current[lp.id]
                if (fObj && sibSet) {
                  fObj.set({ left: sibSet.x + off.dx, top: sibSet.y + off.dy })
                  fObj.setCoords()
                }
              }
            }
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

          const wallColor = showLockVis ? '#f59e0b' : s.color  // selection highlight applied by selection effect
          const wallWidth = 2
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
                  stroke: '#fbbf2466', strokeWidth: 1, strokeDashArray: [6, 4],
                  selectable: false, evented: false,
                  name: WALL_LINE_PREFIX + s.id + '-' + ws.side + '-ext-before',
                }))
                // Extension after
                fc.add(new fabric.Line([ex3, ey3, ex4, ey4], {
                  stroke: '#fbbf2466', strokeWidth: 1, strokeDashArray: [6, 4],
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

      // Wall gap zones rendered by selection effect (only shown for selected set)

      // Labels — centered name inside the set
      if (labelsVisible && !s.labelHidden && labelMode === 'inline') {
        // Skip labels on very small sets
        const visualMin = Math.min(w, h)
        if (visualMin < 15) continue

        // Compute visual center accounting for rotation
        // Fabric.js rotates around (left, top) with originX:'left', originY:'top'
        const rot = (s.rotation || 0)
        const rad = rot * Math.PI / 180
        const cosR = Math.cos(rad), sinR = Math.sin(rad)
        const centerX = s.x + (w / 2) * cosR - (h / 2) * sinR
        const centerY = s.y + (w / 2) * sinR + (h / 2) * cosR

        // Font size: use global setting if > 0, otherwise auto-scale
        const fontSize = globalLabelFontSize > 0
          ? globalLabelFontSize
          : Math.min(14, Math.max(7, visualMin / 5))

        // Color: always render non-selected — selection effect applies highlight
        const fillColor = globalLabelColor + 'dd'
        const dimFillColor = globalLabelColor + '99'

        // Name label — centered at visual center
        const setLabels = []  // collect for labelRefsMap cache
        const label = new fabric.FabricText(s.name, {
          left: centerX,
          top: centerY - fontSize / 2 - 1,
          fontSize,
          fill: fillColor,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontWeight: 'bold',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
          name: LABEL_PREFIX + s.id,
          shadow: new fabric.Shadow({ color: globalLabelColor === '#000000' ? '#ffffff' : '#000000', blur: 4 }),
        })
        fc.add(label)
        setLabels.push(label)

        // Dimension line below name — only if set is big enough
        if (visualMin > 30) {
          const dimStr = `${s.width}×${s.height}`
          const dimFontSize = globalLabelFontSize > 0
            ? Math.max(7, globalLabelFontSize - 2)
            : Math.max(7, fontSize - 2)
          const dimLabel = new fabric.FabricText(dimStr, {
            left: centerX,
            top: centerY + fontSize / 2 + 1,
            fontSize: dimFontSize,
            fill: dimFillColor,
            fontFamily: 'Arial, Helvetica, sans-serif',
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
            name: LABEL_PREFIX + s.id + '-dim',
            shadow: new fabric.Shadow({ color: globalLabelColor === '#000000' ? '#ffffff' : '#000000', blur: 3 }),
          })
          fc.add(dimLabel)
          setLabels.push(dimLabel)
        }

        // Rotation indicator rendered by selection effect (only when selected)
        labelRefsMap.current[s.id] = setLabels
      }
    }

    // Overlap zones rendered by separate useEffect for performance

    // FIXED indicators, wall gaps, rotation labels rendered by selection effect

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
          fontFamily: 'Arial, Helvetica, sans-serif',
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
          fontFamily: 'Arial, Helvetica, sans-serif',
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

    // Dimension lines rendered by separate useEffect for performance

    // Building walls rendered by separate useEffect for performance

    // Building columns, drawing points, and annotations rendered by separate useEffects

    // Apply selection highlighting inline (since selectedSetId is not in deps,
    // read from store so shapes get correct highlight when syncSets rebuilds)
    const currentSelId = useStore.getState().selectedSetId
    if (currentSelId) {
      const selShape = shapeRefsMap.current[currentSelId]
      if (selShape) selShape.set({ stroke: '#ffffff', strokeWidth: 3 })
      // Highlight label fill
      const selLabels = labelRefsMap.current[currentSelId]
      if (selLabels) {
        for (const lbl of selLabels) {
          if (!lbl.name?.endsWith('-dim')) lbl.set({ fill: '#ffffff' })
        }
      }
      // Add wall gaps, FIXED indicators, rotation labels for selected set
      const selSet = sets.find(ss => ss.id === currentSelId)
      addSelectionDecorations(fc, selSet, ppu, rules)
    }
    prevSelectedRef.current = currentSelId  // Keep selection ref in sync

    fc.requestRenderAll()
  }, [sets, rules, pixelsPerUnit, snapToGrid, snapToSets, gridSize, labelsVisible, labelMode, globalLabelFontSize, globalLabelColor, viewMode, layerVisibility, showLockIndicators, hideAllSets])

  useEffect(() => {
    syncSets()
  }, [syncSets])

  // === SELECTION HIGHLIGHTING — lightweight in-place updates, no full rebuild ===
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const prevId = prevSelectedRef.current
    const newId = selectedSetId
    prevSelectedRef.current = newId

    const state = useStore.getState()
    const ppu = state.pixelsPerUnit
    const lblColor = state.labelColor || '#ffffff'

    // --- 1. Deselect previous: reset stroke/strokeWidth and label fill ---
    if (prevId && prevId !== newId) {
      const prevShape = shapeRefsMap.current[prevId]
      if (prevShape) {
        const ps = state.sets.find(s => s.id === prevId)
        const prevLockVis = ps?.lockedToPdf && state.showLockIndicators
        prevShape.set({
          stroke: prevLockVis ? '#f59e0b' : (ps?.color || '#888'),
          strokeWidth: 2,
        })
      }
      // Reset label fill
      const prevLabels = labelRefsMap.current[prevId]
      if (prevLabels) {
        for (const lbl of prevLabels) {
          if (lbl.name?.endsWith('-dim')) lbl.set({ fill: lblColor + '99' })
          else lbl.set({ fill: lblColor + 'dd' })
        }
      }
    }

    // --- 2. Remove old selection-only decorations (gap zones, FIXED icons, rotation labels) ---
    fc.getObjects()
      .filter(o =>
        o.name?.startsWith(GAP_PREFIX) ||
        (o.name?.startsWith(RULE_PREFIX) && o.name?.endsWith('-icon')) ||
        (o.name?.startsWith(LABEL_PREFIX) && o.name?.endsWith('-rot'))
      )
      .forEach(o => fc.remove(o))

    // --- 3. Select new: highlight stroke/strokeWidth, label fill, and decorations ---
    if (newId) {
      const newShape = shapeRefsMap.current[newId]
      if (newShape) {
        newShape.set({ stroke: '#ffffff', strokeWidth: 3 })
      }
      // Highlight label fill
      const newLabels = labelRefsMap.current[newId]
      if (newLabels) {
        for (const lbl of newLabels) {
          if (!lbl.name?.endsWith('-dim')) lbl.set({ fill: '#ffffff' })
        }
      }
      // Add wall gaps, FIXED indicators, rotation label via shared helper
      const s = state.sets.find(ss => ss.id === newId)
      addSelectionDecorations(fc, s, ppu, state.rules)
    }

    fc.requestRenderAll()
  }, [selectedSetId])

  // === EXTRACTED EFFECTS: Each visual concern has its own render cycle ===

  // Overlap zones — only rebuild when sets move or showOverlaps toggles
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(OVERLAP_PREFIX)).forEach(o => fc.remove(o))
    if (showOverlaps) {
      const ppu = pixelsPerUnit
      const visibleSets = hideAllSets ? [] : sets
        .filter(s => s.onPlan !== false && !s.hidden && (layerVisibility[s.category || 'Set'] !== false))
      const visibleAABBs = visibleSets.map(s => getAABB(s, ppu))
      for (let i = 0; i < visibleAABBs.length; i++) {
        for (let j = i + 1; j < visibleAABBs.length; j++) {
          const overlap = getOverlapRect(visibleAABBs[i], visibleAABBs[j])
          if (!overlap || overlap.w < 2 || overlap.h < 2) continue
          fc.add(new fabric.Rect({
            left: overlap.x, top: overlap.y, width: overlap.w, height: overlap.h,
            fill: '#EF444418', stroke: '#EF444488', strokeWidth: 1, strokeDashArray: [4, 3],
            selectable: false, evented: false,
            name: OVERLAP_PREFIX + visibleAABBs[i].id + '-' + visibleAABBs[j].id,
          }))
        }
      }
    }
    fc.requestRenderAll()
  }, [sets, showOverlaps, pixelsPerUnit, layerVisibility, hideAllSets])

  // Dimension lines — supports 'selected' (one set + gaps) and 'all' (every set) modes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(DIM_PREFIX)).forEach(o => fc.remove(o))
    if (!showDimensions) { fc.requestRenderAll(); return }

    const ppu = pixelsPerUnit
    const visibleSets = hideAllSets ? [] : sets
      .filter(s => s.onPlan !== false && !s.hidden && (layerVisibility[s.category || 'Set'] !== false))

    // Determine which sets get dimension lines
    const isAllMode = dimMode === 'all'
    const dimSets = isAllMode
      ? visibleSets
      : (selectedSetId ? visibleSets.filter(s => s.id === selectedSetId) : [])

    if (dimSets.length === 0) { fc.requestRenderAll(); return }

    const dimColor = '#94a3b8'
    const tickLen = 6  // Extension line tick length

    // Helper: draw architectural dimension lines for a set
    const drawSetDims = (si, offset) => {
      const a = getAABB(si, ppu)
      const fontSize = Math.max(8, Math.min(11, Math.min(a.w, a.h) / 10))
      const prefix = DIM_PREFIX + si.id

      // — Width dimension (below set) —
      const wy = a.y + a.h + offset
      // Dimension line
      fc.add(new fabric.Line([a.x, wy, a.x + a.w, wy], {
        stroke: dimColor, strokeWidth: 0.8,
        selectable: false, evented: false, name: prefix + '-wl',
      }))
      // Extension ticks (perpendicular at each end)
      fc.add(new fabric.Line([a.x, wy - tickLen / 2, a.x, wy + tickLen / 2], {
        stroke: dimColor, strokeWidth: 0.6,
        selectable: false, evented: false, name: prefix + '-wt1',
      }))
      fc.add(new fabric.Line([a.x + a.w, wy - tickLen / 2, a.x + a.w, wy + tickLen / 2], {
        stroke: dimColor, strokeWidth: 0.6,
        selectable: false, evented: false, name: prefix + '-wt2',
      }))
      // Width text
      fc.add(new fabric.FabricText(`${si.width}${unit}`, {
        left: a.x + a.w / 2, top: wy + 2,
        fontSize, fill: dimColor, fontFamily: 'Arial, Helvetica, sans-serif',
        originX: 'center', selectable: false, evented: false, name: prefix + '-w',
      }))

      // — Height dimension (right of set) —
      const hx = a.x + a.w + offset
      // Dimension line
      fc.add(new fabric.Line([hx, a.y, hx, a.y + a.h], {
        stroke: dimColor, strokeWidth: 0.8,
        selectable: false, evented: false, name: prefix + '-hl',
      }))
      // Extension ticks
      fc.add(new fabric.Line([hx - tickLen / 2, a.y, hx + tickLen / 2, a.y], {
        stroke: dimColor, strokeWidth: 0.6,
        selectable: false, evented: false, name: prefix + '-ht1',
      }))
      fc.add(new fabric.Line([hx - tickLen / 2, a.y + a.h, hx + tickLen / 2, a.y + a.h], {
        stroke: dimColor, strokeWidth: 0.6,
        selectable: false, evented: false, name: prefix + '-ht2',
      }))
      // Height text
      fc.add(new fabric.FabricText(`${si.height}${unit}`, {
        left: hx + 3, top: a.y + a.h / 2,
        fontSize, fill: dimColor, fontFamily: 'Arial, Helvetica, sans-serif',
        originX: 'left', originY: 'center', selectable: false, evented: false, name: prefix + '-h',
      }))
    }

    // Draw dims on each target set
    const dimOffset = isAllMode ? 10 : 4
    for (const si of dimSets) {
      drawSetDims(si, dimOffset)
    }

    // Gap-to-neighbour lines — only in 'selected' mode (too cluttered for 'all')
    if (!isAllMode && selectedSetId) {
      const si = visibleSets.find(s => s.id === selectedSetId)
      if (si) {
        const siAABB = getAABB(si, ppu)
        for (const sj of visibleSets) {
          if (sj.id === si.id) continue
          const sjAABB = getAABB(sj, ppu)
          // Check horizontal alignment (overlapping Y ranges)
          const hOverlap = !(siAABB.y + siAABB.h < sjAABB.y || sjAABB.y + sjAABB.h < siAABB.y)
          if (hOverlap) {
            const gapRight = sjAABB.x - (siAABB.x + siAABB.w)
            const gapLeft = siAABB.x - (sjAABB.x + sjAABB.w)
            const gap = gapRight > 2 ? gapRight : gapLeft > 2 ? gapLeft : 0
            if (gap > 2 && gap < 500) {
              const fromX = gapRight > 2 ? siAABB.x + siAABB.w : sjAABB.x + sjAABB.w
              const toX = gapRight > 2 ? sjAABB.x : siAABB.x
              const midY = (Math.max(siAABB.y, sjAABB.y) + Math.min(siAABB.y + siAABB.h, sjAABB.y + sjAABB.h)) / 2
              const distFt = Math.round((gap / ppu) * 10) / 10
              fc.add(new fabric.Line([fromX, midY, toX, midY], {
                stroke: '#f59e0b66', strokeWidth: 1, strokeDashArray: [3, 3],
                selectable: false, evented: false, name: DIM_PREFIX + si.id + '-' + sj.id,
              }))
              fc.add(new fabric.FabricText(`${distFt}${unit}`, {
                left: (fromX + toX) / 2, top: midY - 12,
                fontSize: 9, fill: '#f59e0b', fontFamily: 'Arial, Helvetica, sans-serif',
                originX: 'center', selectable: false, evented: false,
                name: DIM_PREFIX + si.id + '-' + sj.id + '-t',
              }))
            }
          }
          // Also check vertical alignment (overlapping X ranges)
          const vOverlap = !(siAABB.x + siAABB.w < sjAABB.x || sjAABB.x + sjAABB.w < siAABB.x)
          if (vOverlap) {
            const gapBelow = sjAABB.y - (siAABB.y + siAABB.h)
            const gapAbove = siAABB.y - (sjAABB.y + sjAABB.h)
            const gap = gapBelow > 2 ? gapBelow : gapAbove > 2 ? gapAbove : 0
            if (gap > 2 && gap < 500) {
              const fromY = gapBelow > 2 ? siAABB.y + siAABB.h : sjAABB.y + sjAABB.h
              const toY = gapBelow > 2 ? sjAABB.y : siAABB.y
              const midX = (Math.max(siAABB.x, sjAABB.x) + Math.min(siAABB.x + siAABB.w, sjAABB.x + sjAABB.w)) / 2
              const distFt = Math.round((gap / ppu) * 10) / 10
              fc.add(new fabric.Line([midX, fromY, midX, toY], {
                stroke: '#f59e0b66', strokeWidth: 1, strokeDashArray: [3, 3],
                selectable: false, evented: false, name: DIM_PREFIX + si.id + '-' + sj.id + '-v',
              }))
              fc.add(new fabric.FabricText(`${distFt}${unit}`, {
                left: midX + 4, top: (fromY + toY) / 2,
                fontSize: 9, fill: '#f59e0b', fontFamily: 'Arial, Helvetica, sans-serif',
                originX: 'left', originY: 'center', selectable: false, evented: false,
                name: DIM_PREFIX + si.id + '-' + sj.id + '-vt',
              }))
            }
          }
        }
      }
    }

    fc.requestRenderAll()
  }, [sets, selectedSetId, showDimensions, dimMode, pixelsPerUnit, unit, layerVisibility, hideAllSets])

  // Exclusion zones rendering
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(EXCL_PREFIX)).forEach(o => fc.remove(o))
    for (const zone of exclusionZones) {
      fc.add(new fabric.Rect({
        left: zone.x, top: zone.y, width: zone.w, height: zone.h,
        fill: '#EF444415', stroke: '#EF4444', strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        selectable: false, evented: false,
        name: EXCL_PREFIX + zone.id,
      }))
      fc.add(new fabric.FabricText(zone.label || 'No-Go', {
        left: zone.x + zone.w / 2, top: zone.y + zone.h / 2,
        fontSize: 10, fill: '#EF4444', fontFamily: 'Arial, Helvetica, sans-serif',
        originX: 'center', originY: 'center',
        selectable: false, evented: false,
        name: EXCL_PREFIX + zone.id + '-label',
      }))
    }
    fc.requestRenderAll()
  }, [exclusionZones])

  // Clearance zone rendering (Doors + Windows)
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(CLEAR_PREFIX)).forEach(o => fc.remove(o))
    if (!showClearance) { fc.requestRenderAll(); return }

    const ppu = pixelsPerUnit
    const COMPONENT_CATS = ['Wall', 'Window', 'Door']
    const visibleSets = hideAllSets ? [] : sets
      .filter(s => s.onPlan !== false && !s.hidden && (layerVisibility[s.category || 'Set'] !== false))
    const components = visibleSets.filter(s => COMPONENT_CATS.includes(s.category) && s.lockedToSetId)

    for (const comp of components) {
      if (comp.category !== 'Door' && comp.category !== 'Window') continue
      const parent = sets.find(s => s.id === comp.lockedToSetId)
      if (!parent) continue

      const clearFt = comp.category === 'Window' ? 3 : 2
      const zone = getComponentClearance(comp, parent, ppu, clearFt)
      if (!zone) continue

      // Check if any other set violates this clearance
      let violated = false
      for (const other of visibleSets) {
        if (other.id === comp.id || other.id === parent.id) continue
        if (COMPONENT_CATS.includes(other.category)) continue
        const oa = getAABB(other, ppu)
        const ox = Math.max(0, Math.min(zone.x + zone.w, oa.x + oa.w) - Math.max(zone.x, oa.x))
        const oy = Math.max(0, Math.min(zone.y + zone.h, oa.y + oa.h) - Math.max(zone.y, oa.y))
        if (ox > 0 && oy > 0) { violated = true; break }
      }

      const color = comp.category === 'Door'
        ? (violated ? '#EF4444' : '#22C55E')  // Red if blocked, green if clear
        : (violated ? '#F59E0B' : '#06B6D4')  // Orange if blocked, cyan if clear

      fc.add(new fabric.Rect({
        left: zone.x, top: zone.y, width: zone.w, height: zone.h,
        fill: color + (violated ? '30' : '15'),
        stroke: color, strokeWidth: 1,
        strokeDashArray: [4, 3],
        selectable: false, evented: false,
        name: CLEAR_PREFIX + comp.id,
      }))

      fc.add(new fabric.FabricText(
        violated
          ? (comp.category === 'Door' ? '⚠ BLOCKED' : `⚠ <${clearFt}ft`)
          : `${clearFt}ft clear`,
        {
          left: zone.x + zone.w / 2, top: zone.y + zone.h / 2,
          fontSize: 8, fill: color, fontFamily: 'Arial, Helvetica, sans-serif',
          originX: 'center', originY: 'center',
          selectable: false, evented: false,
          name: CLEAR_PREFIX + comp.id + '-label',
        }
      ))
    }
    fc.requestRenderAll()
  }, [sets, showClearance, pixelsPerUnit, layerVisibility, hideAllSets])

  // Building walls — only rebuild when walls data changes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(BWALL_PREFIX)).forEach(o => fc.remove(o))
    if (buildingWallsVisible) {
      const ppu = pixelsPerUnit
      for (const bw of buildingWalls) {
        const thicknessPx = bw.thickness * ppu
        const dx = bw.x2 - bw.x1, dy = bw.y2 - bw.y1
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) continue
        const nx = -dy / len * (thicknessPx / 2), ny = dx / len * (thicknessPx / 2)
        fc.add(new fabric.Polygon([
          { x: bw.x1 + nx, y: bw.y1 + ny }, { x: bw.x2 + nx, y: bw.y2 + ny },
          { x: bw.x2 - nx, y: bw.y2 - ny }, { x: bw.x1 - nx, y: bw.y1 - ny },
        ], {
          fill: bw.color + '99', stroke: bw.color, strokeWidth: 2,
          selectable: false, evented: false, name: BWALL_PREFIX + bw.id,
        }))
        if (labelsVisible) {
          const lengthFt = len / ppu
          if (lengthFt > 0.5) {
            fc.add(new fabric.FabricText(`${Math.round(lengthFt * 10) / 10}${unit}`, {
              left: (bw.x1 + bw.x2) / 2, top: (bw.y1 + bw.y2) / 2 - 10,
              fontSize: 9, fill: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif',
              originX: 'center', selectable: false, evented: false,
              name: BWALL_PREFIX + bw.id + '-label',
              shadow: new fabric.Shadow({ color: '#000000', blur: 3 }),
            }))
          }
        }
      }
    }
    fc.requestRenderAll()
  }, [buildingWalls, buildingWallsVisible, pixelsPerUnit, labelsVisible, unit])

  // Building columns — only rebuild when column data changes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(BCOL_PREFIX)).forEach(o => fc.remove(o))
    if (buildingColumnsVisible) {
      const ppu = pixelsPerUnit
      for (const col of buildingColumns) {
        const widthPx = col.width * ppu, heightPx = col.height * ppu
        const isSelected = col.id === selectedBuildingColumnId
        const commonProps = {
          fill: col.color + (isSelected ? 'FF' : 'CC'),
          stroke: isSelected ? '#ffffff' : col.color,
          strokeWidth: isSelected ? 3 : 2,
          selectable: true, evented: true,
          hasControls: false, hasBorders: isSelected,
          lockRotation: true, lockScalingX: true, lockScalingY: true,
          name: BCOL_PREFIX + col.id, _colId: col.id,
        }
        let shape
        if (col.shape === 'round') {
          shape = new fabric.Ellipse({
            left: col.x - widthPx / 2, top: col.y - heightPx / 2,
            rx: widthPx / 2, ry: heightPx / 2, ...commonProps,
          })
        } else {
          shape = new fabric.Rect({
            left: col.x - widthPx / 2, top: col.y - heightPx / 2,
            width: widthPx, height: heightPx, ...commonProps,
          })
        }
        shape.on('modified', function () {
          const newX = this.left + widthPx / 2, newY = this.top + heightPx / 2
          const state = useStore.getState()
          updateBuildingColumn(col.id, {
            x: newX, y: newY,
            pdfOffsetX: newX - state.pdfPosition.x,
            pdfOffsetY: newY - state.pdfPosition.y,
          })
        })
        shape.on('mousedown', function () { setSelectedBuildingColumnId(col.id) })
        fc.add(shape)
        if (labelsVisible) {
          fc.add(new fabric.FabricText(col.label || `${col.width}'×${col.height}'`, {
            left: col.x, top: col.y - heightPx / 2 - 12,
            fontSize: 9, fill: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif',
            originX: 'center', selectable: false, evented: false,
            name: BCOL_PREFIX + col.id + '-label',
            shadow: new fabric.Shadow({ color: '#000000', blur: 3 }),
          }))
        }
      }
    }
    fc.requestRenderAll()
  }, [buildingColumns, buildingColumnsVisible, pixelsPerUnit, selectedBuildingColumnId, labelsVisible, unit])

  // Drawing-in-progress points — only rebuild when drawing state changes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name === DRAWING_POINT_NAME).forEach(o => fc.remove(o))
    if (drawingMode === 'building-wall') {
      for (const pt of drawingWallPoints) {
        fc.add(new fabric.Circle({
          left: pt.x - 4, top: pt.y - 4, radius: 4,
          fill: '#EF4444', stroke: '#ffffff', strokeWidth: 2,
          selectable: false, evented: false, name: DRAWING_POINT_NAME,
        }))
      }
    }
    fc.requestRenderAll()
  }, [drawingMode, drawingWallPoints])

  // Annotations — only rebuild when annotation data changes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    fc.getObjects().filter(o => o.name?.startsWith(ANNO_PREFIX)).forEach(o => fc.remove(o))
    for (const anno of annotations) {
      const text = new fabric.FabricText(anno.text, {
        left: anno.x, top: anno.y,
        fontSize: anno.fontSize || 14, fill: anno.color || '#ffffff',
        fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 'bold',
        angle: anno.rotation || 0,
        selectable: true, evented: true,
        hasControls: false, hasBorders: true, borderColor: '#6366F1', hoverCursor: 'move',
        name: ANNO_PREFIX + anno.id,
        shadow: new fabric.Shadow({ color: '#000000', blur: 4 }),
      })
      if (anno.bgColor) {
        fc.add(new fabric.Rect({
          left: anno.x - 4, top: anno.y - 2,
          width: text.width + 8, height: (anno.fontSize || 14) + 4,
          fill: anno.bgColor, rx: 3, ry: 3,
          selectable: false, evented: false, name: ANNO_PREFIX + anno.id + '-bg',
        }))
      }
      text.on('modified', function () { updateAnnotation(anno.id, { x: this.left, y: this.top }) })
      text.on('mousedblclick', function () {
        const newText = prompt('Edit annotation text:', anno.text)
        if (newText !== null) updateAnnotation(anno.id, { text: newText })
      })
      fc.add(text)
    }
    fc.requestRenderAll()
  }, [annotations])

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

  // Column placement mode — click on canvas to place a column
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || drawingMode !== 'place-column') return

    const onClick = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) return // pan
      if (opt.e.button !== 0) return // left click only
      // Don't place if clicking on an existing column (allow selecting it instead)
      if (opt.target && opt.target.name?.startsWith(BCOL_PREFIX)) return

      const template = useStore.getState().columnPlacementTemplate
      if (!template) return

      const pointer = fc.getScenePoint(opt.e)
      let x = pointer.x, y = pointer.y

      // Grid snap
      if (snapToGrid) {
        x = Math.round(x / gridSize) * gridSize
        y = Math.round(y / gridSize) * gridSize
      }

      addBuildingColumn({
        x, y,
        width: template.width,
        height: template.height,
        shape: template.shape,
        color: template.color,
        label: template.label,
      })
    }

    // Preview cursor shape as you move
    const PLACE_PREVIEW = 'col-place-preview'
    const onMove = (opt) => {
      fc.getObjects().filter(o => o.name === PLACE_PREVIEW).forEach(o => fc.remove(o))
      const template = useStore.getState().columnPlacementTemplate
      if (!template) return

      const pointer = fc.getScenePoint(opt.e)
      let x = pointer.x, y = pointer.y
      if (snapToGrid) {
        x = Math.round(x / gridSize) * gridSize
        y = Math.round(y / gridSize) * gridSize
      }

      const ppu = useStore.getState().pixelsPerUnit
      const wp = template.width * ppu
      const hp = template.height * ppu

      let preview
      if (template.shape === 'round') {
        preview = new fabric.Ellipse({
          left: x - wp / 2, top: y - hp / 2,
          rx: wp / 2, ry: hp / 2,
          fill: template.color + '55', stroke: template.color,
          strokeWidth: 2, strokeDashArray: [4, 3],
          selectable: false, evented: false, name: PLACE_PREVIEW,
        })
      } else {
        preview = new fabric.Rect({
          left: x - wp / 2, top: y - hp / 2,
          width: wp, height: hp,
          fill: template.color + '55', stroke: template.color,
          strokeWidth: 2, strokeDashArray: [4, 3],
          selectable: false, evented: false, name: PLACE_PREVIEW,
        })
      }
      fc.add(preview)
      fc.requestRenderAll()
    }

    fc.on('mouse:down', onClick)
    fc.on('mouse:move', onMove)
    fc.defaultCursor = 'crosshair'
    return () => {
      fc.off('mouse:down', onClick)
      fc.off('mouse:move', onMove)
      fc.defaultCursor = 'default'
      const fcc = fabricRef.current
      if (fcc) {
        fcc.getObjects().filter(o => o.name === PLACE_PREVIEW).forEach(o => fcc.remove(o))
        fcc.requestRenderAll()
      }
    }
  }, [drawingMode, snapToGrid, gridSize, addBuildingColumn])

  // Exclusion zone drawing mode — click+drag to draw a rectangle
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || drawingMode !== 'exclusion-zone') return
    const { addExclusionZone } = useStore.getState()

    let startPt = null
    let previewRect = null

    const onDown = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) return
      if (opt.e.button !== 0) return
      startPt = fc.getScenePoint(opt.e)
    }

    const onMove = (opt) => {
      if (!startPt) return
      if (previewRect) fc.remove(previewRect)
      const cur = fc.getScenePoint(opt.e)
      const x = Math.min(startPt.x, cur.x)
      const y = Math.min(startPt.y, cur.y)
      const w = Math.abs(cur.x - startPt.x)
      const h = Math.abs(cur.y - startPt.y)
      previewRect = new fabric.Rect({
        left: x, top: y, width: w, height: h,
        fill: '#EF444420', stroke: '#EF4444', strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        selectable: false, evented: false,
        name: DRAWING_PREVIEW_NAME,
      })
      fc.add(previewRect)
      fc.requestRenderAll()
    }

    const onUp = (opt) => {
      if (!startPt) return
      const cur = fc.getScenePoint(opt.e)
      const x = Math.min(startPt.x, cur.x)
      const y = Math.min(startPt.y, cur.y)
      const w = Math.abs(cur.x - startPt.x)
      const h = Math.abs(cur.y - startPt.y)
      startPt = null
      if (previewRect) { fc.remove(previewRect); previewRect = null }
      if (w > 5 && h > 5) {
        addExclusionZone({ x, y, w, h, label: 'No-Go' })
      }
      fc.requestRenderAll()
    }

    fc.on('mouse:down', onDown)
    fc.on('mouse:move', onMove)
    fc.on('mouse:up', onUp)
    return () => {
      fc.off('mouse:down', onDown)
      fc.off('mouse:move', onMove)
      fc.off('mouse:up', onUp)
      if (previewRect && fabricRef.current) {
        fabricRef.current.remove(previewRect)
        fabricRef.current.requestRenderAll()
      }
    }
  }, [drawingMode])

  // Component placement mode — click on canvas to place a window, door, wall, etc.
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || drawingMode !== 'place-component') return

    const COMP_PREVIEW = 'comp-place-preview'

    const onClick = (opt) => {
      if (opt.e.ctrlKey || opt.e.metaKey) return // pan
      if (opt.e.button !== 0) return // left click only
      // Components are placed ON TOP of sets, so don't block clicks on existing sets

      const template = useStore.getState().componentPlacementTemplate
      if (!template) return

      const pointer = fc.getScenePoint(opt.e)
      let x = pointer.x, y = pointer.y

      // Grid snap
      if (snapToGrid) {
        const gs = gridSize || 10
        x = Math.round(x / gs) * gs
        y = Math.round(y / gs) * gs
      }

      // x,y are pixel positions — center the component at click point
      const ppu = useStore.getState().pixelsPerUnit || 50
      const wp = template.width * ppu
      const hp = template.height * ppu
      const count = template.placeCount || 1
      const spacingPx = (template.placeSpacing || 0) * ppu

      // Place N copies in a horizontal row from the click point
      const placedIds = []
      for (let i = 0; i < count; i++) {
        const offsetPx = i * (wp + spacingPx)
        const newId = addSet({
          ...template,
          x: x - wp / 2 + offsetPx,
          y: y - hp / 2,
          elevation: template.elevation || 0,
          // Strip multi-placement metadata from stored set
          placeCount: undefined,
          placeSpacing: undefined,
        })
        if (newId) placedIds.push(newId)
      }

      // Auto-lock: find which parent Set each placed component overlaps with
      if (placedIds.length > 0) {
        const store = useStore.getState()
        const parentSets = store.sets.filter(s =>
          s.onPlan !== false && !s.hidden &&
          !placedIds.includes(s.id) &&
          !s.lockedToSetId &&
          !['Wall', 'Window', 'Door'].includes(s.category || 'Set')
        )
        for (const pid of placedIds) {
          const placed = store.sets.find(s => s.id === pid)
          if (!placed) continue
          const pw = placed.width * ppu, ph = placed.height * ppu
          const pL = placed.x, pR = placed.x + pw, pT = placed.y, pB = placed.y + ph
          // Find first overlapping parent set
          for (const parent of parentSets) {
            const parW = parent.width * ppu, parH = parent.height * ppu
            const parL = parent.x, parR = parent.x + parW
            const parT = parent.y, parB = parent.y + parH
            const overlaps = pR > parL && pL < parR && pB > parT && pT < parB
            if (overlaps) {
              console.log('[auto-lock] MATCH! locking', placed.name, 'to', parent.name)
              store.lockToSet(pid, parent.id)
              break
            }
          }
        }
      }
    }

    // Preview cursor shape as you move — show N ghost rectangles for multi-placement
    const onMove = (opt) => {
      fc.getObjects().filter(o => o.name === COMP_PREVIEW).forEach(o => fc.remove(o))
      const template = useStore.getState().componentPlacementTemplate
      if (!template) return

      const pointer = fc.getScenePoint(opt.e)
      let x = pointer.x, y = pointer.y
      if (snapToGrid) {
        const gs = gridSize || 10
        x = Math.round(x / gs) * gs
        y = Math.round(y / gs) * gs
      }

      const ppu = useStore.getState().pixelsPerUnit || 50
      const wp = template.width * ppu
      const hp = template.height * ppu
      const count = template.placeCount || 1
      const spacingPx = (template.placeSpacing || 0) * ppu

      for (let i = 0; i < count; i++) {
        const offsetPx = i * (wp + spacingPx)
        const preview = new fabric.Rect({
          left: x - wp / 2 + offsetPx, top: y - hp / 2,
          width: wp, height: hp,
          fill: (template.color || '#666') + '44',
          stroke: template.color || '#666',
          strokeWidth: 2, strokeDashArray: [6, 4],
          selectable: false, evented: false, name: COMP_PREVIEW,
        })
        fc.add(preview)
      }
      fc.requestRenderAll()
    }

    fc.on('mouse:down', onClick)
    fc.on('mouse:move', onMove)
    fc.defaultCursor = 'crosshair'
    return () => {
      fc.off('mouse:down', onClick)
      fc.off('mouse:move', onMove)
      fc.defaultCursor = 'default'
      const fcc = fabricRef.current
      if (fcc) {
        fcc.getObjects().filter(o => o.name === COMP_PREVIEW).forEach(o => fcc.remove(o))
        fcc.requestRenderAll()
      }
    }
  }, [drawingMode, snapToGrid, gridSize, addSet])

  // Right-click on building column → duplicate
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const onRightClick = (opt) => {
      const target = opt.target
      if (!target || !target.name?.startsWith(BCOL_PREFIX)) return
      opt.e.preventDefault()
      const colId = target._colId
      if (colId) {
        duplicateBuildingColumn(colId)
      }
    }

    fc.on('mouse:down', (opt) => {
      if (opt.e.button === 2) onRightClick(opt)
    })

    // Keyboard shortcut: D to duplicate selected column
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const state = useStore.getState()
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && state.selectedBuildingColumnId) {
        e.preventDefault()
        duplicateBuildingColumn(state.selectedBuildingColumnId)
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [duplicateBuildingColumn])

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
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!state.selectedSetId) return
        e.preventDefault()

        // Step size: grid-aligned if snap-to-grid, otherwise 1px
        const baseStep = state.snapToGrid ? (state.gridSize || 50) : 1
        const step = e.shiftKey ? baseStep * 10 : baseStep

        let dx = 0, dy = 0
        if (e.key === 'ArrowUp') dy = -step
        else if (e.key === 'ArrowDown') dy = step
        else if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step

        // Debounced undo: push history on first press, skip for 500ms
        if (!window._arrowNudgeTimer) {
          state._pushHistory()
        }
        clearTimeout(window._arrowNudgeTimer)
        window._arrowNudgeTimer = setTimeout(() => { window._arrowNudgeTimer = null }, 500)

        // Collect all IDs to move (selected + group + multi-select)
        const idsToMove = new Set()
        idsToMove.add(state.selectedSetId)

        const group = state.groups.find(g => g.setIds.includes(state.selectedSetId))
        if (group) {
          for (const gid of group.setIds) idsToMove.add(gid)
        }

        if (state.multiSelected.size > 1 && state.multiSelected.has(state.selectedSetId)) {
          for (const mid of state.multiSelected) idsToMove.add(mid)
        }

        state.moveMultiple(idsToMove, dx, dy)
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
      {drawingMode === 'place-column' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10 flex items-center gap-3">
          <span>Placing {columnPlacementTemplate?.label || 'Column'}</span>
          <span className="text-purple-200 text-xs">Click=place · Right-click=duplicate · D=duplicate selected · Esc=done</span>
          <button
            onClick={cancelDrawing}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded text-xs"
          >
            Done
          </button>
        </div>
      )}
      {drawingMode === 'place-component' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10 flex items-center gap-3">
          <span>Placing {(componentPlacementTemplate?.placeCount || 1) > 1 ? `${componentPlacementTemplate.placeCount}× ` : ''}{componentPlacementTemplate?.name || 'Component'}</span>
          <span className="text-indigo-200 text-xs">Click to place · Esc=done</span>
          <button
            onClick={cancelDrawing}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded text-xs"
          >
            Done
          </button>
        </div>
      )}
      {drawingMode === 'exclusion-zone' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10 flex items-center gap-3">
          <span>⛔ Drawing Exclusion Zone</span>
          <span className="text-red-200 text-xs">Click+drag to draw · Esc=done</span>
          <button onClick={cancelDrawing}
            className="px-2 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-xs">
            Done
          </button>
        </div>
      )}

      {/* Zoom controls — bottom-right floating bar */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700/50 px-1 py-1 z-20">
        <button
          onClick={fitAll}
          title="Fit all sets in view"
          className="px-2 py-1 text-[11px] font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          Fit All
        </button>
        <div className="w-px h-5 bg-gray-600" />
        <button
          onClick={zoomOut}
          title="Zoom out"
          className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors text-lg font-bold leading-none"
        >
          −
        </button>
        <span className="text-[11px] text-gray-400 w-12 text-center tabular-nums select-none">
          {zoomLevel}%
        </span>
        <button
          onClick={zoomIn}
          title="Zoom in"
          className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors text-lg font-bold leading-none"
        >
          +
        </button>
        <div className="w-px h-5 bg-gray-600" />
        <button
          onClick={zoomReset}
          title="Reset zoom to 100%"
          className="px-2 py-1 text-[11px] font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          1:1
        </button>
      </div>
    </div>
  )
}
