import { useEffect, useRef, useState, useCallback } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'
import { drawObjectOnCtx as drawAnnoOnCtx } from '../lib/annoDraw.js'

// Draw-on-image editor. The <img> element handles image display (browser-
// managed via object-fit: contain so the whole picture is always visible).
// A fabric.Canvas overlays it for the annotation layer. Strokes/shapes/
// text are captured in DISPLAY coords, scaled to image-native pixels on
// save so annotations survive any viewport size / device / zoom level.

const TOOLS = [
  { id: 'draw',      label: '✎',   title: 'Freehand draw' },
  { id: 'highlight', label: '🖍', title: 'Highlighter (translucent thick stroke)' },
  { id: 'line',      label: '╱',   title: 'Straight line' },
  { id: 'arrow',     label: '➤',   title: 'Arrow' },
  { id: 'rect',      label: '▭',   title: 'Rectangle' },
  { id: 'ellipse',   label: '◯',   title: 'Ellipse' },
  { id: 'text',      label: 'T',   title: 'Text label' },
  { id: 'select',    label: '↕',   title: 'Select / move / resize existing annotation' },
  { id: 'erase',     label: '⌫',   title: 'Erase — tap an annotation to delete it' },
]

const COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#000000', '#ffffff']
const WIDTHS = [1, 2, 3, 4, 6, 10, 16]

// Tool → default stroke width map (highlighter is thick by default)
const DEFAULT_WIDTH = { draw: 4, highlight: 20, line: 3, arrow: 3, rect: 2, ellipse: 2 }

export default function AnnotateImageModal() {
  const annotatingRefId = useStore(s => s.annotatingRefId)
  const setAnnotatingRefId = useStore(s => s.setAnnotatingRefId)
  const getRef = useStore(s => s.getRef)
  const updateRef = useStore(s => s.updateRef)

  const wrapperRef = useRef(null)
  const viewportRef = useRef(null)         // inner div — carries pan+zoom CSS transform
  const imgRef = useRef(null)
  const canvasElRef = useRef(null)
  const fcRef = useRef(null)
  const displayRef = useRef(null) // { natW, natH, dispW, dispH, dispLeft, dispTop, rotation, zoom }
  const shapeDrawStateRef = useRef({ startPt: null, active: null }) // in-flight shape drag
  const spaceHeldRef = useRef(false)       // desktop: space bar = temporary pan mode
  const panStateRef = useRef({ active: false, sx: 0, sy: 0, sPan: null })
  const touchPanRef = useRef({ active: false, ids: [], startCentroid: null, startDist: null, startPan: null, startZoom: null })
  // Latest tool / color / width kept in refs so initFabricOverlay can read
  // them without listing them in its deps. Otherwise every tool switch
  // recreates initFabricOverlay → triggers the layoutTick useEffect →
  // reloads the overlay from stale refRow.annotations_json and revives
  // any annotations the user just deleted. Initialised to null; the sync
  // effects below fill them from state on the first render commit.
  // NB: MUST use `null` (not `tool`) because `tool` is declared BELOW —
  // referencing it here would be a TDZ ReferenceError.
  const toolRef = useRef(null)
  const colorRef = useRef(null)
  const widthRef = useRef(null)

  const [refRow, setRefRow] = useState(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tool, setTool] = useState('draw')
  const [color, setColor] = useState('#ef4444')
  const [width, setWidth] = useState(4)
  const [fontSize, setFontSize] = useState(24)
  const [rotation, setRotation] = useState(0) // 0 | 90 | 180 | 270 — CSS rotation of img + overlay
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [objectCount, setObjectCount] = useState(0)
  const historyRef = useRef({ past: [], future: [] })
  const [layoutTick, setLayoutTick] = useState(0)

  // ----- Load the ref + image blob -----
  useEffect(() => {
    if (!annotatingRefId) { setRefRow(null); setImgUrl(null); return }
    // Reset zoom/pan/rotation on every modal open — leftover state from a
    // prior session was rendering the image at some old zoom while the
    // fabric overlay initialised at a different scale, producing a broken
    // display where annotations sit outside the image.
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
    setRotation(0)
    setLoading(true)
    setError(null)
    let cancelled = false
    getRef(annotatingRefId)
      .then(async (r) => {
        if (cancelled) return
        if (!r) { setError('Reference not found'); setLoading(false); return }
        if (!r.file_id) { setError('This reference has no image to annotate'); setLoading(false); return }
        if (!(r.file_mime_type || '').startsWith('image/')) {
          setError('Only image references can be annotated (this one is ' + (r.file_mime_type || 'unknown') + ')')
          setLoading(false); return
        }
        const token = localStorage.getItem('floorplan-token')
        try {
          const resp = await fetch(`/api/files/${r.file_id}/raw`, {
            headers: { 'Authorization': `Bearer ${token}` },
          })
          if (!resp.ok) throw new Error('Fetch image failed: ' + resp.status)
          const blob = await resp.blob()
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          setRefRow(r)
          setImgUrl(url)
          // Restore rotation if saved
          try {
            const parsed = r.annotations_json ? JSON.parse(r.annotations_json) : null
            if (parsed?.rotation) setRotation(parsed.rotation)
          } catch {}
        } catch (e) {
          setError(e.message); setLoading(false)
        }
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [annotatingRefId, getRef])

  // Keep the tool refs in sync with state so initFabricOverlay reads the
  // latest without listing them in its deps.
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { widthRef.current = width }, [width])

  // ----- Init fabric overlay after <img> renders -----
  const initFabricOverlay = useCallback(() => {
    const img = imgRef.current
    const wrapper = wrapperRef.current
    const canvasEl = canvasElRef.current
    if (!img || !wrapper || !canvasEl || !imgUrl || !refRow) return
    if (!img.complete || img.naturalWidth === 0) return

    if (fcRef.current) { fcRef.current.dispose(); fcRef.current = null }

    const imgRect = img.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const dispW = Math.max(1, Math.round(imgRect.width))
    const dispH = Math.max(1, Math.round(imgRect.height))
    const dispLeft = imgRect.left - wrapperRect.left
    const dispTop = imgRect.top - wrapperRect.top
    const natW = img.naturalWidth
    const natH = img.naturalHeight

    canvasEl.style.position = 'absolute'
    canvasEl.style.left = `${dispLeft}px`
    canvasEl.style.top = `${dispTop}px`

    // Read current tool/color/width via refs so this useCallback doesn't
    // list them as deps (that would recreate the callback on every tool
    // switch and re-trigger the layoutTick useEffect, wiping in-memory
    // deletions).
    const curTool = toolRef.current
    const curColor = colorRef.current
    const curWidth = widthRef.current

    const fc = new fabric.Canvas(canvasEl, {
      width: dispW, height: dispH,
      selection: curTool === 'select',
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
    })

    const fcWrapper = fc.wrapperEl || canvasEl.parentElement
    if (fcWrapper && fcWrapper !== wrapper) {
      fcWrapper.style.position = 'absolute'
      fcWrapper.style.left = `${dispLeft}px`
      fcWrapper.style.top = `${dispTop}px`
      fcWrapper.style.pointerEvents = 'auto'
    }

    // Load saved annotations (mixed types) — scale native → display
    const nativeToDisplay = dispW / natW
    let saved = null
    if (refRow.annotations_json) {
      try { saved = JSON.parse(refRow.annotations_json) } catch {}
    }
    const savedObjects = extractObjectsFromSaved(saved)
    if (savedObjects.length > 0) {
      const scaledForDisplay = savedObjects.map(o => scaleObject(o, nativeToDisplay))
      fabric.util.enlivenObjects(scaledForDisplay).then((enlivened) => {
        for (const o of enlivened) {
          o.set({ name: 'anno', selectable: toolRef.current === 'select', evented: toolRef.current === 'select' || toolRef.current === 'erase' })
          fc.add(o)
        }
        setObjectCount(countAnno(fc))
        fc.requestRenderAll()
      })
    }

    configureBrush(fc, curTool, curColor, curWidth)
    fc.defaultCursor = curTool === 'text' ? 'text' : 'crosshair'
    fc.hoverCursor = curTool === 'select' ? 'move' : (curTool === 'text' ? 'text' : 'crosshair')

    fcRef.current = fc
    displayRef.current = { natW, natH, dispW, dispH, dispLeft, dispTop }

    // Freehand + highlight: fabric.PencilBrush captures the path itself.
    // Read current tool via toolRef so this reflects what's selected when
    // the stroke lands, not what was selected at canvas init.
    fc.on('path:created', (opt) => {
      const path = opt?.path
      if (!path) return
      pushHistorySnapshot(fc)
      path.set({ name: 'anno', selectable: false, evented: toolRef.current === 'erase' })
      if (toolRef.current === 'highlight') path.set({ opacity: 0.4 })
      fc.requestRenderAll()
      setObjectCount(countAnno(fc))
    })

    setLoading(false)
    // tool/color/width intentionally NOT in deps — kept out via refs so
    // tool switches don't re-init the overlay and wipe in-memory edits.
  }, [imgUrl, refRow])

  const handleImgLoad = () => {
    requestAnimationFrame(() => requestAnimationFrame(initFabricOverlay))
  }

  // Resize handler — re-init overlay while preserving annotations
  useEffect(() => {
    if (!imgUrl) return
    let raf = null
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        const fc = fcRef.current
        const disp = displayRef.current
        if (fc && disp) {
          const nativeObjects = collectObjectsInNative(fc, disp)
          setRefRow(r => r ? { ...r, annotations_json: JSON.stringify({ version: 2, objects: nativeObjects, rotation }) } : r)
        }
        setLayoutTick(t => t + 1)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [imgUrl, rotation])

  useEffect(() => {
    if (layoutTick > 0) initFabricOverlay()
  }, [layoutTick, initFabricOverlay])

  // Also re-init when rotation changes (so overlay lands on the rotated img)
  useEffect(() => {
    setLayoutTick(t => t + 1)
  }, [rotation])

  // Cleanup
  useEffect(() => {
    return () => {
      if (fcRef.current) { fcRef.current.dispose(); fcRef.current = null }
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      displayRef.current = null
      historyRef.current = { past: [], future: [] }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotatingRefId])

  // Sync tool / color / width to fabric — swap brush, cursor, selectability
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    configureBrush(fc, tool, color, width)
    fc.selection = tool === 'select'
    fc.defaultCursor = tool === 'text' ? 'text' : 'crosshair'
    fc.hoverCursor = tool === 'select' ? 'move' : (tool === 'text' ? 'text' : 'crosshair')
    for (const o of fc.getObjects()) {
      if (o.name === 'anno') {
        o.set({
          selectable: tool === 'select',
          evented: tool === 'select' || tool === 'erase',
        })
      }
    }
    if (tool !== 'select') fc.discardActiveObject()
    fc.requestRenderAll()
  }, [tool, color, width])

  // Shape drawing handlers — click-drag for rect/ellipse/line/arrow;
  // click for text; erase for click-to-delete.
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    const isShape = ['rect', 'ellipse', 'line', 'arrow'].includes(tool)

    const onDown = (opt) => {
      if (tool === 'text') {
        const pt = fc.getScenePoint(opt.e)
        pushHistorySnapshot(fc)
        const t = new fabric.IText('Text', {
          left: pt.x, top: pt.y,
          fontSize: fontSize, fill: color,
          fontFamily: 'sans-serif',
          editable: true,
          name: 'anno',
          selectable: true,
          evented: true,
        })
        fc.add(t)
        fc.setActiveObject(t)
        t.enterEditing()
        t.selectAll()
        fc.requestRenderAll()
        setObjectCount(countAnno(fc))
        return
      }
      if (tool === 'erase') {
        const t = opt?.target
        if (t && t.name === 'anno') {
          pushHistorySnapshot(fc)
          fc.remove(t)
          fc.requestRenderAll()
          setObjectCount(countAnno(fc))
        }
        return
      }
      if (!isShape) return
      const pt = fc.getScenePoint(opt.e)
      shapeDrawStateRef.current.startPt = pt
      let shape
      if (tool === 'rect') {
        shape = new fabric.Rect({
          left: pt.x, top: pt.y, width: 0, height: 0,
          stroke: color, strokeWidth: width, fill: 'transparent',
          selectable: false, evented: false, name: 'anno',
        })
      } else if (tool === 'ellipse') {
        shape = new fabric.Ellipse({
          left: pt.x, top: pt.y, rx: 0, ry: 0,
          stroke: color, strokeWidth: width, fill: 'transparent',
          selectable: false, evented: false, name: 'anno',
        })
      } else if (tool === 'line' || tool === 'arrow') {
        // Both line and arrow rendered as fabric.Path — arrow adds
        // arrowhead lines from the endpoint. Two commands to start:
        // move-to (x1,y1), line-to (x1,y1) (will grow with mouse move)
        shape = new fabric.Path(`M ${pt.x} ${pt.y} L ${pt.x} ${pt.y}`, {
          stroke: color, strokeWidth: width, fill: '',
          strokeLineCap: 'round', strokeLineJoin: 'round',
          selectable: false, evented: false, name: 'anno',
          objectCaching: false,
        })
        shape._annoKind = tool // remember whether to draw arrowhead on finish
        shape._annoStart = { x: pt.x, y: pt.y }
      }
      if (shape) {
        fc.add(shape)
        shapeDrawStateRef.current.active = shape
      }
    }

    const onMove = (opt) => {
      const st = shapeDrawStateRef.current
      if (!isShape || !st.active || !st.startPt) return
      const pt = fc.getScenePoint(opt.e)
      const s = st.active
      if (tool === 'rect') {
        s.set({
          left: Math.min(st.startPt.x, pt.x),
          top: Math.min(st.startPt.y, pt.y),
          width: Math.abs(pt.x - st.startPt.x),
          height: Math.abs(pt.y - st.startPt.y),
        })
      } else if (tool === 'ellipse') {
        const rx = Math.abs(pt.x - st.startPt.x) / 2
        const ry = Math.abs(pt.y - st.startPt.y) / 2
        s.set({
          left: Math.min(st.startPt.x, pt.x),
          top: Math.min(st.startPt.y, pt.y),
          rx, ry,
        })
      } else if (tool === 'line' || tool === 'arrow') {
        // Rebuild the path from start to current pointer
        const x1 = st.startPt.x, y1 = st.startPt.y
        const x2 = pt.x, y2 = pt.y
        const cmds = buildLineOrArrowPath(x1, y1, x2, y2, tool === 'arrow', width)
        const newPath = new fabric.Path(cmds, {
          stroke: color, strokeWidth: width, fill: '',
          strokeLineCap: 'round', strokeLineJoin: 'round',
          selectable: false, evented: false, name: 'anno',
          objectCaching: false,
        })
        newPath._annoKind = tool
        newPath._annoStart = { x: x1, y: y1 }
        fc.remove(s)
        fc.add(newPath)
        shapeDrawStateRef.current.active = newPath
      }
      fc.requestRenderAll()
    }

    const onUp = () => {
      const st = shapeDrawStateRef.current
      if (!isShape || !st.active) { st.startPt = null; st.active = null; return }
      const s = st.active
      // Discard zero-size shapes (user just clicked, didn't drag)
      let keep = true
      if (tool === 'rect' && (s.width < 2 || s.height < 2)) keep = false
      if (tool === 'ellipse' && (s.rx < 2 || s.ry < 2)) keep = false
      if ((tool === 'line' || tool === 'arrow') && s._annoStart) {
        const path = s.path
        const last = path[path.length - 1]
        const lastX = last?.[last.length - 2]
        const lastY = last?.[last.length - 1]
        const dx = (lastX ?? 0) - s._annoStart.x
        const dy = (lastY ?? 0) - s._annoStart.y
        if (Math.hypot(dx, dy) < 3) keep = false
      }
      if (!keep) {
        fc.remove(s)
      } else {
        pushHistorySnapshot(fc)
      }
      st.startPt = null
      st.active = null
      fc.requestRenderAll()
      setObjectCount(countAnno(fc))
    }

    fc.on('mouse:down', onDown)
    fc.on('mouse:move', onMove)
    fc.on('mouse:up', onUp)
    return () => {
      fc.off('mouse:down', onDown)
      fc.off('mouse:move', onMove)
      fc.off('mouse:up', onUp)
    }
  }, [tool, color, width, fontSize])

  // Track object edits (drag/resize/text changes) for history + count
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    const onModified = () => {
      pushHistorySnapshot(fc)
      setObjectCount(countAnno(fc))
    }
    fc.on('object:modified', onModified)
    return () => fc.off('object:modified', onModified)
  }, [])

  // ----- Zoom / pan: wheel + mouse (space+drag or middle-click) + 2-finger touch -----
  // All handlers are attached imperatively on the wrapper with capture=true
  // so we can steal events from fabric before they reach the drawing layer.
  useEffect(() => {
    const w = wrapperRef.current
    if (!w || !imgUrl) return

    const onWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = w.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setZoom(oldZoom => {
        const newZoom = clampZoom(oldZoom * factor)
        setPanOffset(p => ({
          x: mx - (mx - p.x) * (newZoom / oldZoom),
          y: my - (my - p.y) * (newZoom / oldZoom),
        }))
        return newZoom
      })
    }

    const onMouseDown = (e) => {
      // Middle button OR space+drag = pan mode.
      const isPan = e.button === 1 || (e.button === 0 && spaceHeldRef.current)
      if (!isPan) return
      e.preventDefault()
      e.stopPropagation()
      panStateRef.current = {
        active: true, sx: e.clientX, sy: e.clientY,
        sPan: { ...panOffset },
      }
    }
    const onMouseMove = (e) => {
      const st = panStateRef.current
      if (!st.active) return
      e.preventDefault()
      e.stopPropagation()
      setPanOffset({
        x: st.sPan.x + (e.clientX - st.sx),
        y: st.sPan.y + (e.clientY - st.sy),
      })
    }
    const onMouseUp = (e) => {
      if (!panStateRef.current.active) return
      e.preventDefault()
      e.stopPropagation()
      panStateRef.current.active = false
    }

    const onTouchStart = (e) => {
      // Only 2-finger gestures trigger pan/zoom. Single touch is left for
      // fabric (drawing / selecting).
      if (e.touches.length < 2) return
      e.preventDefault()
      e.stopPropagation()
      const t1 = e.touches[0], t2 = e.touches[1]
      const cx = (t1.clientX + t2.clientX) / 2
      const cy = (t1.clientY + t2.clientY) / 2
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      touchPanRef.current = {
        active: true,
        ids: [t1.identifier, t2.identifier],
        startCentroid: { x: cx, y: cy },
        startDist: dist,
        startPan: { ...panOffset },
        startZoom: zoom,
      }
    }
    const onTouchMove = (e) => {
      const st = touchPanRef.current
      if (!st.active) return
      const arr = [...e.touches]
      const t1 = arr.find(t => t.identifier === st.ids[0])
      const t2 = arr.find(t => t.identifier === st.ids[1])
      if (!t1 || !t2) return
      e.preventDefault()
      e.stopPropagation()
      const cx = (t1.clientX + t2.clientX) / 2
      const cy = (t1.clientY + t2.clientY) / 2
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const newZoom = clampZoom(st.startZoom * (dist / st.startDist))
      const rect = w.getBoundingClientRect()
      const cxLocal = st.startCentroid.x - rect.left
      const cyLocal = st.startCentroid.y - rect.top
      const cdx = cx - st.startCentroid.x
      const cdy = cy - st.startCentroid.y
      const r = newZoom / st.startZoom
      setZoom(newZoom)
      setPanOffset({
        x: cxLocal - (cxLocal - st.startPan.x) * r + cdx,
        y: cyLocal - (cyLocal - st.startPan.y) * r + cdy,
      })
    }
    const onTouchEnd = (e) => {
      if (e.touches.length < 2 && touchPanRef.current.active) {
        touchPanRef.current.active = false
      }
    }

    w.addEventListener('wheel',      onWheel,      { passive: false, capture: true })
    w.addEventListener('mousedown',  onMouseDown,  { capture: true })
    w.addEventListener('mousemove',  onMouseMove,  { capture: true })
    w.addEventListener('mouseup',    onMouseUp,    { capture: true })
    w.addEventListener('mouseleave', onMouseUp,    { capture: true })
    w.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
    w.addEventListener('touchmove',  onTouchMove,  { passive: false, capture: true })
    w.addEventListener('touchend',   onTouchEnd,   { passive: false, capture: true })
    w.addEventListener('touchcancel',onTouchEnd,   { passive: false, capture: true })
    return () => {
      w.removeEventListener('wheel',      onWheel,      { capture: true })
      w.removeEventListener('mousedown',  onMouseDown,  { capture: true })
      w.removeEventListener('mousemove',  onMouseMove,  { capture: true })
      w.removeEventListener('mouseup',    onMouseUp,    { capture: true })
      w.removeEventListener('mouseleave', onMouseUp,    { capture: true })
      w.removeEventListener('touchstart', onTouchStart, { capture: true })
      w.removeEventListener('touchmove',  onTouchMove,  { capture: true })
      w.removeEventListener('touchend',   onTouchEnd,   { capture: true })
      w.removeEventListener('touchcancel',onTouchEnd,   { capture: true })
    }
  }, [imgUrl, panOffset, zoom])

  // Track Space key for temporary pan mode
  useEffect(() => {
    if (!annotatingRefId) return
    const onDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        // Avoid conflicting with text editing
        const active = fcRef.current?.getActiveObject()
        if (active?.isEditing) return
        spaceHeldRef.current = true
        e.preventDefault()
      }
    }
    const onUp = (e) => {
      if (e.code === 'Space') { spaceHeldRef.current = false; e.preventDefault() }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [annotatingRefId])

  // Keyboard shortcuts
  useEffect(() => {
    if (!annotatingRefId) return
    const onKey = (e) => {
      // Avoid capturing shortcuts while typing in text objects
      const active = fcRef.current?.getActiveObject()
      if (active?.isEditing) return
      if (e.key === 'Escape') { setAnnotatingRefId(null); return }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doRedo() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select') {
        const fc = fcRef.current
        const sel = fc?.getActiveObject()
        if (sel && sel.name === 'anno') {
          e.preventDefault()
          pushHistorySnapshot(fc)
          fc.remove(sel)
          fc.discardActiveObject()
          fc.requestRenderAll()
          setObjectCount(countAnno(fc))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotatingRefId, setAnnotatingRefId, tool])

  if (!annotatingRefId) return null

  const handleSave = async () => {
    const fc = fcRef.current
    const disp = displayRef.current
    if (!fc || !disp) return
    setSaving(true)
    setError(null)
    try {
      const objects = collectObjectsInNative(fc, disp)
      await updateRef(annotatingRefId, {
        annotations_json: JSON.stringify({
          version: 2, objects, rotation, updated_at: new Date().toISOString(),
        }),
      })
      // Toast in App.jsx so the user sees where it landed + a jump link.
      const setId = refRow?.set_id || null
      let targetLabel = 'Project References'
      if (setId) {
        const st = useStore.getState().sets.find(s => s.id === setId)
        targetLabel = st ? `“${st.name}”` : 'set references'
      }
      useStore.getState().setAnnotateSavedNotice({
        message: `Saved to ${targetLabel}`,
        target: setId || 'project',
        refId: annotatingRefId,
        at: Date.now(),
      })
      setAnnotatingRefId(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleClearAll = () => {
    const fc = fcRef.current
    if (!fc) return
    if (!window.confirm('Erase all annotations on this image?')) return
    pushHistorySnapshot(fc)
    for (const o of fc.getObjects().filter(o => o.name === 'anno')) fc.remove(o)
    fc.discardActiveObject()
    fc.requestRenderAll()
    setObjectCount(0)
  }

  const handleFlattenExport = async () => {
    const disp = displayRef.current
    const fc = fcRef.current
    if (!disp || !fc || !imgUrl) return
    try {
      // Draw everything with plain 2D Canvas ops — no fabric involved in
      // the composite. Fabric's own render path was producing warped
      // output here (annotations stretched horizontally, squashed
      // vertically). The plain-canvas replay renders each object at its
      // exact saved coords, provably.
      const img = new Image()
      img.src = imgUrl
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej })

      const swap = rotation % 180 !== 0
      const outW = swap ? disp.natH : disp.natW
      const outH = swap ? disp.natW : disp.natH

      const out = document.createElement('canvas')
      out.width = outW; out.height = outH
      const ctx = out.getContext('2d')

      // Image (rotated if the user rotated it)
      ctx.save()
      ctx.translate(outW / 2, outH / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(img, -disp.natW / 2, -disp.natH / 2, disp.natW, disp.natH)
      ctx.restore()

      // Annotations at absolute native coords
      const nativeObjects = collectObjectsInNative(fc, disp)
      if (nativeObjects.length > 0) {
        ctx.save()
        ctx.translate(outW / 2, outH / 2)
        ctx.rotate((rotation * Math.PI) / 180)
        ctx.translate(-disp.natW / 2, -disp.natH / 2)
        for (const o of nativeObjects) drawAnnoOnCtx(ctx, o)
        ctx.restore()
      }

      out.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const filename = `${(refRow?.label || 'annotated').replace(/[^a-z0-9_.-]+/gi, '_')}_annotated.png`
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }, 'image/png')
    } catch (e) {
      setError(e.message)
    }
  }

  const doUndo = () => {
    const fc = fcRef.current
    if (!fc) return
    const hist = historyRef.current
    if (hist.past.length === 0) return
    hist.future.unshift(snapshot(fc))
    const prev = hist.past.pop()
    restoreSnapshot(fc, prev)
    setObjectCount(countAnno(fc))
  }
  const doRedo = () => {
    const fc = fcRef.current
    if (!fc) return
    const hist = historyRef.current
    if (hist.future.length === 0) return
    hist.past.push(snapshot(fc))
    const next = hist.future.shift()
    restoreSnapshot(fc, next)
    setObjectCount(countAnno(fc))
  }
  const pushHistorySnapshot = (fc) => {
    const hist = historyRef.current
    hist.past.push(snapshot(fc))
    if (hist.past.length > 50) hist.past.shift()
    hist.future = []
  }

  const rotateBy = (delta) => {
    setRotation(r => (((r + delta) % 360) + 360) % 360)
  }

  // Set tool with a nice UX: pick a good default width if user hasn't tuned it
  const pickTool = (t) => {
    setTool(t)
    const def = DEFAULT_WIDTH[t]
    if (def) setWidth(def)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex flex-col p-2"
      onClick={() => setAnnotatingRefId(null)}>
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full h-full flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-gray-700 bg-gray-800">
          <span className="text-sm font-semibold text-white truncate max-w-[24ch]" title={refRow?.label}>
            ✎ {refRow?.label || 'Annotate'}
          </span>
          <div className="h-4 w-px bg-gray-600 mx-1" />

          {/* Tool picker */}
          {TOOLS.map(t => (
            <button key={t.id}
              onClick={() => pickTool(t.id)}
              title={t.title}
              className={`w-8 h-7 rounded text-sm flex items-center justify-center ${
                tool === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}>
              {t.label}
            </button>
          ))}

          <div className="h-4 w-px bg-gray-600 mx-1" />

          {/* Colors */}
          {COLORS.map(c => (
            <button key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-gray-600'}`}
              style={{ backgroundColor: c }}
            />
          ))}

          {/* Width */}
          {tool !== 'text' && tool !== 'select' && tool !== 'erase' && (
            <select
              value={width}
              onChange={e => setWidth(parseInt(e.target.value))}
              className="px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-[11px] text-white ml-1"
              title="Stroke width"
            >
              {WIDTHS.map(w => <option key={w} value={w}>{w} px</option>)}
            </select>
          )}

          {/* Font size — only for text tool */}
          {tool === 'text' && (
            <select
              value={fontSize}
              onChange={e => setFontSize(parseInt(e.target.value))}
              className="px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-[11px] text-white ml-1"
              title="Font size"
            >
              {[12, 16, 20, 24, 32, 48, 64].map(s => <option key={s} value={s}>{s}pt</option>)}
            </select>
          )}

          <div className="h-4 w-px bg-gray-600 mx-1" />

          {/* Rotate */}
          <button onClick={() => rotateBy(-90)}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs"
            title="Rotate 90° left">↺</button>
          <button onClick={() => rotateBy(90)}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs"
            title="Rotate 90° right">↻</button>

          <div className="h-4 w-px bg-gray-600 mx-1" />

          {/* Zoom controls — wheel zooms at cursor, space+drag or two-
              finger pan. These buttons are here as a fallback. */}
          <button onClick={() => setZoom(z => clampZoom(z / 1.2))}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-bold"
            title="Zoom out">−</button>
          <button
            onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-[10px] min-w-[3rem]"
            title="Reset zoom + pan (Space+drag or wheel to zoom)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom(z => clampZoom(z * 1.2))}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-bold"
            title="Zoom in">+</button>

          <div className="h-4 w-px bg-gray-600 mx-1" />

          {/* Undo / redo */}
          <button onClick={doUndo}
            disabled={historyRef.current.past.length === 0}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-200 rounded text-xs"
            title="Undo (Ctrl+Z)">↩</button>
          <button onClick={doRedo}
            disabled={historyRef.current.future.length === 0}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-200 rounded text-xs"
            title="Redo (Ctrl+Shift+Z)">↪</button>

          {objectCount > 0 && (
            <button onClick={handleClearAll}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs">
              Clear
            </button>
          )}
          <span className="text-[10px] text-gray-500 ml-1">
            {objectCount} item{objectCount === 1 ? '' : 's'}
          </span>

          <div className="flex-1" />

          <button onClick={handleFlattenExport}
            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs"
            title="Download flattened PNG">
            ⬇ Export
          </button>
          <button onClick={() => setAnnotatingRefId(null)}
            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium rounded text-xs">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {error && (
          <div className="mx-3 mt-2 px-3 py-2 bg-red-900/40 border border-red-700 text-red-200 text-xs rounded">
            {error}
          </div>
        )}

        {/* Canvas area. Outer wrapper is fixed-size (flex-1). The inner
            viewport div carries the pan+zoom CSS transform, and everything
            inside (img + fabric overlay canvas) scales/translates together
            keeping the annotation aligned to the image at any zoom. */}
        <div ref={wrapperRef}
          className="flex-1 relative bg-gray-950 overflow-hidden"
          style={{
            touchAction: 'none',
            cursor: spaceHeldRef.current ? 'grab' : undefined,
          }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm z-10">
              Loading image…
            </div>
          )}
          <div ref={viewportRef}
            className="absolute inset-0"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: panStateRef.current.active || touchPanRef.current.active ? 'none' : 'transform 60ms',
            }}
          >
            {imgUrl && (
              <img
                ref={imgRef}
                src={imgUrl}
                alt=""
                onLoad={handleImgLoad}
                className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 120ms' }}
                draggable={false}
              />
            )}
            <canvas ref={canvasElRef}
              style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center center', transition: 'transform 120ms' }} />
          </div>

          {/* Zoom hint overlay (bottom-right) — subtle */}
          {(zoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-[10px] text-gray-300 rounded font-mono pointer-events-none">
              {Math.round(zoom * 100)}%
              {(panOffset.x !== 0 || panOffset.y !== 0) && ` · pan ${panOffset.x | 0},${panOffset.y | 0}`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- helpers ----------

function countAnno(fc) {
  return fc.getObjects().filter(o => o.name === 'anno').length
}

function clampZoom(z) { return Math.max(0.1, Math.min(10, z)) }

function configureBrush(fc, tool, color, width) {
  if (tool === 'draw') {
    const b = new fabric.PencilBrush(fc)
    b.color = color
    b.width = width
    fc.freeDrawingBrush = b
    fc.isDrawingMode = true
  } else if (tool === 'highlight') {
    const b = new fabric.PencilBrush(fc)
    // Use a semi-transparent color for the highlighter effect
    b.color = hexWithAlpha(color, 0.4)
    b.width = width
    fc.freeDrawingBrush = b
    fc.isDrawingMode = true
  } else {
    fc.isDrawingMode = false
  }
}

function hexWithAlpha(hex, alpha) {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `#${h}${a}`
}

// Build the SVG path array for a straight line, plus optional arrowhead
function buildLineOrArrowPath(x1, y1, x2, y2, arrow, strokeWidth) {
  const parts = [`M ${x1} ${y1} L ${x2} ${y2}`]
  if (arrow) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLen = Math.max(12, strokeWidth * 4)
    const headWidth = Math.PI / 7
    const hx1 = x2 - headLen * Math.cos(angle - headWidth)
    const hy1 = y2 - headLen * Math.sin(angle - headWidth)
    const hx2 = x2 - headLen * Math.cos(angle + headWidth)
    const hy2 = y2 - headLen * Math.sin(angle + headWidth)
    parts.push(`M ${hx1} ${hy1} L ${x2} ${y2} L ${hx2} ${hy2}`)
  }
  return parts.join(' ')
}

// Undo/redo: full serialized-object snapshot of the annotation layer
function snapshot(fc) {
  return fc.getObjects()
    .filter(o => o.name === 'anno')
    .map(o => o.toObject(['name', 'opacity']))
}
function restoreSnapshot(fc, snap) {
  for (const o of fc.getObjects().filter(o => o.name === 'anno')) fc.remove(o)
  fabric.util.enlivenObjects(snap).then((objs) => {
    for (const o of objs) {
      o.set({ name: 'anno' })
      fc.add(o)
    }
    fc.requestRenderAll()
  })
}

// Serialize annotation layer at NATIVE image pixel coords for persistence.
// Uses fabric's toObject(), normalises origin to 'left'/'top' so round-trip
// reload doesn't get an origin-mismatched position, then scales
// left/top/dimensions by native/display.
export function collectObjectsInNative(fc, disp) {
  const scale = disp.natW / disp.dispW
  return fc.getObjects()
    .filter(o => o.name === 'anno')
    .map(o => scaleObject(normalizeOriginToLeftTop(o.toObject(['name', 'opacity'])), scale))
}

// Force originX='left', originY='top' on a serialized object, shifting
// left/top to match. fabric v7 defaults some object types (Path in
// particular) to origin='center', but PencilBrush and shape drawing
// don't set it explicitly — the resulting mismatch between authored
// and reconstructed origin was silently shifting the visual position
// by half the bbox on every round trip.
function normalizeOriginToLeftTop(o) {
  const out = { ...o }
  const w = out.width || 0
  const h = out.height || 0
  if (out.originX === 'center') { out.left = (out.left || 0) - w / 2; out.originX = 'left' }
  else if (out.originX === 'right') { out.left = (out.left || 0) - w; out.originX = 'left' }
  if (out.originY === 'center') { out.top = (out.top || 0) - h / 2; out.originY = 'top' }
  else if (out.originY === 'bottom') { out.top = (out.top || 0) - h; out.originY = 'top' }
  return out
}

// Pull annotation objects out of a saved annotations_json blob. Supports
// both the v2 format ({version:2, objects: [...], rotation}) and the old
// v1 format ({strokes: [...]}) for backward compat.
export function extractObjectsFromSaved(saved) {
  if (!saved) return []
  if (Array.isArray(saved.objects)) {
    // Migrate any center-origin objects saved before the origin fix so
    // existing annotations render at the position the user drew them.
    return saved.objects.map(normalizeOriginToLeftTop)
  }
  if (Array.isArray(saved.strokes)) {
    // v1 → v2: strokes were fabric.Path shapes stored as {path,left,top,color,width}
    return saved.strokes.map(s => ({
      type: 'Path', // fabric v6+ enliven accepts capitalized type
      path: s.path,
      left: s.left || 0,
      top: s.top || 0,
      stroke: s.color || '#ef4444',
      strokeWidth: s.width || 3,
      fill: null,
      strokeLineCap: 'round', strokeLineJoin: 'round',
      originX: 'left', originY: 'top',
      name: 'anno',
    }))
  }
  return []
}

// Scale a serialized fabric object's positions/dimensions by `s`. Works
// across every shape type we produce here (Path, Rect, Ellipse, IText,
// Line). Ignores `scaleX`/`scaleY` — we bake the scale into the primary
// dimensions so display parameters are always meaningful.
export function scaleObject(o, s) {
  const out = { ...o }
  if (out.left != null) out.left = out.left * s
  if (out.top != null) out.top = out.top * s
  if (out.strokeWidth != null) out.strokeWidth = out.strokeWidth * s
  if (out.width != null) out.width = out.width * s
  if (out.height != null) out.height = out.height * s
  if (out.radius != null) out.radius = out.radius * s
  if (out.rx != null) out.rx = out.rx * s
  if (out.ry != null) out.ry = out.ry * s
  if (out.fontSize != null) out.fontSize = out.fontSize * s
  if (out.x1 != null) { out.x1 *= s; out.y1 *= s; out.x2 *= s; out.y2 *= s }
  if (Array.isArray(out.path)) {
    out.path = out.path.map(cmd => cmd.map((v, i) => i === 0 ? v : v * s))
  }
  return out
}

// Legacy shim kept for ReferenceSheetModal's print composite. Adds a
// single native-space "stroke" (old v1 shape) to a fabric canvas that's
// already sized to image-native.
export function addStrokeToCanvas(fc, stroke) {
  const p = new fabric.Path(stroke.path, {
    left: stroke.left || 0,
    top: stroke.top || 0,
    stroke: stroke.color || '#ef4444',
    strokeWidth: stroke.width || 3,
    fill: null,
    strokeLineCap: 'round', strokeLineJoin: 'round',
    selectable: false, evented: false,
    name: 'stroke',
  })
  fc.add(p)
}

// Legacy export kept for symmetry with pre-v2 external callers.
export function collectStrokes(fc) {
  return fc.getObjects().filter(o => o.name === 'stroke' || o.name === 'anno').map(o => ({
    path: o.path ? structuredClone(o.path) : [],
    left: o.left || 0,
    top: o.top || 0,
    color: o.stroke || '#ef4444',
    width: o.strokeWidth || 3,
  }))
}
