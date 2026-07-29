import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode temporarily disabled while diagnosing AnnotateImageModal
// fabric-init lifecycle — double-invoked effects were tearing down the
// fabric canvas between mount cycles. Re-enable once init is idempotent.
// eslint-disable-next-line no-unused-vars
const _ = StrictMode
createRoot(document.getElementById('root')).render(
  <App />
)
