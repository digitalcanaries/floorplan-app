import { useEffect, useRef, useState, useCallback } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'

// Draw-on-image editor. Same PencilBrush + eraser stack as the artboard's
// Annotate mode, but the canvas overlays a rendered <img> element instead
// of trying to fit the image inside a fabric canvas. The browser handles
// image display via CSS object-fit: contain, so the WHOLE image is always
// visible; we position the fabric overlay canvas exactly on top of the
// rendered image area and translate stroke coords to/from image-native
// pixels on save/load.
//
// UX contract:
//   - Open via ReferenceSheetModal's "✎ Annotate" button on an image thumb
//   - Escape closes without saving
//   - Save persists strokes to the server
//   - Flatten & Export downloads a PNG composite (image + strokes)
export default function AnnotateImageModal() {
  const annotatingRefId = useStore(s => s.annotatingRefId)
  const setAnnotatingRefId = useStore(s => s.setAnnotatingRefId)
  const getRef = useStore(s => s.getRef)
  const updateRef = useStore(s => s.updateRef)

  const wrapperRef = useRef(null)
  const imgRef = useRef(null)
  const canvasElRef = useRef(null)
  const fcRef = useRef(null)
  const displayRef = useRef(null) // { natW, natH, dispW, dispH, dispLeft, dispTop, objectUrl }

  const [refRow, setRefRow] = useState(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('draw') // 'draw' | 'erase'
  const [color, setColor] = useState('#ef4444')
  const [width, setWidth] = useState(4)
  const [strokeCount, setStrokeCount] = useState(0)
  // Local undo/redo stacks — snapshots of stroke JSON
  const historyRef = useRef({ past: [], future: [] })
  // Bump this to re-init the fabric overlay after a resize
  const [layoutTick, setLayoutTick] = useState(0)

  // ----- 1. Load the ref (image URL + saved annotations) -----
  useEffect(() => {
    if (!annotatingRefId) { setRefRow(null); setImgUrl(null); return }
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
          setLoading(false)
          return
        }
        // Auth-fetch the file as a blob so <img src> doesn't need a token.
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
        } catch (e) {
          setError(e.message); setLoading(false)
        }
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [annotatingRefId, getRef])

  // ----- 2. Init fabric overlay after the <img> renders + on resize -----
  //
  // We wait for the <img>'s onLoad to fire, then measure its rendered size
  // and position within the wrapper. The fabric canvas is sized to match
  // the rendered image bounds (not the wrapper — so it doesn't cover the
  // letterbox), and positioned on top via absolute CSS. This guarantees
  // the whole image is always visible and the drawing surface exactly
  // aligns with the pixels the user sees.
  const initFabricOverlay = useCallback(() => {
    const img = imgRef.current
    const wrapper = wrapperRef.current
    const canvasEl = canvasElRef.current
    if (!img || !wrapper || !canvasEl || !imgUrl || !refRow) return
    if (!img.complete || img.naturalWidth === 0) return

    // Dispose any prior fabric canvas before creating a new one (handles
    // resize + image switch cleanly).
    if (fcRef.current) { fcRef.current.dispose(); fcRef.current = null }

    // Layout has settled by the time img.onload fires + rAF has run.
    const imgRect = img.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const dispW = Math.max(1, Math.round(imgRect.width))
    const dispH = Math.max(1, Math.round(imgRect.height))
    const dispLeft = imgRect.left - wrapperRect.left
    const dispTop = imgRect.top - wrapperRect.top
    const natW = img.naturalWidth
    const natH = img.naturalHeight

    // Position the canvas exactly over the rendered image.
    canvasEl.style.position = 'absolute'
    canvasEl.style.left = `${dispLeft}px`
    canvasEl.style.top = `${dispTop}px`

    const fc = new fabric.Canvas(canvasEl, {
      width: dispW, height: dispH,
      selection: false,
      backgroundColor: 'transparent',
    })

    // Also style the fabric-generated wrapper element so the overlay
    // stays aligned to the image (fabric wraps our canvas in a
    // canvas-container div and moves the CSS positioning onto that).
    const fcWrapper = fc.wrapperEl || canvasEl.parentElement
    if (fcWrapper && fcWrapper !== wrapper) {
      fcWrapper.style.position = 'absolute'
      fcWrapper.style.left = `${dispLeft}px`
      fcWrapper.style.top = `${dispTop}px`
      fcWrapper.style.pointerEvents = 'auto'
    }

    // Convert native-pixel stroke → display-pixel fabric.Path
    const nativeToDisplay = dispW / natW

    // Restore prior strokes stored in native image pixels.
    let prior = []
    if (refRow.annotations_json) {
      try { prior = JSON.parse(refRow.annotations_json)?.strokes || [] } catch {}
    }
    for (const s of prior) addNativeStrokeToDisplay(fc, s, nativeToDisplay)
    setStrokeCount(prior.length)

    // Brush width is in display pixels — matches what the user picked.
    const brush = new fabric.PencilBrush(fc)
    brush.color = color
    brush.width = width
    fc.freeDrawingBrush = brush
    fc.isDrawingMode = mode === 'draw'
    fc.defaultCursor = 'crosshair'
    fc.hoverCursor = 'crosshair'

    fc.on('path:created', (opt) => {
      const path = opt?.path
      if (!path) return
      pushHistorySnapshot(fc)
      path.set({ name: 'stroke', selectable: false, evented: mode === 'erase' })
      fc.requestRenderAll()
      setStrokeCount(countStrokes(fc))
    })

    fcRef.current = fc
    displayRef.current = { natW, natH, dispW, dispH, dispLeft, dispTop }
    setLoading(false)
  }, [imgUrl, refRow, color, width, mode])

  // Wire <img> onLoad → initFabricOverlay (with rAF so layout has settled)
  const handleImgLoad = () => {
    // Small delay to let CSS layout finish after the load event fires.
    requestAnimationFrame(() => requestAnimationFrame(initFabricOverlay))
  }

  // Handle viewport resize — re-measure + re-init the overlay
  useEffect(() => {
    if (!imgUrl) return
    let raf = null
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        // Preserve current strokes across the re-init: pull them out in
        // native coords, re-init, then addNativeStrokeToDisplay puts them
        // back in the new display space.
        const fc = fcRef.current
        const disp = displayRef.current
        if (fc && disp) {
          const strokesNative = collectStrokesInNative(fc, disp)
          // Stash on refRow.annotations_json shape so init picks them up
          setRefRow(r => r ? { ...r, annotations_json: JSON.stringify({ strokes: strokesNative }) } : r)
        }
        setLayoutTick(t => t + 1)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [imgUrl])

  // Re-run overlay init when layoutTick bumps
  useEffect(() => {
    if (layoutTick > 0) initFabricOverlay()
  }, [layoutTick, initFabricOverlay])

  // Cleanup fabric + object URL on modal close / ref switch
  useEffect(() => {
    return () => {
      if (fcRef.current) { fcRef.current.dispose(); fcRef.current = null }
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      displayRef.current = null
      historyRef.current = { past: [], future: [] }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imgUrl in deps would revoke a URL we're still using
  }, [annotatingRefId])

  // ----- Sync brush + mode to fabric when they change -----
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    if (fc.freeDrawingBrush) {
      fc.freeDrawingBrush.color = color
      fc.freeDrawingBrush.width = width
    }
    fc.isDrawingMode = mode === 'draw'
    for (const o of fc.getObjects()) {
      if (o.name === 'stroke') { o.selectable = false; o.evented = mode === 'erase' }
    }
    fc.requestRenderAll()
  }, [color, width, mode])

  // Eraser click-to-delete on stroke paths
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || mode !== 'erase') return
    const onClick = (opt) => {
      const t = opt?.target
      if (!t || t.name !== 'stroke') return
      pushHistorySnapshot(fc)
      fc.remove(t)
      fc.requestRenderAll()
      setStrokeCount(countStrokes(fc))
    }
    fc.on('mouse:down', onClick)
    return () => fc.off('mouse:down', onClick)
  }, [mode])

  // Keyboard: Esc closes, Ctrl+Z undo, Ctrl+Shift+Z redo
  useEffect(() => {
    if (!annotatingRefId) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setAnnotatingRefId(null); return }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotatingRefId, setAnnotatingRefId])

  if (!annotatingRefId) return null

  const handleSave = async () => {
    const fc = fcRef.current
    const disp = displayRef.current
    if (!fc || !disp) return
    setSaving(true)
    setError(null)
    try {
      const strokes = collectStrokesInNative(fc, disp)
      await updateRef(annotatingRefId, {
        annotations_json: JSON.stringify({ strokes, updated_at: new Date().toISOString() }),
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
    for (const o of fc.getObjects().filter(o => o.name === 'stroke')) fc.remove(o)
    fc.requestRenderAll()
    setStrokeCount(0)
  }

  const handleFlattenExport = async () => {
    const disp = displayRef.current
    const fc = fcRef.current
    if (!disp || !fc || !imgUrl) return
    // Render at native resolution. Draw the original image + the strokes
    // (scaled from display → native) onto an off-screen canvas.
    try {
      const img = new Image()
      img.src = imgUrl
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
      const out = document.createElement('canvas')
      out.width = disp.natW
      out.height = disp.natH
      const ctx = out.getContext('2d')
      ctx.drawImage(img, 0, 0, disp.natW, disp.natH)
      // Draw fabric contents scaled up to native
      const scale = disp.natW / disp.dispW
      const strokes = collectStrokesInNative(fc, disp)
      for (const s of strokes) drawStrokeOnCtx(ctx, s)
      // Note: strokes are already in native, scale variable unused here.
      void scale
      out.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const filename = `${(refRow?.label || 'annotated').replace(/[^a-z0-9_.-]+/gi, '_')}_annotated.png`
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
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
    const current = snapshot(fc)
    const prev = hist.past.pop()
    hist.future.unshift(current)
    restoreSnapshot(fc, prev)
    setStrokeCount(countStrokes(fc))
  }
  const doRedo = () => {
    const fc = fcRef.current
    if (!fc) return
    const hist = historyRef.current
    if (hist.future.length === 0) return
    const current = snapshot(fc)
    const next = hist.future.shift()
    hist.past.push(current)
    restoreSnapshot(fc, next)
    setStrokeCount(countStrokes(fc))
  }
  const pushHistorySnapshot = (fc) => {
    const hist = historyRef.current
    hist.past.push(snapshot(fc))
    if (hist.past.length > 50) hist.past.shift()
    hist.future = []
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex flex-col p-2"
      onClick={() => setAnnotatingRefId(null)}>
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full h-full flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800">
          <span className="text-sm font-semibold text-white truncate max-w-[35ch]" title={refRow?.label}>
            ✎ {refRow?.label || 'Annotate image'}
          </span>
          <div className="h-4 w-px bg-gray-600 mx-1" />
          <button
            onClick={() => setMode('draw')}
            className={`px-2.5 py-1 rounded text-xs ${mode === 'draw' ? 'bg-rose-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
          >
            ✎ Draw
          </button>
          <button
            onClick={() => setMode('erase')}
            className={`px-2.5 py-1 rounded text-xs ${mode === 'erase' ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
          >
            ⌫ Erase
          </button>
          {mode === 'draw' && (
            <>
              {['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#000000', '#ffffff'].map(c => (
                <button key={c}
                  onClick={() => setColor(c)}
                  title={c}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-gray-600'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <select
                value={width}
                onChange={e => setWidth(parseInt(e.target.value))}
                className="px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-[11px] text-white"
              >
                {[1, 2, 3, 4, 6, 10, 16].map(w => <option key={w} value={w}>{w} px</option>)}
              </select>
            </>
          )}
          <div className="h-4 w-px bg-gray-600 mx-1" />
          <button onClick={doUndo}
            disabled={historyRef.current.past.length === 0}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-200 rounded text-xs" title="Undo (Ctrl+Z)">
            ↩ Undo
          </button>
          <button onClick={doRedo}
            disabled={historyRef.current.future.length === 0}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-200 rounded text-xs" title="Redo (Ctrl+Shift+Z)">
            ↪ Redo
          </button>
          {strokeCount > 0 && (
            <button onClick={handleClearAll}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs">
              Clear All
            </button>
          )}
          <span className="text-[10px] text-gray-500 ml-1">
            {strokeCount} stroke{strokeCount === 1 ? '' : 's'}
          </span>

          <div className="flex-1" />

          <button onClick={handleFlattenExport}
            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs"
            title="Download a flattened PNG of image + annotations">
            ⬇ Flatten &amp; Export
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

        {/* Image + canvas overlay. */}
        <div ref={wrapperRef}
          className="flex-1 relative bg-gray-950 overflow-hidden"
          style={{ touchAction: 'none' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
              Loading image…
            </div>
          )}
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={handleImgLoad}
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
              draggable={false}
            />
          )}
          <canvas ref={canvasElRef} />

          {/* Temporary diagnostic overlay — remove after the display bug
              is confirmed fixed. Shows what the modal thinks the sizes
              are so we can tell whether the img is drawing correctly and
              the fabric overlay is aligned on top of it. */}
          {displayRef.current && (
            <div className="absolute top-1 left-1 px-2 py-1 bg-black/70 text-[10px] text-lime-300 rounded font-mono pointer-events-none leading-tight">
              wrap: {wrapperRef.current?.getBoundingClientRect().width|0}×{wrapperRef.current?.getBoundingClientRect().height|0}<br/>
              img native: {displayRef.current.natW}×{displayRef.current.natH}<br/>
              img shown: {displayRef.current.dispW}×{displayRef.current.dispH} @ ({displayRef.current.dispLeft|0},{displayRef.current.dispTop|0})<br/>
              canvas: {canvasElRef.current?.width}×{canvasElRef.current?.height} css {canvasElRef.current?.style.width}×{canvasElRef.current?.style.height}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- helpers ----------

function countStrokes(fc) {
  return fc.getObjects().filter(o => o.name === 'stroke').length
}

// Snapshot / restore for undo — captures the strokes as-is in the current
// display coord space; undo/redo doesn't cross re-inits.
function snapshot(fc) {
  const strokes = []
  for (const o of fc.getObjects().filter(o => o.name === 'stroke')) {
    strokes.push({
      path: structuredClone(o.path),
      left: o.left, top: o.top,
      stroke: o.stroke, strokeWidth: o.strokeWidth,
    })
  }
  return strokes
}
function restoreSnapshot(fc, snap) {
  for (const o of fc.getObjects().filter(o => o.name === 'stroke')) fc.remove(o)
  for (const s of snap) {
    const p = new fabric.Path(s.path, {
      left: s.left, top: s.top,
      stroke: s.stroke, strokeWidth: s.strokeWidth, fill: null,
      strokeLineCap: 'round', strokeLineJoin: 'round',
      selectable: false, evented: false,
      name: 'stroke',
    })
    fc.add(p)
  }
  fc.requestRenderAll()
}

// Convert a display-space fabric.Path back to native pixel coords for
// persistence. Strokes are captured by the brush at display resolution
// (canvas is sized to img rendered size); on save we scale to native so
// the annotation survives any future viewport size.
export function collectStrokesInNative(fc, disp) {
  const scale = disp.natW / disp.dispW
  return fc.getObjects().filter(o => o.name === 'stroke').map(o => ({
    path: (o.path || []).map(cmd => cmd.map((v, i) => i === 0 ? v : v * scale)),
    left: (o.left || 0) * scale,
    top: (o.top || 0) * scale,
    color: o.stroke || '#ef4444',
    width: (o.strokeWidth || 3) * scale,
  }))
}

// Add a native-space stroke to the display-space fabric canvas.
function addNativeStrokeToDisplay(fc, s, nativeToDisplay) {
  const scaledPath = (s.path || []).map(cmd => cmd.map((v, i) => i === 0 ? v : v * nativeToDisplay))
  const p = new fabric.Path(scaledPath, {
    left: (s.left || 0) * nativeToDisplay,
    top: (s.top || 0) * nativeToDisplay,
    stroke: s.color || '#ef4444',
    strokeWidth: (s.width || 3) * nativeToDisplay,
    fill: null,
    strokeLineCap: 'round', strokeLineJoin: 'round',
    selectable: false, evented: false,
    name: 'stroke',
  })
  fc.add(p)
}

// Composite render helper — draws a native-space stroke onto a plain
// canvas 2D context (used by print sheet + Flatten & Export). Path
// commands are absolute in native pixels; we translate by left/top.
function drawStrokeOnCtx(ctx, s) {
  ctx.save()
  ctx.translate(s.left || 0, s.top || 0)
  ctx.strokeStyle = s.color || '#ef4444'
  ctx.lineWidth = s.width || 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (const cmd of (s.path || [])) {
    const op = cmd[0]
    if (op === 'M' || op === 'm') ctx.moveTo(cmd[1], cmd[2])
    else if (op === 'L' || op === 'l') ctx.lineTo(cmd[1], cmd[2])
    else if (op === 'Q' || op === 'q') ctx.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4])
    else if (op === 'C' || op === 'c') ctx.bezierCurveTo(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6])
    else if (op === 'Z' || op === 'z') ctx.closePath()
  }
  ctx.stroke()
  ctx.restore()
}

// Legacy export kept for ReferenceSheetModal's print composite path.
// Takes a native-space stroke and pushes it into a fabric canvas at
// scale 1 — used when the target fabric canvas is sized to image-native.
export function addStrokeToCanvas(fc, s) {
  addNativeStrokeToDisplay(fc, s, 1)
}

// Legacy export kept in case future consumers want native-space strokes
// directly from a fabric canvas that's already at native size.
export function collectStrokes(fc) {
  return fc.getObjects().filter(o => o.name === 'stroke').map(o => ({
    path: structuredClone(o.path),
    left: o.left || 0,
    top: o.top || 0,
    color: o.stroke || '#ef4444',
    width: o.strokeWidth || 3,
  }))
}
