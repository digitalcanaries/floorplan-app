# Film Set Floor Plan Layout App

## Project Overview
A client-side React web app for film production teams to upload a floor plan PDF, place scaled "set" rectangles on it, define spatial rules, and auto-arrange the layout.

## Tech Stack
- React 19 + Vite 7 (plain JS/JSX, no TypeScript)
- Fabric.js 7 for canvas manipulation
- pdfjs-dist for PDF rendering
- Zustand for state management
- Tailwind CSS 4 for styling
- No backend — everything is client-side

## File Structure
```
src/
  main.jsx           — React entry point
  App.jsx            — Root layout: TopBar + Sidebar + FloorCanvas
  store.js           — Zustand store (sets, rules, PDF, calibration, save/load)
  index.css          — Tailwind imports
  components/
    TopBar.jsx       — Toolbar: rotate, calibrate, grid, auto-layout, save/load, export
    Sidebar.jsx      — Tab container: PdfUploader + SetsTab / RulesTab
    PdfUploader.jsx  — PDF file input → pdfjs-dist render → dataURL
    SetsTab.jsx      — Add/edit/delete set forms + set list
    RulesTab.jsx     — Rule creation (NEAR/CONNECT/SEPARATE/FIXED) + rule list
    FloorCanvas.jsx  — Fabric.js canvas: PDF bg, grid, set rects, rule lines, pan/zoom
  engine/
    scoring.js       — Layout scoring: overlap penalty + rule penalties
    autoLayout.js    — Bin-packing + iterative optimizer (100 iterations)
```

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
