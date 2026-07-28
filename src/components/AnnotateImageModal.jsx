import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import useStore from '../store.js'

// Draw-on-image editor. Same PencilBrush + eraser stack as the artboard's
// Annotate mode, but the canvas background is an uploaded image (from a
// document ref). Strokes are stored non-destructively as annotations_json
// on the ref itself, so the user can re-edit or clear them later without
// touching the original file.
//
// UX contract:
//   - Open via ReferenceSheetModal's "✎ Annotate" button on an image thumb
//     (sets store.annotatingRefId to the ref id)
//   - Escape closes without saving
//   - Save persists strokes to the server; existing strokes for that ref
//     are replaced wholesale (simplest model — undo/redo happens inside
//     the modal via a local history stack)
//   - Flatten & Export writes the composite (image + strokes) as a PNG and
//     downloads it, so the user can share/print the flattened version
export default function AnnotateImageModal() {
  const annotatingRefId = useStore(s => s.annotatingRefId)
  const setAnnotatingRefId = useStore(s => s.setAnnotatingRefId)
  const getRef = useStore(s => s.getRef)
  const updateRef = useStore(s => s.updateRef)

  const canvasElRef = useRef(null)
  const wrapperRef = useRef(null)
  const fcRef = useRef(null)
  const bgImageRef = useRef(null)

  const [refRow, setRefRow] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('draw') // 'draw' | 'erase'
  const [color, setColor] = useState('#ef4444')
  const [width, setWidth] = useState(4)
  const [strokeCount, setStrokeCount] = useState(0)
  // Local undo/redo stacks — snapshots of stroke JSON arrays
  const historyRef = useRef({ past: [], future: [] })

  // ----- Load the ref (image URL + saved annotations) -----
  useEffect(() => {
    if (!annotatingRefId) { setRefRow(null); return }
    setLoading(true)
    setError(null)
    getRef(annotatingRefId)
      .then(r => {
        if (!r) { setError('Reference not found'); setLoading(false); return }
        if (!r.file_id) { setError('This reference has no image to annotate'); setLoading(false); return }
        if (!(r.file_mime_type || '').startsWith('image/')) {
          setError('Only image references can be annotated (this one is ' + (r.file_mime_type || 'unknown') + ')')
          setLoading(false)
          return
        }
        setRefRow(r)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [annotatingRefId, getRef])

  // ----- Boot the fabric canvas once the ref + image are ready -----
  useEffect(() => {
    if (!refRow || !canvasElRef.current || !wrapperRef.current) return

    let cancelled = false
    const token = localStorage.getItem('floorplan-token')

    ;(async () => {
      // Auth-fetch the file as a blob → object URL so fabric.Image doesn't
      // need to send an Authorization header.
      let objectUrl
      try {
        const resp = await fetch(`/api/files/${refRow.file_id}/raw`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!resp.ok) throw new Error('Fetch image failed: ' + resp.status)
        const blob = await resp.blob()
        objectUrl = URL.createObjectURL(blob)
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false) }
        return
      }

      const fImg = await fabric.FabricImage.fromURL(objectUrl)
      if (cancelled) { URL.revokeObjectURL(objectUrl); return }

      const iw = fImg.width || fImg._element?.naturalWidth || 1
      const ih = fImg.height || fImg._element?.naturalHeight || 1

      // Canvas fills the wrapper. Fallback to window size if the wrapper
      // hasn't laid out yet (happens intermittently on iPad Safari when
      // the modal just mounted). Fabric owns retina scaling internally.
      const rect = wrapperRef.current.getBoundingClientRect()
      const cw = Math.max(300, Math.round((rect.width || window.innerWidth) - 8))
      const ch = Math.max(300, Math.round((rect.height || window.innerHeight - 60) - 8))

      const fc = new fabric.Canvas(canvasElRef.current, {
        width: cw, height: ch, backgroundColor: '#1a1a2e', selection: false,
      })

      // Image at NATIVE resolution, no per-object scaling. The fit-and-
      // center is done via viewportTransform so drawing coords map 1:1 to
      // image-native pixels — strokes save as-is with no scaling math.
      fImg.set({ left: 0, top: 0, scaleX: 1, scaleY: 1, selectable: false, evented: false })
      fc.add(fImg)
      fc.sendObjectToBack(fImg)

      const fitScale = Math.min(cw / iw, ch / ih, 1)
      const offsetX = (cw - iw * fitScale) / 2
      const offsetY = (ch - ih * fitScale) / 2
      fc.setViewportTransform([fitScale, 0, 0, fitScale, offsetX, offsetY])

      // Restore prior strokes — stored in image-native pixel space.
      let prior = []
      if (refRow.annotations_json) {
        try { prior = JSON.parse(refRow.annotations_json)?.strokes || [] } catch {}
      }
      for (const s of prior) addStrokeToCanvas(fc, s)
      setStrokeCount(prior.length)

      // Brush stroke widths are in canvas-CSS pixels by default. With our
      // viewport transform (scale < 1), a 4-px brush would produce a very
      // thin visible line. Divide by fitScale so what the user sees on
      // screen matches the width they picked.
      const brush = new fabric.PencilBrush(fc)
      brush.color = color
      brush.width = width / fitScale
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
      bgImageRef.current = { fImg, imageWidth: iw, imageHeight: ih, fitScale, offsetX, offsetY, cw, ch, objectUrl }
      setLoading(false)
    })()

    return () => {
      cancelled = true
      if (fcRef.current) { fcRef.current.dispose(); fcRef.current = null }
      if (bgImageRef.current?.objectUrl) URL.revokeObjectURL(bgImageRef.current.objectUrl)
      bgImageRef.current = null
      historyRef.current = { past: [], future: [] }
    }
  }, [refRow])

  // ----- Sync brush + mode to fabric when they change -----
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    const fitScale = bgImageRef.current?.fitScale || 1
    if (fc.freeDrawingBrush) {
      fc.freeDrawingBrush.color = color
      // Brush width is in canvas-CSS pixels; divide by fitScale so the
      // visible line matches the picked width regardless of zoom.
      fc.freeDrawingBrush.width = width / fitScale
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
    if (!fc) return
    setSaving(true)
    setError(null)
    try {
      // Strokes are already in image-native coords (viewport transform handles
      // display fit), so we can store them without any scaling conversion.
      const strokes = collectStrokes(fc)
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
    const fc = fcRef.current
    const bg = bgImageRef.current
    if (!fc || !bg) return
    // Export at native image resolution. Everything on the canvas is
    // already in native coords; we just need to counteract the fit-scale
    // that viewportTransform is applying for display, and pin the export
    // region to the image's native bounds so we don't include the
    // letterbox around it.
    const multiplier = 1 / (bg.fitScale || 1)
    const dataUrl = fc.toDataURL({
      format: 'png',
      multiplier,
      left: bg.offsetX,
      top: bg.offsetY,
      width: bg.imageWidth * bg.fitScale,
      height: bg.imageHeight * bg.fitScale,
    })
    const filename = `${(refRow?.label || 'annotated').replace(/[^a-z0-9_.-]+/gi, '_')}_annotated.png`
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const doUndo = () => {
    const fc = fcRef.current
    if (!fc) return
    const hist = historyRef.current
    if (hist.past.length === 0) return
    const current = snapshot(fc)
    const prev = hist.past.pop()
    hist.future.unshift(current)
    restoreSnapshot(fc, prev, bgImageRef.current)
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
    restoreSnapshot(fc, next, bgImageRef.current)
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

        {/* Canvas area */}
        <div ref={wrapperRef}
          className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden"
          style={{ touchAction: 'none' }}>
          {loading && <div className="text-gray-500 text-sm">Loading image…</div>}
          <canvas ref={canvasElRef} />
        </div>
      </div>
    </div>
  )
}

// ---------- helpers ----------

function countStrokes(fc) {
  return fc.getObjects().filter(o => o.name === 'stroke').length
}

// Snapshot / restore for undo — serialize just the stroke paths, not the bg
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
function restoreSnapshot(fc, snap, bg) {
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

// Add a persisted stroke to a fabric canvas at image-native coords.
// All display fit/zoom is handled via viewportTransform on the parent
// canvas — the stroke itself is placed at scale 1 in scene coords.
// Works for the annotate editor (viewportTransform scales to fit) and
// the print composite (viewportTransform identity, canvas sized to
// image-native).
export function addStrokeToCanvas(fc, s) {
  const p = new fabric.Path(s.path, {
    left: s.left || 0,
    top: s.top || 0,
    stroke: s.color || '#ef4444',
    strokeWidth: s.width || 3,
    fill: null,
    strokeLineCap: 'round', strokeLineJoin: 'round',
    selectable: false, evented: false,
    name: 'stroke',
  })
  fc.add(p)
}

// Serialize strokes for persistence. PencilBrush captures pointer events
// in scene coords (viewportTransform is applied on the way in), so the
// stroke's path/left/top/width are already in image-native pixels.
export function collectStrokes(fc) {
  return fc.getObjects().filter(o => o.name === 'stroke').map(o => ({
    path: structuredClone(o.path),
    left: o.left || 0,
    top: o.top || 0,
    color: o.stroke || '#ef4444',
    width: o.strokeWidth || 3,
  }))
}
