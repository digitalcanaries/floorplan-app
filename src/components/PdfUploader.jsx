import { useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'
import useStore from '../store.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

// Store the PDF document globally so we can re-extract text later
let lastPdfDoc = null
let lastPdfCanvasDataUrl = null

export async function extractPdfText() {
  if (!lastPdfDoc) return ''
  const numPages = lastPdfDoc.numPages
  let fullText = ''

  for (let i = 1; i <= numPages; i++) {
    const page = await lastPdfDoc.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items.map(item => item.str)
    fullText += strings.join(' ') + '\n'
  }

  return fullText
}

// OCR fallback for image-only PDFs
export async function extractPdfTextOCR(onProgress) {
  if (!lastPdfDoc) return ''

  let fullText = ''
  const numPages = lastPdfDoc.numPages

  for (let i = 1; i <= numPages; i++) {
    const page = await lastPdfDoc.getPage(i)
    // Render at higher scale for better OCR accuracy
    const scale = 3
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport }).promise

    // Run Tesseract OCR on the rendered page
    if (onProgress) onProgress(`OCR page ${i}/${numPages}...`)

    const result = await Tesseract.recognize(canvas, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          const pct = Math.round((m.progress || 0) * 100)
          onProgress(`OCR page ${i}/${numPages}: ${pct}%`)
        }
      },
    })

    fullText += result.data.text + '\n'
  }

  return fullText
}

export default function PdfUploader() {
  const { addPdfLayer, pdfLayers } = useStore()
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      // Image files: load directly as data URL
      if (file.type.startsWith('image/')) {
        const name = file.name.replace(/\.[^.]+$/, '') || 'Image'
        const reader = new FileReader()
        reader.onload = () => {
          const img = new Image()
          img.onload = () => addPdfLayer(name, reader.result, img.width, img.height)
          img.onerror = () => alert('Failed to load image')
          img.src = reader.result
        }
        reader.readAsDataURL(file)
        e.target.value = ''
        return
      }

      // PDF files: render via pdf.js
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      lastPdfDoc = pdf

      const page = await pdf.getPage(1)
      const scale = 2
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')

      await page.render({ canvasContext: ctx, viewport }).promise
      const dataUrl = canvas.toDataURL('image/png')
      lastPdfCanvasDataUrl = dataUrl

      // Derive a name from the filename (strip extension)
      const name = file.name.replace(/\.pdf$/i, '') || 'Floor Plan'

      addPdfLayer(name, dataUrl, canvas.width, canvas.height)
    } catch (err) {
      console.error('File load error:', err)
      alert('Failed to load file: ' + err.message)
    }

    e.target.value = ''
  }

  return (
    <div className="p-3 border-b border-gray-700">
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium"
      >
        {pdfLayers.length === 0 ? 'Upload PDF Floor Plan' : 'Add PDF / Image'}
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFile} />
    </div>
  )
}
