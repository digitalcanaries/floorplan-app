import { useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import useStore from '../store.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export default function PdfUploader() {
  const { setPdfImage } = useStore()
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const page = await pdf.getPage(1)

      const scale = 2
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')

      await page.render({ canvasContext: ctx, viewport }).promise
      const dataUrl = canvas.toDataURL('image/png')
      setPdfImage(dataUrl)
    } catch (err) {
      console.error('PDF load error:', err)
      alert('Failed to load PDF. Please try again.')
    }

    e.target.value = ''
  }

  return (
    <div className="p-3 border-b border-gray-700">
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium"
      >
        Upload PDF Floor Plan
      </button>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
    </div>
  )
}
