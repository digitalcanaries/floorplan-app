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
  { id: 'crop',      label: '✂',   title: 'Crop — drag a rectangle; export/print output just that region' },
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
  // Migration cache: old element-space data is migrated to image-space ONCE
  // per modal session and reused on every re-init. Without this, each
  // re-init (layout settle, resize, tool switch) re-measured the window and
  // re-migrated to a slightly different result — so an export could catch a
  // different migration than the subsequent save, corrupting the saved
  // coords. Keyed by ref id; cleared when the modal opens a different ref.
  const migratedCacheRef = useRef({ refId: null, objects: null })
  // Current viewport fit scale (native→display). Brush/shape/text sizes are
  // divided by it so they render at the picked on-screen size even though
  // the scene is in native image pixels.
  const fitRef = useRef(1)

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
  // Non-destructive crop region in image-native pixels ({x,y,w,h}) or null.
  // The editor keeps the full image; export/print output only this region.
  const [cropRect, setCropRect] = useState(null)
  const cropRectRef = useRef(null)
  // Rendered-image geometry (in viewportRef CSS px, pre zoom/pan) used to
  // position the DOM crop overlay so it tracks the image exactly:
  // { imgLeft, imgTop, fit, natW, natH }.
  const [viewGeom, setViewGeom] = useState(null)
  const historyRef = useRef({ past: [], future: [] })
  const [layoutTick, setLayoutTick] = useState(0)

  // ----- Load the ref + image blob -----
  useEffect(() => {
    if (!annotatingRefId) { setRefRow(null); setImgUrl(null); return }
    // Fresh session: drop any migration cache from a previous ref so this
    // ref migrates cleanly against its own saved data. Reset the layout
    // counter too so a stale value from a prior session can't fire an init
    // before the new img is measured.
    migratedCacheRef.current = { refId: null, objects: null }
    setLayoutTick(0)
    // Reset zoom/pan/rotation/crop on every modal open — leftover state from
    // a prior session was rendering the image at some old zoom while the
    // fabric overlay initialised at a different scale, producing a broken
    // display where annotations sit outside the image.
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
    setRotation(0)
    setCropRect(null)
    setViewGeom(null)
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
          // Restore rotation + crop if saved
          try {
            const parsed = r.annotations_json ? JSON.parse(r.annotations_json) : null
            if (parsed?.rotation) setRotation(parsed.rotation)
            if (parsed?.cropRect) setCropRect(parsed.cropRect)
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
  useEffect(() => { cropRectRef.current = cropRect }, [cropRect])

  // Entering the Crop tool always snaps back to the full-image view. The crop
  // rectangle is then guaranteed smaller than the canvas, so its move/resize
  // handles sit INSIDE the viewport where they can be grabbed. (Editing the
  // crop while zoomed into the crop region pushed the handles onto/past the
  // canvas edge — that was the "opens off screen, can't grab" bug.)
  useEffect(() => {
    if (tool !== 'crop') return
    const fc = fcRef.current
    const disp = displayRef.current
    if (!fc || !disp) return
    // Reset the CSS zoom/pan layer to identity. The wrapper is transformed
    // with translate(pan) scale(zoom); fabric's pointer hit-testing can't see
    // that translate, so with a non-zero pan a click on the crop rectangle
    // missed its handles entirely — you couldn't grab them, and a "resize"
    // drag was interpreted as drawing a NEW rectangle in the wrong spot.
    // Identity CSS + a full-fit fabric viewport keeps pointer math exact so
    // the handles are grabbable and land where you expect.
    // Reset the CSS zoom/pan layer to identity so the DOM crop overlay's
    // pointer math (screen delta ÷ fit) is exact and the whole image is
    // visible while cropping.
    setZoom(1); setPanOffset({ x: 0, y: 0 })
    const cw = fc.width, ch = fc.height
    const fit = Math.min(cw / disp.natW, ch / disp.natH)
    fc.setViewportTransform([fit, 0, 0, fit, (cw - disp.natW * fit) / 2, (ch - disp.natH * fit) / 2])
    fitRef.current = fit
    fc.requestRenderAll()
  }, [tool, layoutTick])

  // The crop region is drawn/edited as a DOM overlay (CropOverlayDOM /
  // CropDrawCatcher, rendered inside viewportRef) — NOT as fabric objects.
  // Fabric interactive objects under the viewport transform proved
  // unreliable (resize/move didn't commit, handles mis-hit). The DOM overlay
  // is positioned from viewGeom and updates cropRect live on every drag.

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
    const natW = img.naturalWidth
    const natH = img.naturalHeight

    // Size + position the fabric canvas to the ACTUAL rendered image, not
    // the letterboxed element box. This is the core alignment fix: the
    // element is object-fit:contain so the image is centered with bars;
    // sizing the canvas to the element (old behaviour) meant fabric coords
    // and image pixels diverged by the letterbox amount, corrupting every
    // saved coordinate. Now fabric coord 0..renderedW maps exactly to
    // image 0..natW.
    const cr = getContainedRect(img)
    // Bail if the layout hasn't settled (container collapsed / img not yet
    // sized). A ResizeObserver fire will retry with a real measurement.
    if (cr.renderedW < 20 || cr.renderedH < 20) return

    // === SCENE = NATIVE IMAGE PIXELS ===
    // The canvas fills the whole container; the image is added at native
    // size (scale 1) and the annotations at native coords — then a single
    // fabric VIEWPORT TRANSFORM fits everything into view. Because image and
    // annotations share one native coordinate space and one transform, they
    // cannot be at different scales (the v0.1.46 bug) or drift apart. No
    // per-object scaling to get wrong.
    const canvasW = Math.max(1, Math.round(cr.elementW))
    const canvasH = Math.max(1, Math.round(cr.elementH))
    const dispLeft = imgRect.left - wrapperRect.left
    const dispTop = imgRect.top - wrapperRect.top

    canvasEl.style.position = 'absolute'
    canvasEl.style.left = `${dispLeft}px`
    canvasEl.style.top = `${dispTop}px`

    const curTool = toolRef.current
    const curColor = colorRef.current
    const curWidth = widthRef.current

    const fc = new fabric.Canvas(canvasEl, {
      width: canvasW, height: canvasH,
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

    // Fit the native image into the canvas (contain) via the viewport.
    const fit = Math.min(canvasW / natW, canvasH / natH)
    const vOffX = (canvasW - natW * fit) / 2
    const vOffY = (canvasH - natH * fit) / 2
    fc.setViewportTransform([fit, 0, 0, fit, vOffX, vOffY])
    // Rendered-image rectangle in viewportRef CSS px (canvas sits at
    // dispLeft/dispTop; the image is centred inside it at vOffX/vOffY). The
    // DOM crop overlay lives in the same transformed space, so it tracks the
    // image at any zoom/pan.
    setViewGeom({ imgLeft: dispLeft + vOffX, imgTop: dispTop + vOffY, fit, natW, natH })

    let saved = null
    if (refRow.annotations_json) {
      try { saved = JSON.parse(refRow.annotations_json) } catch {}
    }
    let savedObjects = extractObjectsFromSaved(saved)
    // Old data (element-space) → migrate to image-space once per session and
    // cache so re-inits reuse the exact same result. New data (imageSpace)
    // is already native and skipped.
    const alreadyImageSpace = saved && saved.imageSpace === true
    if (!alreadyImageSpace && savedObjects.length > 0) {
      if (migratedCacheRef.current.refId === annotatingRefId && migratedCacheRef.current.objects) {
        savedObjects = migratedCacheRef.current.objects
      } else {
        savedObjects = savedObjects.map(o => migrateElementToImageSpace(o, cr))
        migratedCacheRef.current = { refId: annotatingRefId, objects: savedObjects }
      }
    }

    // Image at native size (scene coords 0..natW × 0..natH). originX/Y MUST
    // be 'left'/'top' — fabric.Image defaults to CENTER origin, which would
    // place left:0,top:0 as the image's CENTER at the scene origin, pushing
    // half the image into negative coords and offsetting it from the
    // top-left-origin annotations by half the image size (the alignment bug).
    fabric.FabricImage.fromURL(imgUrl).then((bg) => {
      if (fcRef.current !== fc) return
      bg.set({ originX: 'left', originY: 'top', left: 0, top: 0, scaleX: 1, scaleY: 1, selectable: false, evented: false, name: 'bg-image' })
      fc.add(bg)
      fc.sendObjectToBack(bg)
      fc.requestRenderAll()
    }).catch(() => {})

    // Annotations at native coords — NO scaling (scene IS native).
    if (savedObjects.length > 0) {
      fabric.util.enlivenObjects(savedObjects).then((enlivened) => {
        if (fcRef.current !== fc) return
        for (const o of enlivened) {
          o.set({ name: 'anno', selectable: toolRef.current === 'select', evented: toolRef.current === 'select' || toolRef.current === 'erase' })
          fc.add(o)
        }
        const bg = fc.getObjects().find(o => o.name === 'bg-image')
        if (bg) fc.sendObjectToBack(bg)
        setObjectCount(countAnno(fc))
        fc.requestRenderAll()
      })
    }
    // (The crop region is a DOM overlay now — nothing to draw on the canvas.)

    fitRef.current = fit
    configureBrush(fc, curTool, curColor, curWidth, fit)
    fc.defaultCursor = curTool === 'text' ? 'text' : 'crosshair'
    fc.hoverCursor = curTool === 'select' ? 'move' : (curTool === 'text' ? 'text' : 'crosshair')

    fcRef.current = fc
    // Scene is native, so save reads coords at scale 1 (dispW = natW).
    displayRef.current = { natW, natH, dispW: natW, dispH: natH, dispLeft, dispTop, fit }

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

  // Re-init overlay whenever the container settles or resizes. A
  // ResizeObserver (not just window.resize) is essential: on modal open /
  // reopen the flex layout gives the canvas area its real size a frame or
  // two AFTER the img load event, so a load-time measurement can be wrong —
  // which mis-sized the canvas and made a correctly-saved annotation appear
  // shifted on reopen. The observer fires once the size is real, forcing a
  // correct re-measure.
  useEffect(() => {
    if (!imgUrl) return
    const wrapper = wrapperRef.current
    if (!wrapper) return
    let raf = null
    let lastW = 0, lastH = 0
    const reinit = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        const fc = fcRef.current
        const disp = displayRef.current
        if (fc && disp) {
          const nativeObjects = collectObjectsInNative(fc, disp)
          // Already image-space; flag it so re-init never re-migrates.
          setRefRow(r => r ? { ...r, annotations_json: JSON.stringify({ version: 2, imageSpace: true, objects: nativeObjects, rotation }) } : r)
        }
        setLayoutTick(t => t + 1)
      })
    }
    const ro = new ResizeObserver((entries) => {
      const e = entries[0]
      if (!e) return
      const { width, height } = e.contentRect
      if (Math.abs(width - lastW) < 1 && Math.abs(height - lastH) < 1) return
      lastW = width; lastH = height
      reinit()
    })
    ro.observe(wrapper)
    window.addEventListener('resize', reinit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', reinit)
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
    configureBrush(fc, tool, color, width, fitRef.current)
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

    // 'crop' is NOT here — the crop region is a DOM overlay, so fabric must
    // stay out of the pointer path when the crop tool is active.
    const isShape = ['rect', 'ellipse', 'line', 'arrow'].includes(tool)

    // Scene is native pixels; divide picked sizes by fit so they look the
    // chosen on-screen size.
    const nw = width / (fitRef.current || 1)
    const nfs = fontSize / (fitRef.current || 1)

    const onDown = (opt) => {
      if (tool === 'text') {
        const pt = fc.getScenePoint(opt.e)
        pushHistorySnapshot(fc)
        const t = new fabric.IText('Text', {
          left: pt.x, top: pt.y,
          fontSize: nfs, fill: color,
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
          stroke: color, strokeWidth: nw, fill: 'transparent',
          selectable: false, evented: false, name: 'anno',
        })
      } else if (tool === 'ellipse') {
        shape = new fabric.Ellipse({
          left: pt.x, top: pt.y, rx: 0, ry: 0,
          stroke: color, strokeWidth: nw, fill: 'transparent',
          selectable: false, evented: false, name: 'anno',
        })
      } else if (tool === 'line' || tool === 'arrow') {
        // Both line and arrow rendered as fabric.Path — arrow adds
        // arrowhead lines from the endpoint. Two commands to start:
        // move-to (x1,y1), line-to (x1,y1) (will grow with mouse move)
        shape = new fabric.Path(`M ${pt.x} ${pt.y} L ${pt.x} ${pt.y}`, {
          stroke: color, strokeWidth: nw, fill: '',
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
        const cmds = buildLineOrArrowPath(x1, y1, x2, y2, tool === 'arrow', nw)
        const newPath = new fabric.Path(cmds, {
          stroke: color, strokeWidth: nw, fill: '',
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
          // imageSpace: true marks coords as true image-native (canvas sized
          // to the contained image rect, letterbox-free). Loaders skip
          // migration for these.
          version: 2, imageSpace: true, objects, rotation, cropRect, updated_at: new Date().toISOString(),
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
      const img = new Image()
      img.src = imgUrl
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej })

      // 1. Render image + annotations at native size, UNROTATED, with plain
      // 2D canvas ops (each object drawn at its exact saved coords).
      const base = document.createElement('canvas')
      base.width = disp.natW; base.height = disp.natH
      const bctx = base.getContext('2d')
      bctx.drawImage(img, 0, 0, disp.natW, disp.natH)
      const nativeObjects = collectObjectsInNative(fc, disp)
      for (const o of nativeObjects) drawAnnoOnCtx(bctx, o)

      // 2. Crop (raster-crop the composite so annotation offsets are handled
      // automatically).
      let stage = base
      if (cropRect && cropRect.w > 1 && cropRect.h > 1) {
        const c = document.createElement('canvas')
        c.width = Math.round(cropRect.w); c.height = Math.round(cropRect.h)
        c.getContext('2d').drawImage(base, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h)
        stage = c
      }

      // 3. Rotate the (possibly cropped) result.
      let finalCanvas = stage
      if (rotation % 360 !== 0) {
        const swap = rotation % 180 !== 0
        const rc = document.createElement('canvas')
        rc.width = swap ? stage.height : stage.width
        rc.height = swap ? stage.width : stage.height
        const rctx = rc.getContext('2d')
        rctx.translate(rc.width / 2, rc.height / 2)
        rctx.rotate((rotation * Math.PI) / 180)
        rctx.drawImage(stage, -stage.width / 2, -stage.height / 2)
        finalCanvas = rc
      }

      finalCanvas.toBlob((blob) => {
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

  // Reset to the full-image fit view (identity zoom/pan). Used after clearing
  // a crop so the whole image is shown cleanly.
  const showFullView = () => {
    const fc = fcRef.current
    const disp = displayRef.current
    if (!fc || !disp) return
    setZoom(1); setPanOffset({ x: 0, y: 0 })
    const cw = fc.width, ch = fc.height
    const fit = Math.min(cw / disp.natW, ch / disp.natH)
    const offX = (cw - disp.natW * fit) / 2
    const offY = (ch - disp.natH * fit) / 2
    fc.setViewportTransform([fit, 0, 0, fit, offX, offY])
    fitRef.current = fit
    fc.getObjects().forEach(o => o.setCoords && o.setCoords())
    fc.requestRenderAll()
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

          {/* Colors — not for crop (region tool, no color) */}
          {tool !== 'crop' && COLORS.map(c => (
            <button key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-gray-600'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          {tool === 'crop' && (
            <span className="text-[11px] text-cyan-300 px-1">Drag to set the region · drag its handles to resize · everything dimmed is cropped away</span>
          )}

          {/* Width */}
          {tool !== 'text' && tool !== 'select' && tool !== 'erase' && tool !== 'crop' && (
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

          {/* Crop controls — shown once a crop region is set. The dark mask
              outside the box IS the preview, so no zoom buttons are needed. */}
          {cropRect && (
            <>
              <span className="text-[10px] text-cyan-300 ml-1" title="Export & print output only this bright region">
                ✂ {Math.round(cropRect.w)}×{Math.round(cropRect.h)}
              </span>
              {tool === 'crop' ? (
                <button onClick={() => setTool('select')}
                  className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs"
                  title="Done adjusting — keep this crop (export/print use the bright region)">
                  ✓ Done
                </button>
              ) : (
                <button onClick={() => setTool('crop')}
                  className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs"
                  title="Adjust the crop region — drag the box or its handles">
                  ✎ Edit Crop
                </button>
              )}
              <button onClick={() => { setCropRect(null); showFullView() }}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs"
                title="Remove the crop — export the full image again">
                ✕ Remove Crop
              </button>
            </>
          )}

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
              // Kept only for loading the blob + measuring natural/contained
              // size. Rendered invisible: the actual image the user sees is
              // the fabric.Image inside the canvas, so image + annotations
              // are one layer and can't drift apart.
              <img
                ref={imgRef}
                src={imgUrl}
                alt=""
                onLoad={handleImgLoad}
                className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                style={{ opacity: 0 }}
                draggable={false}
              />
            )}
            <canvas ref={canvasElRef}
              style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center center', transition: 'transform 120ms' }} />
          </div>

          {/* DOM crop overlay — box + handles + dark mask, positioned from the
              rendered-image geometry. Kept in its OWN layer (sibling of
              viewportRef) with the SAME translate/scale so it tracks the image
              through zoom/pan, WITHOUT being tangled in the <canvas> that
              fabric rewraps into its own container (React vs fabric DOM).
              Only shown unrotated (a rotated image is a transform the axis-
              aligned box can't follow). */}
          {viewGeom && rotation === 0 && (cropRect || tool === 'crop') && (
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                pointerEvents: 'none',
                transition: panStateRef.current.active || touchPanRef.current.active ? 'none' : 'transform 60ms',
              }}
            >
              {cropRect ? (
                <CropOverlayDOM
                  geom={viewGeom} cropRect={cropRect} interactive={tool === 'crop'}
                  zoom={zoom} onChange={setCropRect}
                />
              ) : (
                <CropDrawCatcher geom={viewGeom} zoom={zoom} onCreate={setCropRect} />
              )}
            </div>
          )}

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

// ---------- DOM crop overlay ----------
// The crop region is a plain-DOM overlay (not a fabric object). It lives
// inside viewportRef, so it inherits the same translate(pan)/scale(zoom) as
// the canvas and stays glued to the image. Coordinates:
//   geom = { imgLeft, imgTop, fit, natW, natH }  (rendered-image rect in
//   viewportRef CSS px). A native point (nx,ny) is at
//   imgLeft + nx*fit, imgTop + ny*fit.
// A drag moves cropRect live (screen delta ÷ (fit*zoom) = native delta), so
// the size readout, mask, and export all update immediately.
function CropOverlayDOM({ geom, cropRect, interactive, zoom, onChange }) {
  const drag = useRef(null)
  const { imgLeft, imgTop, fit, natW, natH } = geom
  const imgW = natW * fit, imgH = natH * fit
  const boxL = imgLeft + cropRect.x * fit
  const boxT = imgTop + cropRect.y * fit
  const boxW = cropRect.w * fit
  const boxH = cropRect.h * fit
  const MIN = 12 // min native size

  const begin = (mode) => (e) => {
    if (!interactive) return
    e.preventDefault(); e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ }
    drag.current = { mode, sx: e.clientX, sy: e.clientY, rect: { ...cropRect } }
  }
  const move = (e) => {
    const d = drag.current; if (!d) return
    const s = fit * (zoom || 1)
    const dx = (e.clientX - d.sx) / s
    const dy = (e.clientY - d.sy) / s
    let { x, y, w, h } = d.rect
    const m = d.mode
    if (m === 'move') { x += dx; y += dy }
    else {
      if (m.includes('w')) { x += dx; w -= dx }
      if (m.includes('e')) { w += dx }
      if (m.includes('n')) { y += dy; h -= dy }
      if (m.includes('s')) { h += dy }
    }
    if (w < MIN) { if (m.includes('w')) x = d.rect.x + d.rect.w - MIN; w = MIN }
    if (h < MIN) { if (m.includes('n')) y = d.rect.y + d.rect.h - MIN; h = MIN }
    // clamp inside the image
    x = Math.max(0, Math.min(x, natW - w))
    y = Math.max(0, Math.min(y, natH - h))
    w = Math.min(w, natW - x)
    h = Math.min(h, natH - y)
    onChange({ x, y, w, h })
  }
  const end = (e) => {
    if (!drag.current) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ok */ }
    drag.current = null
  }

  const hs = 16 / (zoom || 1) // handle size — constant on screen
  const mask = (l, t, w, h, key) => (w > 0.5 && h > 0.5)
    ? <div key={key} style={{ position: 'absolute', left: l, top: t, width: w, height: h, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
    : null
  const handle = (mode, cx, cy, cursor) => (
    <div key={mode} onPointerDown={begin(mode)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      style={{
        position: 'absolute', left: cx - hs / 2, top: cy - hs / 2, width: hs, height: hs,
        background: '#22d3ee', border: `${2 / (zoom || 1)}px solid #0e7490`, borderRadius: hs,
        cursor, touchAction: 'none', pointerEvents: 'auto', zIndex: 3,
      }} />
  )

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
      {mask(imgLeft, imgTop, imgW, cropRect.y * fit, 'top')}
      {mask(imgLeft, boxT + boxH, imgW, imgH - (cropRect.y + cropRect.h) * fit, 'bot')}
      {mask(imgLeft, boxT, cropRect.x * fit, boxH, 'left')}
      {mask(boxL + boxW, boxT, imgW - (cropRect.x + cropRect.w) * fit, boxH, 'right')}
      <div
        onPointerDown={begin('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        style={{
          position: 'absolute', left: boxL, top: boxT, width: boxW, height: boxH, boxSizing: 'border-box',
          border: `${2 / (zoom || 1)}px dashed #22d3ee`,
          cursor: interactive ? 'move' : 'default',
          pointerEvents: interactive ? 'auto' : 'none', touchAction: 'none', zIndex: 2,
        }} />
      {interactive && [
        handle('nw', boxL, boxT, 'nwse-resize'),
        handle('n', boxL + boxW / 2, boxT, 'ns-resize'),
        handle('ne', boxL + boxW, boxT, 'nesw-resize'),
        handle('e', boxL + boxW, boxT + boxH / 2, 'ew-resize'),
        handle('se', boxL + boxW, boxT + boxH, 'nwse-resize'),
        handle('s', boxL + boxW / 2, boxT + boxH, 'ns-resize'),
        handle('sw', boxL, boxT + boxH, 'nesw-resize'),
        handle('w', boxL, boxT + boxH / 2, 'ew-resize'),
      ]}
    </div>
  )
}

// Full-image drag-catcher used when the Crop tool is active but no region is
// set yet: drag to rubber-band the first crop region.
function CropDrawCatcher({ geom, zoom, onCreate }) {
  const drag = useRef(null)
  const { imgLeft, imgTop, fit, natW, natH } = geom
  const nativeAt = (e, el) => {
    const r = el.getBoundingClientRect()
    const s = fit * (zoom || 1)
    return {
      x: Math.max(0, Math.min((e.clientX - r.left) / s, natW)),
      y: Math.max(0, Math.min((e.clientY - r.top) / s, natH)),
    }
  }
  const down = (e) => {
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ }
    const p = nativeAt(e, e.currentTarget)
    drag.current = { x0: p.x, y0: p.y }
    onCreate({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const move = (e) => {
    const d = drag.current; if (!d) return
    const p = nativeAt(e, e.currentTarget)
    onCreate({ x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) })
  }
  const up = (e) => {
    if (!drag.current) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ok */ }
    drag.current = null
  }
  return (
    <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{
        position: 'absolute', left: imgLeft, top: imgTop, width: natW * fit, height: natH * fit,
        cursor: 'crosshair', touchAction: 'none', pointerEvents: 'auto', zIndex: 6,
      }} />
  )
}

function configureBrush(fc, tool, color, width, fit = 1) {
  // Divide by fit: PencilBrush captures the path in SCENE (native) coords, so
  // to draw a line that looks `width` px on screen we need width/fit native.
  const nativeWidth = width / (fit || 1)
  if (tool === 'draw') {
    const b = new fabric.PencilBrush(fc)
    b.color = color
    b.width = nativeWidth
    fc.freeDrawingBrush = b
    fc.isDrawingMode = true
  } else if (tool === 'highlight') {
    const b = new fabric.PencilBrush(fc)
    b.color = hexWithAlpha(color, 0.4)
    b.width = nativeWidth
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

// Compute the actual rendered rectangle of an object-fit:contain <img>.
// The <img> ELEMENT fills its box (w-full h-full), but the IMAGE inside is
// letterboxed — so the element's getBoundingClientRect is NOT the image
// rect. Everything about annotation alignment depends on using THIS rect
// (the real pixels the user sees), not the element box.
export function getContainedRect(imgEl) {
  const natW = imgEl.naturalWidth || 1
  const natH = imgEl.naturalHeight || 1
  const box = imgEl.getBoundingClientRect()
  const scale = Math.min(box.width / natW, box.height / natH)
  const renderedW = natW * scale
  const renderedH = natH * scale
  const offX = (box.width - renderedW) / 2
  const offY = (box.height - renderedH) / 2
  return { natW, natH, elementW: box.width, elementH: box.height, renderedW, renderedH, offX, offY }
}

// Migrate a serialized object stored in the OLD "element-space" coordinate
// system (fabric canvas was sized to the letterboxed element, single
// width-scale used for both axes, letterbox offset ignored) into TRUE
// image-space native coords. Uses the CURRENT contained-rect params as a
// proxy for the draw-time viewport — exact when the window aspect matches
// draw time, which it does for the same desktop. Once re-saved it's locked
// in image-space and never migrated again.
export function migrateElementToImageSpace(o, P) {
  const { natW, natH, elementW, renderedW, renderedH, offX, offY } = P
  // reverse old save (× elementW/natW on both axes) → fabric px, then apply
  // the correct per-axis contained mapping → image-native px.
  const mx = (x) => (x * elementW / natW - offX) * natW / renderedW
  const my = (y) => (y * elementW / natW - offY) * natH / renderedH
  const s = elementW / renderedW // uniform size-scale (contain preserves aspect)
  const out = { ...o }
  if (out.left != null) out.left = mx(out.left)
  if (out.top != null) out.top = my(out.top)
  if (out.width != null) out.width *= s
  if (out.height != null) out.height *= s
  if (out.rx != null) out.rx *= s
  if (out.ry != null) out.ry *= s
  if (out.fontSize != null) out.fontSize *= s
  if (out.strokeWidth != null) out.strokeWidth *= s
  if (out.x1 != null) { out.x1 = mx(out.x1); out.y1 = my(out.y1); out.x2 = mx(out.x2); out.y2 = my(out.y2) }
  if (Array.isArray(out.path)) {
    out.path = out.path.map(cmd => {
      const c = cmd.slice()
      for (let i = 1; i + 1 < c.length; i += 2) { c[i] = mx(c[i]); c[i + 1] = my(c[i + 1]) }
      return c
    })
  }
  return out
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
