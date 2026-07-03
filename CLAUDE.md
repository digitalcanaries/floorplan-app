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
5. **Export & Save** — server projects (autosave + named Save As + version history), JSON/PNG export, browser-save + backup download

## Commands
- `npm run dev` — Start dev server (frontend only; login needs the backend)
- `npm run build` — Production build
- `npm run lint` — ESLint (should be **0 problems**)
- `npm start` — Run the Express server (`server/index.js`)
- `docker compose up -d --build` — Build + run the full app (frontend + server) in Docker

## Key Interactions
- **Pan**: Ctrl/⌘+drag on empty canvas (2-finger drag on iPad)
- **Zoom**: Mouse scroll wheel / pinch
- **Move set**: Drag rectangle
- **Rotate set**: Double-click rectangle
- **Calibrate**: Click two points on the PDF, enter the real distance
- **Select multiple**: marquee — plain left-drag on empty canvas; or Ctrl/Shift+click to toggle. Selection shows cyan (primary = white).
- **Move/Delete a group**: drag any selected piece, or arrow keys; `Delete`/`Backspace` removes the whole selection. `Ctrl+G` groups.
- **Replace the background PDF**: Layers tab → PDF layer → **⤓** (swaps the image, keeps scale/position/pins).

## Selection, boards & fit
- **PDF layers**: multiple backgrounds; per-layer opacity, scale-to-dimension, flip, pin-to-set, position lock (Layers tab).
- **Artboards ("Boards")**: named frames that auto-wrap their member sets (`set.boardId`). Create from selection, assign (+Sel), rename, remove — Layers tab → Boards. Click a board's on-canvas title chip to select its pieces, then drag/Delete as a unit. Frame is derived from members, so it follows them.
- **Fit All**: fits the live canvas area; excludes far-flung "stray" pieces so the real layout fills the screen and prompts to delete them. **Center View** re-centers at current zoom. Canvas re-centers automatically when the sidebar collapses (ResizeObserver).
- **Duplicate → New Background** (Save menu): forks a server project keeping sets/walls, blank canvas for a new plan.

## ⚠️ FloorCanvas gotcha (TDZ)
Several callbacks (`zoomReset`, `centerView`, `fitAll`, `showOutliers`, `deleteOutliers`) are defined **above** the big `const {…} = useStore()` destructure. They must read state/actions via `useStore.getState()` and must NOT reference destructured vars in their body or `useCallback` deps — doing so throws a Temporal Dead Zone ReferenceError at render (blank white screen, post-login only; build/lint do NOT catch it). Effects placed after the destructure are fine.

## Deploy
- Canonical branch: **`master`** (never `main` — it's a divergent scrap branch).
- Live at `16.54.34.31:3080` (AWS Lightsail, `/opt/apps/floorplan-app`, Docker Compose). Live IS dev (solo user, no staging).
- Flow: `git push origin master` → on server `git pull && docker compose down && docker compose up -d --build`. Never scp individual files.
- Bump `package.json` version on every change. No `Co-Authored-By` in commits.
