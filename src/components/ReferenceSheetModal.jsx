import { useEffect, useState, useRef } from 'react'
import useStore from '../store.js'

// Modal — per-set or project-level reference sheet. Three tabs:
// - Documents (photos + PDFs uploaded as files)
// - Paint (brand / code / color swatch / finish, optional photo)
// - Furniture (label, dimensions, source URL, photo, status)
//
// Opens when store.referencesPanelTarget is non-null:
//   - number  → references attached to that set id
//   - 'project' → project-level references (not tied to any set)
//
// Auth-token-fetched image thumbnails: the /api/files/:id/raw endpoint
// requires a Bearer token, so <img src> can't load directly. We fetch as
// a Blob with the auth header and present an object URL.

const FINISHES = ['matte', 'eggshell', 'satin', 'semi-gloss', 'gloss']
const STATUSES = ['to-source', 'owned', 'rented', 'purchased', 'returned']

function isImage(mime) { return (mime || '').startsWith('image/') }
function isPdf(mime) { return (mime || '') === 'application/pdf' }

// Minimal HTML escaping for the print sheet doc we hand to window.open.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;') }

// Load a file by id with auth, return object URL. Caller must revoke later.
async function fetchAuthedObjectURL(fileId) {
  const token = localStorage.getItem('floorplan-token')
  const resp = await fetch(`/api/files/${fileId}/raw`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error('Fetch failed')
  const blob = await resp.blob()
  return URL.createObjectURL(blob)
}

// <AuthedImage> — img backed by an authed fetch + object URL. Used for
// thumbnails. Falls back to a file-type pill if not an image.
function AuthedFileThumb({ fileId, mime, filename, className }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!fileId || !isImage(mime)) return
    let cancelled = false
    let objUrl = null
    fetchAuthedObjectURL(fileId).then(u => {
      if (cancelled) { URL.revokeObjectURL(u); return }
      objUrl = u
      setUrl(u)
    }).catch(() => {})
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [fileId, mime])

  if (!fileId) {
    return <div className={`${className} bg-gray-700 flex items-center justify-center text-[10px] text-gray-400`}>no file</div>
  }
  if (isImage(mime) && url) {
    return <img src={url} alt={filename || ''} className={`${className} object-cover`} />
  }
  if (isPdf(mime)) {
    return <div className={`${className} bg-rose-900/40 flex items-center justify-center text-rose-200 text-xs font-bold`}>PDF</div>
  }
  return <div className={`${className} bg-gray-700 flex items-center justify-center text-[10px] text-gray-300 px-1 text-center`}>{(filename || 'file').slice(-12)}</div>
}

// Open a file in a new tab (auth-fetched blob → object URL → window.open).
async function openFileInTab(fileId) {
  try {
    const url = await fetchAuthedObjectURL(fileId)
    const win = window.open(url, '_blank')
    // If popups blocked, fall back to direct nav (will fail without auth but
    // at least surfaces the URL). Revoke once tab assumed open.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return !!win
  } catch (e) {
    alert('Could not open file: ' + (e?.message || e))
    return false
  }
}

export default function ReferenceSheetModal() {
  const target = useStore(s => s.referencesPanelTarget)
  const setTarget = useStore(s => s.setReferencesPanelTarget)
  const sets = useStore(s => s.sets)
  const projectName = useStore(s => s.projectName)
  const uploadFile = useStore(s => s.uploadFile)
  const listRefs = useStore(s => s.listRefs)
  const addRef = useStore(s => s.addRef)
  const updateRef = useStore(s => s.updateRef)
  const deleteRef = useStore(s => s.deleteRef)
  const deleteFile = useStore(s => s.deleteFile)

  const [refs, setRefs] = useState([])
  const [tab, setTab] = useState('document') // 'document' | 'paint' | 'furniture'
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [printing, setPrinting] = useState(false)
  const fileInputRef = useRef(null)

  const setSet = target !== null && target !== 'project' ? sets.find(s => s.id === target) : null
  const setIdParam = target === 'project' ? null : target

  // Load refs whenever the target changes. The refs endpoint now returns
  // file_mime_type / file_filename via a LEFT JOIN so thumbnails branch
  // correctly without a second request per attachment.
  useEffect(() => {
    if (target === null) return
    setError(null)
    listRefs({ setId: setIdParam })
      .then(rows => setRefs(rows))
      .catch(e => setError(e.message))
  }, [target, listRefs])

  // Esc closes
  useEffect(() => {
    if (target === null) return
    const onKey = (e) => { if (e.key === 'Escape') setTarget(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, setTarget])

  if (target === null) return null

  const documentRefs = refs.filter(r => r.kind === 'document')
  const paintRefs = refs.filter(r => r.kind === 'paint')
  const furnitureRefs = refs.filter(r => r.kind === 'furniture')

  const refresh = async () => {
    try {
      const rows = await listRefs({ setId: setIdParam })
      setRefs(rows)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const f of files) {
        const uploaded = await uploadFile(f)
        await addRef({
          set_id: setIdParam,
          kind: 'document',
          label: uploaded.filename,
          file_id: uploaded.id,
          category: uploaded.mime_type?.startsWith('image/') ? 'photo' : 'drawing',
        })
      }
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Print sheet — build a self-contained HTML doc with all images embedded
  // as object URLs (auth-fetched in this window so the print tab doesn't
  // need credentials), open it in a new window, and trigger window.print().
  // Images are inlined; PDFs render as a tile with the filename.
  const handlePrintSheet = async () => {
    setPrinting(true)
    setError(null)
    try {
      // Pre-fetch image blobs so the print window can show them without auth.
      const blobUrls = {}
      for (const r of refs) {
        if (!r.file_id) continue
        if (!(r.file_mime_type || '').startsWith('image/')) continue
        try {
          blobUrls[r.file_id] = await fetchAuthedObjectURL(r.file_id)
        } catch {}
      }

      const today = new Date().toLocaleDateString()
      const heading = setSet ? setSet.name : 'Project'

      const docHTML = documentRefs.map(r => {
        const url = r.file_id ? blobUrls[r.file_id] : null
        const isImg = (r.file_mime_type || '').startsWith('image/')
        const cell = url && isImg
          ? `<img src="${url}" alt="${escapeHtml(r.label || '')}" />`
          : `<div class="placeholder">${isPdf(r.file_mime_type) ? 'PDF' : 'file'}</div>`
        return `<figure>
          ${cell}
          <figcaption>${escapeHtml(r.label || 'Untitled')}${r.category ? ' · ' + escapeHtml(r.category) : ''}</figcaption>
        </figure>`
      }).join('')

      const paintHTML = paintRefs.map(r => `
        <tr>
          <td><div class="swatch" style="background:${escapeAttr(r.paint_color || '#ccc')}"></div></td>
          <td>${escapeHtml(r.label || '')}</td>
          <td>${escapeHtml(r.paint_brand || '')}</td>
          <td>${escapeHtml(r.paint_code || '')}</td>
          <td>${escapeHtml(r.paint_finish || '')}</td>
          <td>${escapeHtml(r.notes || '')}</td>
        </tr>
      `).join('')

      const furnitureHTML = furnitureRefs.map(r => {
        const url = r.file_id ? blobUrls[r.file_id] : null
        const isImg = (r.file_mime_type || '').startsWith('image/')
        const photo = url && isImg
          ? `<img src="${url}" alt="" />`
          : `<div class="placeholder">no photo</div>`
        return `<tr>
          <td class="photo-cell">${photo}</td>
          <td>
            <strong>${escapeHtml(r.label || '')}</strong>
            ${r.furniture_dimensions ? `<div class="meta">${escapeHtml(r.furniture_dimensions)}</div>` : ''}
            ${r.furniture_source ? `<div class="meta">from: ${escapeHtml(r.furniture_source)}</div>` : ''}
            ${r.furniture_url ? `<div class="meta">${escapeHtml(r.furniture_url)}</div>` : ''}
            ${r.notes ? `<div class="meta">${escapeHtml(r.notes)}</div>` : ''}
          </td>
          <td class="status-cell">${escapeHtml(r.furniture_status || '')}</td>
        </tr>`
      }).join('')

      const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Reference Sheet — ${escapeHtml(heading)}</title>
<style>
  @page { margin: 0.5in; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #111; margin: 0; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .subtitle { color: #555; font-size: 11px; margin-bottom: 18px; }
  h2 { margin-top: 26px; margin-bottom: 8px; font-size: 14px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  section { page-break-inside: avoid; margin-bottom: 12px; }
  /* Documents grid */
  .docs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  figure { margin: 0; page-break-inside: avoid; }
  figure img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border: 1px solid #ddd; border-radius: 3px; }
  figure .placeholder { aspect-ratio: 4/3; background: #eee; border: 1px solid #ddd; border-radius: 3px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; }
  figcaption { font-size: 10px; color: #444; margin-top: 4px; }
  /* Paint table */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #555; }
  .swatch { width: 28px; height: 28px; border: 1px solid #999; border-radius: 3px; }
  /* Furniture */
  .photo-cell { width: 80px; }
  .photo-cell img { width: 72px; height: 72px; object-fit: cover; border: 1px solid #ddd; border-radius: 3px; }
  .photo-cell .placeholder { width: 72px; height: 72px; background: #eee; border: 1px solid #ddd; border-radius: 3px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 9px; }
  .status-cell { width: 80px; text-transform: uppercase; font-size: 9px; color: #555; }
  .meta { font-size: 10px; color: #666; margin-top: 2px; }
  .empty { color: #888; font-style: italic; font-size: 11px; padding: 6px 0; }
</style>
</head><body>
<h1>${escapeHtml(heading)}</h1>
<div class="subtitle">Reference Sheet · ${escapeHtml(projectName || 'Project')} · ${escapeHtml(today)}</div>

${documentRefs.length > 0 ? `
<section>
  <h2>Drawings &amp; Photos</h2>
  <div class="docs">${docHTML}</div>
</section>` : ''}

${paintRefs.length > 0 ? `
<section>
  <h2>Paint</h2>
  <table>
    <thead><tr><th></th><th>Color</th><th>Brand</th><th>Code</th><th>Finish</th><th>Notes</th></tr></thead>
    <tbody>${paintHTML}</tbody>
  </table>
</section>` : ''}

${furnitureRefs.length > 0 ? `
<section>
  <h2>Furniture &amp; Assets</h2>
  <table>
    <tbody>${furnitureHTML}</tbody>
  </table>
</section>` : ''}

${refs.length === 0 ? '<div class="empty">No references on this sheet.</div>' : ''}
</body></html>`

      const win = window.open('', '_blank')
      if (!win) {
        alert('Popup blocked — allow popups for this site to print the reference sheet.')
        // Revoke any blobs we won't use
        Object.values(blobUrls).forEach(URL.revokeObjectURL)
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      // Wait for images to load, then print. Listen on the new window.
      const triggerPrint = () => {
        try { win.focus(); win.print() } catch {}
        // Revoke blob URLs after a delay so print can use them first
        setTimeout(() => Object.values(blobUrls).forEach(URL.revokeObjectURL), 30_000)
      }
      // If the doc finished writing synchronously and images are quick,
      // fire after a small timeout; otherwise wait for load.
      if (win.document.readyState === 'complete') setTimeout(triggerPrint, 300)
      else win.addEventListener('load', () => setTimeout(triggerPrint, 300))
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleAddPaint = async () => {
    await addRef({
      set_id: setIdParam,
      kind: 'paint',
      label: 'New paint',
      paint_color: '#cccccc',
      paint_finish: 'eggshell',
    })
    await refresh()
  }

  const handleAddFurniture = async () => {
    await addRef({
      set_id: setIdParam,
      kind: 'furniture',
      label: 'New furniture',
      furniture_status: 'to-source',
    })
    await refresh()
  }

  const handleUpdate = async (refId, patch) => {
    try {
      await updateRef(refId, patch)
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (ref) => {
    if (!window.confirm(`Delete "${ref.label || 'this reference'}"?`)) return
    await deleteRef(ref.id)
    if (ref.file_id) {
      // Only delete the underlying file if no other ref still uses it
      const otherUses = refs.filter(r => r.id !== ref.id && r.file_id === ref.file_id)
      if (otherUses.length === 0) await deleteFile(ref.file_id)
    }
    await refresh()
  }

  const title = setSet
    ? `References — ${setSet.name}`
    : 'Project References'

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
      onClick={() => setTarget(null)}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-600"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-700 gap-2">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 min-w-0">
            {setSet && (
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: setSet.color }} />
            )}
            <span className="truncate">📎 {title}</span>
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrintSheet}
              disabled={printing || refs.length === 0}
              className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded text-xs"
              title="Open a printable reference sheet with all docs/paint/furniture"
            >
              🖨 {printing ? 'Preparing…' : 'Print Sheet'}
            </button>
            <button onClick={() => setTarget(null)}
              className="text-gray-400 hover:text-white text-2xl leading-none px-2">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-850">
          {[
            { key: 'document', label: `📄 Documents (${documentRefs.length})` },
            { key: 'paint', label: `🎨 Paint (${paintRefs.length})` },
            { key: 'furniture', label: `🛋 Furniture (${furnitureRefs.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'text-white border-b-2 border-indigo-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-900/40 border border-red-700 text-red-200 text-xs rounded">
            {error}
          </div>
        )}

        {/* Body — tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'document' && (
            <DocumentsTab
              refs={documentRefs}
              onUpload={() => fileInputRef.current?.click()}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onOpen={openFileInTab}
              uploading={uploading}
            />
          )}
          {tab === 'paint' && (
            <PaintTab
              refs={paintRefs}
              onAdd={handleAddPaint}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onUploadSwatch={async (refId, file) => {
                try {
                  const uploaded = await uploadFile(file)
                  await updateRef(refId, { file_id: uploaded.id })
                  await refresh()
                } catch (e) { setError(e.message) }
              }}
              onOpen={openFileInTab}
            />
          )}
          {tab === 'furniture' && (
            <FurnitureTab
              refs={furnitureRefs}
              onAdd={handleAddFurniture}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onUploadPhoto={async (refId, file) => {
                try {
                  const uploaded = await uploadFile(file)
                  await updateRef(refId, { file_id: uploaded.id })
                  await refresh()
                } catch (e) { setError(e.message) }
              }}
              onOpen={openFileInTab}
            />
          )}
        </div>

        {/* Hidden file input for document uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleDocUpload}
          className="hidden"
        />
      </div>
    </div>
  )
}

// ── Documents tab ──
function DocumentsTab({ refs, onUpload, onUpdate, onDelete, onOpen, uploading }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">
          Photos and PDFs. Tap a thumbnail to open in a new tab.
        </span>
        <button
          onClick={onUpload}
          disabled={uploading}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-sm"
        >
          {uploading ? 'Uploading…' : '+ Upload'}
        </button>
      </div>
      {refs.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-12">
          No documents yet. Tap <span className="text-indigo-300">+ Upload</span> to add reference photos or PDF drawings.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {refs.map(r => (
            <div key={r.id} className="group bg-gray-900 rounded border border-gray-700 overflow-hidden">
              <button
                onClick={() => r.file_id && onOpen(r.file_id)}
                className="block w-full aspect-square overflow-hidden bg-gray-700"
              >
                <AuthedFileThumb fileId={r.file_id} mime={r.file_mime_type} filename={r.file_filename || r.label} className="w-full h-full" />
              </button>
              <div className="p-2">
                <input
                  value={r.label || ''}
                  onChange={(e) => onUpdate(r.id, { label: e.target.value })}
                  className="w-full px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <select
                    value={r.category || 'drawing'}
                    onChange={(e) => onUpdate(r.id, { category: e.target.value })}
                    className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-300"
                  >
                    <option value="drawing">drawing</option>
                    <option value="photo">photo</option>
                    <option value="other">other</option>
                  </select>
                  <button
                    onClick={() => onDelete(r)}
                    className="text-red-400 hover:text-red-300 text-[10px]"
                  >Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Paint tab ──
function PaintTab({ refs, onAdd, onUpdate, onDelete, onUploadSwatch, onOpen }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">
          Paint colors with brand, product code, finish, and optional swatch photo.
        </span>
        <button onClick={onAdd}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm">
          + Add Paint
        </button>
      </div>
      {refs.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-12">
          No paint references yet. Tap <span className="text-indigo-300">+ Add Paint</span> for the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {refs.map(r => (
            <div key={r.id} className="bg-gray-900 border border-gray-700 rounded p-3 flex items-start gap-3">
              {/* Swatch */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className="w-16 h-16 rounded-md border-2 border-gray-700"
                  style={{ backgroundColor: r.paint_color || '#888' }}
                />
                <input
                  type="color"
                  value={r.paint_color || '#888888'}
                  onChange={(e) => onUpdate(r.id, { paint_color: e.target.value })}
                  className="w-16 h-6 bg-transparent cursor-pointer rounded"
                />
              </div>

              {/* Fields */}
              <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                <input
                  placeholder="Color name / label"
                  value={r.label || ''}
                  onChange={(e) => onUpdate(r.id, { label: e.target.value })}
                  className="col-span-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                />
                <input
                  placeholder="Brand (Benjamin Moore, Farrow & Ball...)"
                  value={r.paint_brand || ''}
                  onChange={(e) => onUpdate(r.id, { paint_brand: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
                <input
                  placeholder="Product code (HC-172, No. 67...)"
                  value={r.paint_code || ''}
                  onChange={(e) => onUpdate(r.id, { paint_code: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
                <select
                  value={r.paint_finish || 'eggshell'}
                  onChange={(e) => onUpdate(r.id, { paint_finish: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                >
                  {FINISHES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input
                  placeholder="Notes"
                  value={r.notes || ''}
                  onChange={(e) => onUpdate(r.id, { notes: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
              </div>

              {/* Swatch photo */}
              <div className="shrink-0 w-20 flex flex-col gap-1 items-center">
                {r.file_id ? (
                  <>
                    <button
                      onClick={() => onOpen(r.file_id)}
                      className="w-20 h-20 rounded border border-gray-700 overflow-hidden bg-gray-800"
                    >
                      <AuthedFileThumb fileId={r.file_id} mime={r.file_mime_type} filename={r.file_filename || r.label} className="w-full h-full" />
                    </button>
                    <button onClick={() => onUpdate(r.id, { file_id: null })}
                      className="text-[9px] text-gray-500 hover:text-red-400">
                      Remove
                    </button>
                  </>
                ) : (
                  <label className="w-20 h-20 rounded border-2 border-dashed border-gray-600 flex items-center justify-center text-[10px] text-gray-500 hover:border-indigo-500 hover:text-indigo-300 cursor-pointer">
                    Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadSwatch(r.id, f) }}
                      className="hidden"
                    />
                  </label>
                )}
                <button
                  onClick={() => onDelete(r)}
                  className="text-[10px] text-red-400 hover:text-red-300"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Furniture tab ──
function FurnitureTab({ refs, onAdd, onUpdate, onDelete, onUploadPhoto, onOpen }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">
          Furniture and props. Track sourcing status and where to get each piece.
        </span>
        <button onClick={onAdd}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm">
          + Add Item
        </button>
      </div>
      {refs.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-12">
          No furniture or asset references yet. Tap <span className="text-indigo-300">+ Add Item</span> to start.
        </div>
      ) : (
        <div className="space-y-2">
          {refs.map(r => (
            <div key={r.id} className="bg-gray-900 border border-gray-700 rounded p-3 flex items-start gap-3">
              {/* Photo */}
              <div className="shrink-0 w-24 flex flex-col gap-1 items-center">
                {r.file_id ? (
                  <>
                    <button
                      onClick={() => onOpen(r.file_id)}
                      className="w-24 h-24 rounded border border-gray-700 overflow-hidden bg-gray-800"
                    >
                      <AuthedFileThumb fileId={r.file_id} mime={r.file_mime_type} filename={r.file_filename || r.label} className="w-full h-full" />
                    </button>
                    <button onClick={() => onUpdate(r.id, { file_id: null })}
                      className="text-[9px] text-gray-500 hover:text-red-400">
                      Remove photo
                    </button>
                  </>
                ) : (
                  <label className="w-24 h-24 rounded border-2 border-dashed border-gray-600 flex items-center justify-center text-[10px] text-gray-500 hover:border-indigo-500 hover:text-indigo-300 cursor-pointer">
                    Add photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPhoto(r.id, f) }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Fields */}
              <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                <input
                  placeholder="Item name"
                  value={r.label || ''}
                  onChange={(e) => onUpdate(r.id, { label: e.target.value })}
                  className="col-span-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                />
                <input
                  placeholder="Dimensions (W×D×H)"
                  value={r.furniture_dimensions || ''}
                  onChange={(e) => onUpdate(r.id, { furniture_dimensions: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
                <select
                  value={r.furniture_status || 'to-source'}
                  onChange={(e) => onUpdate(r.id, { furniture_status: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  placeholder="Source / vendor"
                  value={r.furniture_source || ''}
                  onChange={(e) => onUpdate(r.id, { furniture_source: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
                <input
                  placeholder="Product URL"
                  value={r.furniture_url || ''}
                  onChange={(e) => onUpdate(r.id, { furniture_url: e.target.value })}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
                <input
                  placeholder="Notes"
                  value={r.notes || ''}
                  onChange={(e) => onUpdate(r.id, { notes: e.target.value })}
                  className="col-span-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                />
                <div className="col-span-2 flex justify-end gap-2 mt-1">
                  {r.furniture_url && (
                    <a
                      href={r.furniture_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-300 hover:text-indigo-200"
                    >Open URL ↗</a>
                  )}
                  <button
                    onClick={() => onDelete(r)}
                    className="text-[11px] text-red-400 hover:text-red-300"
                  >Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
