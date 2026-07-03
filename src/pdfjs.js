// Lazy loader for pdfjs-dist. PDFs are only parsed on upload/replace, so we
// dynamic-import the library on first use instead of shipping it (~100 KB+) in
// the initial bundle. The module namespace is cached after the first call and
// the worker source is configured exactly once.
let pdfjsPromise = null

export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
      return pdfjs
    })
  }
  return pdfjsPromise
}
