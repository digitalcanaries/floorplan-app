# Film Set Floor Plan Layout App

## Project Overview
A React web app for film production teams to upload floor plan PDFs (multi-layer), place scaled "set" rectangles on them, define spatial rules, auto-arrange the layout, and tour it in 3D. Backed by an Express + SQLite server for auth, project persistence, and reference-material uploads.

## Tech Stack
- React 19 + Vite 7 (plain JS/JSX, no TypeScript)
- Fabric.js 7 for 2D canvas manipulation
- Three.js 0.182 + @react-three/fiber + drei for the 3D set tour
- pdfjs-dist for PDF rendering, tesseract.js for OCR
- Zustand 5 for state management
- Tailwind CSS 4 for styling
- Backend: Express 5 + better-sqlite3, JWT auth (jsonwebtoken + bcryptjs), multer for uploads

## File Structure
```
src/
  main.jsx           — React entry point
  App.jsx            — Root layout: TopBar + Sidebar + FloorCanvas / Scene3D
  store.js           — Zustand store (sets, rules, pdfLayers, calibration, groups, persistence)
  api.js             — fetch wrappers to the Express backend
  authStore.js       — auth/session state (JWT)
  SetsTab.jsx        — set list/CRUD
  FloorCanvas.jsx    — Fabric.js 2D canvas: PDF layers, grid, set rects, rules, pan/zoom
  components/
    TopBar / Sidebar / QuickActionsBar — chrome
    PdfUploader / LayersTab            — PDF layers + overlays
    SetsTab / RulesTab / EditSetModal  — sets & rules
    BuildTab / FlatBuilder / Scene3D   — 3D construction-frame tour
    ReferenceSheetModal / BulkImport   — reference materials & import
    LoginScreen / UserMenu / ChangePasswordModal / HelpGuide
  engine/
    scoring.js       — layout scoring (overlap + rule penalties)
    autoLayout.js    — bin-packing + iterative optimizer
    geometry.js / units.js / componentIcons.js — geometry, unit conversion, icons

server/                — Express 5 + better-sqlite3 API
  index.js  auth.js  db.js
  routes/   admin.js auth.js components.js files.js projects.js refs.js
```

## Coordinate invariant
`set.x`/`set.y` = PIXELS, `set.width`/`set.height` = FEET. `pixelsPerUnit` is set at calibration.

## Build Phases
1. **Canvas + PDF** — Fabric.js canvas with pan/zoom/grid, PDF upload + background
2. **Set Rectangles** — CRUD sets, draggable color-coded rectangles, snap, rotate
3. **Rules/Constraints** — NEAR/CONNECT/SEPARATE/FIXED rules with visual indicators
4. **Auto-Layout** — Scoring engine + bin-packing + optimization
5. **Export & Save** — JSON save/load, PNG export, localStorage auto-save

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `docker compose up -d --build` — Build and deploy with Docker

## Key Interactions
- **Pan**: Ctrl+drag on canvas
- **Zoom**: Mouse scroll wheel
- **Move set**: Drag rectangle
- **Rotate set**: Double-click rectangle
- **Calibrate**: Click two points on PDF, enter real distance
