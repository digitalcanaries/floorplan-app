import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

// Load a PDF or image file into a background-layer payload.
// Returns { name, dataUrl, width, height } where width/height are the
// rasterised pixel dimensions (used as the layer's originalSize).
// Mirrors the upload path in PdfUploader.jsx — kept here so the LayersTab
// "Replace image" action can reuse the exact same rasterisation.
export async function loadBackgroundFile(file) {
  // Image files: read straight to a data URL and measure natural size.
  if (file.type.startsWith('image/')) {
    const name = file.name.replace(/\.[^.]+$/, '') || 'Image'
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(file)
    })
    const { width, height } = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = dataUrl
    })
    return { name, dataUrl, width, height }
  }

  // PDF files: render page 1 to a canvas at 2× for crisp tracing.
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  const name = file.name.replace(/\.pdf$/i, '') || 'Floor Plan'
  return { name, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}
