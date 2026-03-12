# Film Set Floor Plan — Project File

> **Status:** Code recovered, ready for local dev
> **Mac path:** `~/Projects/floorplan-app/`
> **Live URL:** http://16.54.34.31:3080
> **Server:** AWS Lightsail — `ubuntu@16.54.34.31`
> **Server path:** `/opt/apps/floorplan-app/`
> **SSH key (Mac):** `~/.ssh/floorplan/id_ed25519`
> **Port:** 3080

---

## What This App Is

A web-based **film/TV set floor plan layout tool** for production designers and set decorators. Upload a PDF floor plan, place scaled set rectangles, add architectural components (flats, walls, doors, windows), and auto-arrange layouts. Current use case: **Tim Luke hospital set** floor plans.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, plain JSX (no TypeScript) |
| Canvas | Fabric.js v7.1 |
| 3D | Three.js + @react-three/fiber + drei |
| PDF | pdfjs-dist + Tesseract.js (OCR) |
| State | Zustand v5 |
| Styling | Tailwind CSS v4 |
| Backend | Express.js v5, better-sqlite3, JWT auth |
| Deployment | Docker on AWS Lightsail (Ubuntu 24.04) |

---

## File Structure

```
server/
  index.js              — Express server, static files, SPA fallback
  db.js                 — SQLite (users, projects, component_types)
  auth.js               — JWT middleware
  routes/
    auth.js             — Login endpoint
    projects.js         — Project CRUD + sharing
    admin.js            — User management (admin only)
    components.js       — Component library CRUD

src/
  main.jsx              — React entry point
  App.jsx               — Root layout: TopBar + Sidebar + FloorCanvas
  store.js              — Main Zustand store
  api.js                — API fetch helper with auth headers
  authStore.js          — Zustand auth state
  engine/
    geometry.js         — AABB, overlap, cut polygons, label positioning
    componentIcons.js   — Fabric.js icon rendering
    autoLayout.js       — Bin-packing + simulated annealing
    scoring.js          — Layout scoring
  components/
    FloorCanvas.jsx     — Main Fabric.js canvas
    Sidebar.jsx         — Resizable sidebar (Sets/Build/Rules tabs)
    SetsTab.jsx         — Set list, add/edit, multi-select, alignment
    BuildTab.jsx        — Component library browser, suggest flats
    FlatBuilder.jsx     — Custom flat/window/door creation
    RulesTab.jsx        — Rule management
    TopBar.jsx          — Toolbar (grid, snap, labels, save/load)
    LayersTab.jsx       — Layers & visibility
    Scene3D.jsx         — Three.js 3D walk-through
    HelpGuide.jsx       — Searchable help guide
    LoginScreen.jsx     — Auth UI
    UserMenu.jsx        — User dropdown
    BulkImport.jsx      — Paste-list bulk set import
    PdfUploader.jsx     — PDF upload
    ChangePasswordModal.jsx
```

---

## Commands

```bash
npm install             # Install dependencies
npm run dev             # Start Vite dev server
npm run build           # Production build
npm start               # Start Express server (production)
docker compose up -d --build  # Deploy with Docker
```

---

## Key Features

- PDF floor plan upload with calibration (click two points, enter distance)
- 40+ default architectural components (flats, walls, windows, doors, columns, stairs)
- Custom Flat/Window/Door builders
- Multi-select with alignment & distribution tools
- Labels with callout mode (leader lines + arrowheads)
- Rules engine (NEAR/CONNECT/SEPARATE/FIXED)
- Auto-layout via bin-packing + simulated annealing
- 3D walk-through (Three.js)
- Save/load to server (SQLite) + JSON export/import + PNG export
- User auth (JWT) with admin panel
- Project sharing between users

---

## Server Access

```bash
ssh -i ~/.ssh/floorplan/id_ed25519 ubuntu@16.54.34.31
cd /opt/apps/floorplan-app
```

---

## Deployment

```bash
# Build and push to server
scp -i ~/.ssh/floorplan/id_ed25519 -r src server package.json vite.config.js Dockerfile docker-compose.yml ubuntu@16.54.34.31:/opt/apps/floorplan-app/
ssh -i ~/.ssh/floorplan/id_ed25519 ubuntu@16.54.34.31 "cd /opt/apps/floorplan-app && docker compose down && docker compose up -d --build"
```

---

## Reference Materials (Windows laptop — 192.168.2.11:8888)

| File | Path |
|------|------|
| Hospital floor plans PDF | `Downloads/HOSPITAL FLOOR PLANS WITH LETTER KEY.pdf` |
| Hospital set notes | `Downloads/Tim luke hospital plans.../hospital set notes.docx` |
| Mood board | `Downloads/Tim luke hospital plans.../hospitalmoodboard.pdf` |
| Scrub room sample | `Downloads/Tim luke hospital plans.../scrub room sample.jpg` |
| V2 plans | `Downloads/Tim luke hospital plans.../v2 hospital plans/` |
| Original search prompt | `Downloads/floorplan-search-prompt.md` |

---

## Next Steps

1. ~~Get SSH key to Mac~~ Done
2. ~~Pull source code from server~~ Done
3. `npm install` and run local dev server
4. Push to GitHub (`digitalcanaries/floorplan-app`)
5. Resume development — Phase 2 (3D visualization) or new features
