import { useState } from 'react'
import useStore from '../store.js'
import { extractPdfText, extractPdfTextOCR } from './PdfUploader.jsx'

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
]

// Parse messy text input into structured set data
function parseSetText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const results = []

  for (const line of lines) {
    let name = ''
    let dimensions = []

    // Try splitting on " - " first
    const dashSplit = line.split(/\s*[-\u2013\u2014]\s*/)
    if (dashSplit.length >= 2) {
      name = dashSplit[0].trim()
      const dimText = dashSplit.slice(1).join(' ')
      dimensions = extractDimensions(dimText)
    } else {
      // Try to find dimensions anywhere in the line
      dimensions = extractDimensions(line)
      // Everything before the first number is the name
      const match = line.match(/^(.*?)[\s]*\d/)
      if (match) {
        name = match[1].replace(/[-\u2013\u2014:]\s*$/, '').trim()
      }
    }

    if (name && dimensions.length > 0) {
      if (dimensions.length > 1) {
        dimensions.forEach((dim, i) => {
          results.push({
            name: `${name} (${i + 1})`,
            width: dim.w,
            height: dim.h,
          })
        })
      } else {
        results.push({
          name,
          width: dimensions[0].w,
          height: dimensions[0].h,
        })
      }
    }
  }

  return results.map((r, i) => ({
    ...r,
    color: COLORS[i % COLORS.length],
  }))
}

function extractDimensions(text) {
  const dims = []
  const parts = text.split(/[\/,]/)

  for (const part of parts) {
    // Match WxH with optional ' or " or ft or - marks, and optional spaces
    const match = part.match(/(\d+(?:\.\d+)?)\s*['\u2019\u2032"ft]*\s*[xX×\*]\s*(\d+(?:\.\d+)?)\s*['\u2019\u2032"ft]*/)
    if (match) {
      dims.push({ w: parseFloat(match[1]), h: parseFloat(match[2]) })
    }
  }

  return dims
}

// Parse raw PDF/OCR text which may be jumbled — look for room/set names near dimensions
function parsePdfText(rawText) {
  // Normalize the text
  let text = rawText
    .replace(/\u2019/g, "'")     // smart quotes
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2032/g, "'")     // prime
    .replace(/\u2033/g, '"')     // double prime
    .replace(/\r\n/g, '\n')

  // Pattern: Look for dimension patterns like "23'-0" x 27'-0"" or "23' x 27'"
  // More flexible: number (optional feet/inch marks) x number
  const dimPattern = /(\d+)\s*['\u2019]?\s*-?\s*(\d*)\s*["\u201D]?\s*[xX×]\s*(\d+)\s*['\u2019]?\s*-?\s*(\d*)\s*["\u201D]?/g

  let match
  const foundDims = []
  while ((match = dimPattern.exec(text)) !== null) {
    let w = parseInt(match[1])
    if (match[2]) w += parseInt(match[2]) / 12 // inches to feet fraction
    let h = parseInt(match[3])
    if (match[4]) h += parseInt(match[4]) / 12

    // Get surrounding context to find a label
    const before = text.substring(Math.max(0, match.index - 80), match.index)
    const label = extractLabel(before)

    foundDims.push({
      name: label || `Area ${foundDims.length + 1}`,
      width: Math.round(w * 10) / 10,
      height: Math.round(h * 10) / 10,
      index: match.index,
    })
  }

  // Also try simpler patterns: just "23 x 27" or "23'x27'"
  const simplePattern = /(\d+(?:\.\d+)?)\s*['\u2019ft]*\s*[xX×\*]\s*(\d+(?:\.\d+)?)\s*['\u2019ft]*/g
  while ((match = simplePattern.exec(text)) !== null) {
    const w = parseFloat(match[1])
    const h = parseFloat(match[2])

    // Skip if too small (probably not room dimensions) or if we already found this
    if (w < 3 || h < 3) continue
    const alreadyFound = foundDims.some(d =>
      Math.abs(d.index - match.index) < 5
    )
    if (alreadyFound) continue

    const before = text.substring(Math.max(0, match.index - 80), match.index)
    const label = extractLabel(before)

    foundDims.push({
      name: label || `Area ${foundDims.length + 1}`,
      width: w,
      height: h,
      index: match.index,
    })
  }

  // Sort by position in document
  foundDims.sort((a, b) => a.index - b.index)

  // Remove index field and assign colors
  return foundDims.map((d, i) => ({
    name: d.name,
    width: d.width,
    height: d.height,
    color: COLORS[i % COLORS.length],
  }))
}

function extractLabel(textBefore) {
  // Try to find a room name in the text before the dimension
  const cleaned = textBefore.replace(/[\n\r]+/g, ' ').trim()

  // Take the last meaningful chunk
  const chunks = cleaned.split(/[,;|\n]/)
  const last = chunks[chunks.length - 1].trim()

  // Remove trailing punctuation, dashes, colons
  let label = last.replace(/[\s\-:=]+$/, '').trim()

  // If the label is very short or just numbers, try the chunk before
  if (label.length < 2 || /^\d+$/.test(label)) {
    if (chunks.length > 1) {
      label = chunks[chunks.length - 2].trim().replace(/[\s\-:=]+$/, '').trim()
    }
  }

  // Trim to reasonable length
  if (label.length > 40) {
    const words = label.split(/\s+/)
    label = words.slice(-4).join(' ')
  }

  return label || ''
}

export default function BulkImport() {
  const { bulkAddSets, pdfImage } = useStore()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [show, setShow] = useState(false)
  const [reading, setReading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [rawPdfText, setRawPdfText] = useState('')

  const handleParse = () => {
    const parsed = parseSetText(text)
    setPreview(parsed)
  }

  const handleReadPdf = async () => {
    setReading(true)
    setStatusMsg('Extracting text layer...')
    try {
      // First try the text layer
      const rawText = await extractPdfText()

      if (rawText.trim()) {
        // Text layer exists — use it
        setRawPdfText(rawText)
        const parsed = parsePdfText(rawText)
        if (parsed.length > 0) {
          setPreview(parsed)
          setText(rawText)
          setStatusMsg('')
        } else {
          setText(rawText)
          setPreview(null)
          setStatusMsg('')
          alert(`Extracted text from PDF but couldn't auto-detect dimensions.\nThe text has been placed in the text box — edit it into "Name - WxH" format and click Parse.`)
        }
      } else {
        // No text layer — fall back to OCR
        setStatusMsg('No text layer found. Running OCR (this may take a moment)...')
        const ocrText = await extractPdfTextOCR((progress) => {
          setStatusMsg(progress)
        })

        setRawPdfText(ocrText)

        if (!ocrText.trim()) {
          setStatusMsg('')
          alert('OCR could not extract any text from the PDF.')
          setReading(false)
          return
        }

        const parsed = parsePdfText(ocrText)
        if (parsed.length > 0) {
          setPreview(parsed)
          setText(ocrText)
          setStatusMsg(`OCR complete — found ${parsed.length} dimension(s)`)
        } else {
          setText(ocrText)
          setPreview(null)
          setStatusMsg('OCR complete')
          alert(`OCR extracted text but couldn't auto-detect dimensions.\nThe text has been placed in the text box — edit it into "Name - WxH" format and click Parse.`)
        }
      }
    } catch (err) {
      console.error('PDF text extraction error:', err)
      alert('Failed to extract text from PDF: ' + err.message)
      setStatusMsg('')
    }
    setReading(false)
  }

  const handleImport = () => {
    if (!preview || preview.length === 0) return
    bulkAddSets(preview)
    setText('')
    setPreview(null)
    setShow(false)
    setRawPdfText('')
    setStatusMsg('')
  }

  if (!show) {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShow(true)}
          className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium"
        >
          Paste Set List
        </button>
        {pdfImage && (
          <button
            onClick={() => { setShow(true); setTimeout(handleReadPdf, 100) }}
            className="w-full px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded text-sm font-medium"
          >
            Read Measurements from PDF
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300">Set measurements</span>
        <button onClick={() => { setShow(false); setPreview(null); setText(''); setRawPdfText(''); setStatusMsg('') }}
          className="text-xs text-gray-400 hover:text-white">Close</button>
      </div>

      {pdfImage && (
        <button onClick={handleReadPdf} disabled={reading}
          className="px-2 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded text-xs text-white font-medium">
          {reading ? 'Reading PDF...' : 'Read from PDF'}
        </button>
      )}

      {statusMsg && (
        <div className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-1.5 rounded animate-pulse">
          {statusMsg}
        </div>
      )}

      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setPreview(null) }}
        placeholder={`Paste set list, e.g.:\nHolly hobby - 23'x27'\nLawyers office - 14'x21'\nMorgue - 38'x22'`}
        rows={6}
        className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white font-mono resize-y"
      />

      <button onClick={handleParse} disabled={!text.trim()}
        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm text-white">
        Parse
      </button>

      {preview && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">
            Found {preview.length} set{preview.length !== 1 ? 's' : ''}:
          </span>
          <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
            {preview.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-gray-700/50 px-2 py-1 rounded">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-gray-400">{s.width}' x {s.height}'</span>
              </div>
            ))}
          </div>
          {preview.length > 0 && (
            <button onClick={handleImport}
              className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-sm text-white font-medium">
              Add All {preview.length} Sets
            </button>
          )}
          {preview.length === 0 && (
            <span className="text-xs text-red-400">Could not parse any dimensions. Edit the text into "Name - WxH" format.</span>
          )}
        </div>
      )}
    </div>
  )
}
