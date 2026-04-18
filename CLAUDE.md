# Film Set Floor Plan Layout App

## Project Overview
Web app for film production teams to plan set construction. Upload a floor plan PDF, calibrate scale, place rooms/walls/doors/windows on a 2D canvas, then walk the layout in 3D.

## Tech Stack
- React 19 + Vite 7 (plain JSX, no TypeScript)
- Fabric.js v7 for the 2D canvas
- Three.js 0.182 + @react-three/fiber 9 + @react-three/drei 10 for 3D (lazy-loaded)
- Zustand 5 for state (single store: `src/store.js`)
- Tailwind CSS 4 for styling
- pdfjs-dist 5 + Tesseract.js 7 for PDF rendering and OCR
- Express 5 + better-sqlite3 backend with JWT auth (bcryptjs + jsonwebtoken)
- Docker multi-stage build, deployed to AWS Lightsail

## File Structure
```
src/
  main.jsx, App.jsx, store.js, api.js, authStore.js, index.css
  components/
    TopBar, Sidebar, PdfUploader, SetsTab, RulesTab, BuildTab, LayersTab, BulkImport,
    FlatBuilder, FloorCanvas, Scene3D, HelpGuide, LoginScreen, UserMenu, ChangePasswordModal
  engine/
    scoring.js, autoLayout.js, geometry.js, componentIcons.js
server/
  index.js, db.js, auth.js
  routes/ auth.js, admin.js, components.js, projects.js
```

## Commands
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm start` — Express server (serves `dist/` + API)
- `docker compose up -d --build` — build and run container

## Key Interactions
- **Pan**: Ctrl+drag on canvas
- **Zoom**: mouse scroll
- **Move set**: drag rectangle
- **Rotate set**: double-click rectangle (or precision 1° nudge controls)
- **Calibrate**: click two points on PDF, enter real distance
- **3D view**: orbit + WASD + pointer lock; drag-to-position / elevate / rotate modes

## Deployment
- **GitHub**: `digitalcanaries/floorplan-app`
- **Server**: 16.54.34.31:3080 (AWS Lightsail Ubuntu 24.04)
- **SSH**: `ssh -i C:\Users\Simons Laptop\keypairs\devkey.pem ubuntu@16.54.34.31`
- **App dir on server**: `/opt/apps/floorplan-app/`
- **Local dev path**: `C:\Projects\floorplan-app`
- **Do NOT include `Co-Authored-By` in commit messages.**

## Defaults
- Set wall height: 10 ft (`store.defaultWallHeight`)
- Wall thickness: 0.292 ft
- Unit: feet throughout; `set.width` / `set.height` are FEET, `set.x` / `set.y` are PIXELS
