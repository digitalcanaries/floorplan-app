# Film Set Floor Plan Layout App — Handoff Summary

Upload this file to a new Claude Code chat to continue development.

_Last regenerated against HEAD `f135466` on 2026-04-18._

---

## Project Overview

A web app for planning film/TV set construction. Users upload PDF blueprints, calibrate scale, drag rooms/walls/doors/windows onto a 2D canvas, then view the layout in 3D walk-through mode with construction-frame rendering.

- **GitHub**: `digitalcanaries/floorplan-app`
- **Live Server**: `http://16.54.34.31:3080` (AWS Lightsail Ubuntu 24.04)
- **SSH**: `ssh -i C:\Users\Simons Laptop\keypairs\devkey.pem ubuntu@16.54.34.31`
- **App directory on server**: `/opt/apps/floorplan-app/`
- **Local dev path**: `C:\Projects\floorplan-app`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, plain JSX (no TypeScript) |
| 2D Canvas | Fabric.js v7.1.0 |
| 3D Rendering | Three.js 0.182 + @react-three/fiber 9.5 + @react-three/drei 10.7 (lazy-loaded) |
| State | Zustand 5.0 (single store: `src/store.js`) |
| Styling | Tailwind CSS v4 |
| Backend | Express.js v5, better-sqlite3, JWT auth (bcryptjs + jsonwebtoken) |
| PDF / OCR | pdfjs-dist 5.4 + Tesseract.js 7 |
| Deploy | Docker multi-stage build, `docker-compose.yml` |

---

## Deployment Process

```bash
# From local machine (C:\Projects\floorplan-app)
# 1. Build locally to verify
npm run build

# 2. Commit and push
git add <files>
git commit -m "message"   # Do NOT include Co-Authored-By
git push origin main

# 3. SCP files to server
scp -i "C:\Users\Simons Laptop\keypairs\devkey.pem" -r \
  src server public package.json package-lock.json vite.config.js Dockerfile docker-compose.yml \
  ubuntu@16.54.34.31:/opt/apps/floorplan-app/

# 4. Rebuild Docker on server
ssh -i "C:\Users\Simons Laptop\keypairs\devkey.pem" ubuntu@16.54.34.31 \
  "cd /opt/apps/floorplan-app && docker compose down && docker compose up -d --build"

# If Docker cache error, add --no-cache:
# docker compose up -d --build --no-cache

# If seed data changed, delete DB first:
# ssh ... "rm -f /opt/apps/floorplan-app/data/floorplan.db"
```

**Important**: Do NOT include `Co-Authored-By` lines in commits.

---

## File Structure & Line Counts

```
src/
  store.js                    (1092 lines) — Zustand store, all state + actions
  App.jsx                     (57 lines)   — Main app layout
  api.js                      (51 lines)   — API fetch helper with JWT
  authStore.js                (55 lines)   — Auth state
  components/
    FloorCanvas.jsx           (1615 lines) — Main 2D Fabric.js canvas
    Scene3D.jsx               (1552 lines) — 3D rendering engine
    SetsTab.jsx               (1046 lines) — Set list panel with editing
    FlatBuilder.jsx           (854 lines)  — Custom flat/window/door creation modal
    BuildTab.jsx              (623 lines)  — Component library tab
    TopBar.jsx                (604 lines)  — Top toolbar (save/load/undo/redo/export)
    HelpGuide.jsx             (499 lines)  — User guide modal
    BulkImport.jsx            (335 lines)  — Bulk CSV import
    LayersTab.jsx             (332 lines)  — Layer visibility controls
    UserMenu.jsx              (233 lines)  — User account menu
    Sidebar.jsx               (109 lines)  — Tab container
    PdfUploader.jsx           (108 lines)  — PDF upload/parsing
    ChangePasswordModal.jsx   (103 lines)
    RulesTab.jsx              (91 lines)   — Adjacency rules
    LoginScreen.jsx           (57 lines)   — Login form
  engine/
    componentIcons.js         (1658 lines) — All 2D plan-view icon drawing functions
    geometry.js               (283 lines)  — Overlap detection, area calculations
    autoLayout.js             (113 lines)  — Auto-placement algorithm
    scoring.js                (80 lines)   — Layout scoring
server/
  index.js                    (48 lines)   — Express server, serves dist/
  db.js                       (201 lines)  — SQLite schema + seed data
  auth.js                     (38 lines)   — JWT middleware
  routes/
    projects.js               (98 lines)   — Project save/load/share
    components.js             (76 lines)   — Component library CRUD
    admin.js                  (74 lines)   — User management
    auth.js                   (72 lines)   — Login/register
```

Total: ~12.2k LOC.

---

## Critical Data Model

### Set Object (stored in `store.sets[]`)

```javascript
{
  id: 1,
  name: "Courtroom",
  x: 150.5,             // PIXELS — top-left corner position on 2D canvas
  y: 230.7,             // PIXELS
  width: 38,            // FEET — always feet, never pixels
  height: 50,           // FEET — always feet
  rotation: 0,          // degrees clockwise (free rotation supported in 2D + 3D)
  category: 'Set',      // 'Set', 'Wall', 'Door', 'Window', 'Other', or undefined
  color: '#FF6B6B',
  wallHeight: 10,       // elevation height in feet (3D wall height, default 10)
  thickness: 0.292,     // wall thickness in feet
  iconType: 'rect',     // 'rect', 'flat', 'flat-double', 'flat-braced',
                        //   'door', 'door-double', 'door-arch', 'window', 'window-bay',
                        //   'column', 'stair', 'sink', 'stove', 'toilet', 'bed', etc.
  componentProperties: {
    elevationHeight: 10,  // actual 3D height for doors/windows/flats
    style: 'hollywood',   // flat style
    swing: 'left',        // door swing direction: 'left', 'right', 'both'
    panes: 2,             // window pane count
  },
  onPlan: true,
  hidden: false,
  lockedToPdf: false,
  opacity: 1,
  zIndex: 1,
  elevation: 0,         // height off floor for 3D placement
  wallGap: 0,           // access gap distance
  gapSides: null,       // { top: true, right: true, bottom: true, left: true }
  noCut: false,
  labelHidden: false,
  labelPosition: 'top-left',
  materialTexture: null, // 'brick', 'concrete', 'greenscreen', 'wood'
  componentTypeId: null,

  // Per-wall controls (added post 3c94e75 / 4fd2426)
  wallRenderMode: 'finished', // per-set override: 'finished' / 'construction-front' / 'construction-rear'
  wallsRemoved: {},           // { top: true, ... } — remove specific walls in 3D
  wallsHidden: {},            // { top: true, ... } — hide specific walls without removing
  wallsLocked: {},            // per-wall lock state for resize
  wallExtensions: {},         // per-side extension distances
}
```

### Coordinate System — THE MOST IMPORTANT THING TO UNDERSTAND

- **2D Canvas**: `set.x`, `set.y` = PIXEL position (top-left corner of bounding box)
- **2D Canvas**: `set.width`, `set.height` = FEET (dimensions are always in feet)
- **pixelsPerUnit (ppu)**: Conversion factor set at calibration time.
- **Pixel footprint on canvas**: `width_px = set.width * ppu`, `height_px = set.height * ppu`
- **3D World**: X = right, Y = up, Z = into screen (Z maps to 2D Y axis)
- **3D Conversion** via `get3DPosition(set, ppu)` in `Scene3D.jsx:66` — handles arbitrary rotation angles via general trig (not just 0/90/180/270).

### Category Routing in 3D (`SceneContent`, Scene3D.jsx ~line 1196)

| Category | 3D Component | How it renders |
|----------|-------------|----------------|
| `'Set'` or `undefined` | `SetRoomWalls` | 4 walls + floor per room, with door/window openings cut and shared edges deduped |
| `'Wall'` or `iconType='flat'/'flat-double'/'braced-wall'` | `WallMesh` | Individual wall flats with door/window openings (`WallWithOpenings`) |
| `'Door'` | `DoorMesh3D` | Door frame + posts + header + threshold |
| `'Window'` | `WindowMesh3D` | Glass pane + frame + sill wall |
| `'Furniture'`/`'Other'`/`'Column'`/`'Stair'`/`'Bathroom'`/`'Kitchen'` | `SpecialSetMesh` | Solid boxes, cylinders, stepped blocks |

### 3D Room Wall Rendering — Current State

The previously-flagged "Active Bug" (rooms rendering as solid/clipping walls with no door/window cutouts) has been addressed across several commits:

- `b765a61` — Rewrote `SetRoomWalls` to cut door/window openings and dedup shared edges
- `f135466` — Added construction flat rendering for room walls in 3D
- `3c94e75` — Per-set `wallRenderMode` + per-wall remove/hide controls (`wallsRemoved`, `wallsHidden`) give the user a manual escape hatch when auto-dedup gets it wrong
- `6d61b60` — Wall removal for intersecting rooms in 2D and 3D
- `64e88fd` / `d13d2d8` — General-trig positioning so arbitrary rotation angles work, not just cardinals

Current `SetRoomWalls` (Scene3D.jsx:744) uses:
- `EDGE_TOL = 0.5 ft` for shared-edge dedup
- `OPEN_TOL = 1.0 ft` for door/window proximity to a wall edge
- Axis-aligned bounding boxes via `getAABB()` for dedup/overlap on cardinal rotations
- `subtractIntervals()` to cut opening ranges out of wall segments

If rendering bugs resurface, start there and at `SceneContent` (Scene3D.jsx:1196) where routing happens.

---

## Scene3D.jsx Component Map (1552 lines)

| Lines | Component | Purpose |
|-------|-----------|---------|
| 1-65 | Constants + imports | Magic numbers, THREE imports |
| 66-91 | `get3DPosition()` | Coordinate conversion (general trig, arbitrary rotation) |
| 92-187 | `FlatConstructionFrame` | Visible timber framing for construction view |
| 188-226 | `DoorMesh3D` | 3D door frame rendering |
| 227-281 | `WindowMesh3D` | 3D window with glass, frame, sill |
| 282-375 | `WallMesh` | Individual Wall category items, legacy height detection |
| 376-492 | `WallWithOpenings` | Splits wall into segments around door/window openings |
| 493-743 | `SpecialSetMesh` | Columns, stairs, furniture, kitchen, bathroom |
| 744-1038 | `SetRoomWalls` | Hollow room rendering with opening cuts + edge dedup |
| 1039-1073 | `FloorPlane` | Ground plane computed from set bounds |
| 1074-1169 | `FirstPersonControls` | WASD + pointer-lock FPS controls |
| 1170-1195 | `SetLabel3D` | Floating text labels above sets |
| 1196-1354 | `SceneContent` | Main component: filters sets, routes to renderers, drag-to-position |
| 1355-1552 | `Scene3D` (exported) | Canvas wrapper with control bar, mode switcher |

---

## Store Key State (store.js, 1092 lines)

```javascript
{
  // Canvas
  sets: [],
  pixelsPerUnit: 1,
  unit: 'ft',
  pdfImage: null,
  pdfRotation: 0,
  pdfPosition: { x: 0, y: 0 },

  // 3D
  defaultWallHeight: 10,         // feet (global default for set walls)
  viewMode: 'plan',              // 'plan', 'elevation', '3d'
  wallRenderMode: 'finished',    // global default: 'finished', 'construction-front', 'construction-rear'

  // Undo/Redo (50-level)
  _past: [], _future: [],
  undo(), redo(),

  // UI
  gridVisible: true,
  snapToGrid: true,
  snapToSets: true,
  labelsVisible: true,
  showOverlaps: true,
  showDimensions: false,
  hideAllSets: false,            // clean-PDF tracing toggle (405f431)
  hideLockIndicators: false,     // (ea20228)
  layerVisibility: {},

  // Actions
  addSet, updateSet, deleteSet, setSets, duplicateSet,

  // Building walls (dcf66dd)
  buildingWalls: [],             // separate from sets[]; drawn as chained line segments

  // Project
  projectName: 'Untitled Project',
  exportProject(), importProject(), saveProjectAs(),
  autosave(),
}
```

---

## Seed Data (server/db.js)

The `component_types` table is seeded with ~60+ default components:

### Wall Flats (category: 'Wall')
- Hollywood Flats: 1'/2'/3'/4' × 8'/10'/12' — `icon_type: 'flat'`
- **LEGACY BUG**: `height` field stores elevation height (8, 10, 12ft) not plan-view depth. `WallMesh` detects this via `isLegacyHeight = set.height > thickness * 3` and swaps.
- Double Flats: 4' × 8'/10'/12' — `icon_type: 'flat-double'`
- Braced Access: 4' × 8'/10'/12' — `icon_type: 'flat-braced'`, thickness 2.583ft

### Windows (category: 'Window')
- `height` = plan-view depth (0.5ft). `properties.elevationHeight` = face height.
- Standard (single/multi-pane), picture, bay windows

### Doors (category: 'Door')
- `height` = plan-view depth (0.333ft). `properties.elevationHeight` = face height.
- Single, double, arch doors with swing direction (including "Both")

### Other (category: 'Other')
- Columns, stairs, fireplaces, kitchen (sinks, stoves, fridges, counters, islands)
- Bathroom (bathtubs, toilets, showers, vanities)
- Furniture (tables, desks, sofas, beds, wardrobes, bookshelves)

---

## Docker / Infrastructure

```yaml
# docker-compose.yml
services:
  floorplan:
    build: .
    ports: ["3080:3080"]
    volumes: [floorplan-data:/app/data]
    restart: unless-stopped
    container_name: floorplan-app
    environment:
      - JWT_SECRET=floorplan-secret-key-change-me
      - ADMIN_PASSWORD=admin
volumes:
  floorplan-data:
```

```dockerfile
# Dockerfile (multi-stage)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server/ ./server/
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3080
CMD ["node", "server/index.js"]
```

---

## Completed Features

### Phase 1 — 2D Floor Plan (COMPLETE)
- PDF upload, scale calibration (two-point), rotate PDF, drag PDF
- Drag/drop room placement with labels, categories, colors
- Overlap detection, adjacency rules (NEAR/CONNECT/SEPARATE/FIXED)
- Auto-layout with bin-packing + simulated annealing
- Component library (60+ items: walls, doors, windows, furniture, bathroom, kitchen)
- Custom Flat Builder (Hollywood/Broadway/Braced with material estimates)
- Custom Window Builder (standard, multi-pane, bay with visual preview)
- Custom Door Builder (single, double, arch with swing direction including "Both")
- Bulk CSV import + OCR measurement reading
- Plan-view architectural icons for all component types
- Grid/snap with edge snapping and visual guide lines
- Labels (inline, callout left/right) with per-set positioning
- Dimension lines, hover tooltips, overlap zones
- Layers panel with category visibility
- Groups (create, collapse, delete)
- Annotations (text labels on canvas, draggable, editable)
- Copy/paste (Ctrl+C/V), duplicate (Ctrl+D), delete
- Undo/Redo (Ctrl+Z/Y, 50-level history)
- Multi-select with bulk category/color/noCut/hide/delete
- Alignment tools for multi-selected sets
- Lock-to-PDF, duplicate, remove-from-plan
- Hide All Sets toggle for clean PDF tracing
- Hide lock indicator toggle
- Building walls drawing system (chained segments, H/V snap, chain break)
- Wall removal for intersecting rooms (2D + 3D)
- Per-wall lock/unlock, per-wall rotation controls
- Precision rotation (1° nudge buttons)
- Save/load to server + browser + file export/import
- PNG/PDF export with title block, scale bar, legend
- User auth (JWT), project sharing between users
- Searchable help guide (16 sections)

### Phase 2A — 3D View (FUNCTIONAL)
- 3D walk-through view (orbit + first-person WASD + pointer lock)
- Wall flat construction rendering (visible timber frame + luan skin)
- Door/window 3D meshes with proper elevation heights
- Special set rendering (columns as cylinders, stairs as steps, furniture as boxes)
- Floor plane, sky dome, lighting (ambient + directional + hemisphere), shadows
- Wall height display in set list (H:xx indicator)
- Legacy wall data height detection
- **Room wall rendering** — 4 walls per room with opening cuts + shared-edge dedup (b765a61, f135466)
- Free rotation in 3D with arbitrary angles (c036307)
- General-trig 3D positioning for rotated sets (64e88fd, d13d2d8)
- Interactive 3D drag-to-position system (e7f0d2c)
- 3-mode drag: move / elevate / rotate in 3D (20dfb7e)
- Per-set wall render mode + per-wall remove/hide/extend/lock (3c94e75, 4fd2426)
- Debug position overlay for 3D diagnostics (41a57bc)

---

## Git History (latest first, 65 total commits)

```
f135466 Add construction flat rendering for room set walls in 3D
64e88fd Fix 3D positioning for arbitrary rotation angles using general trig
d13d2d8 Fix 3D wall side mapping for rotated sets in SetRoomWalls
a8f38fb Fix WallMesh 3D position sync — add rotation-aware bbox offset
3c94e75 Add per-set wall render mode, per-wall remove/hide controls, wall extensions, and 2D/3D resize
2d98d3c Change defaults: building walls 13ft tall, set walls 10ft tall
4fd2426 Add per-wall lock/unlock, rotation controls, update defaults to 14ft/12"
711b8aa Add H/V snap toggle and chain break for building wall drawing
405f431 Add Hide All Sets toggle for clean PDF tracing
ea20228 Add toggle to hide lock indicator dashed lines
dcf66dd Add building walls drawing system
6223b8f Fix lock outline mismatch for rotated sets in plan view
41f461a Add precision rotation controls with 1-degree nudge buttons
9390388 Revert broken trig-based rotation math back to working version
c036307 Enable free rotation for sets in 3D view with arbitrary angles
6d61b60 Add wall removal for intersecting rooms in 2D and 3D views
20dfb7e Add 3-mode drag system: move, elevate, and rotate sets in 3D
f8d2012 Fix rotated set positions: correct pivot-to-bbox conversion
41a57bc Add debug position overlay to 3D view for diagnostics
330e04f Revert rotation math, remove grid to fix flicker
e54fe46 Fix 3D position mismatch for rotated sets + add lock toggle
e7f0d2c Add interactive 3D drag-to-position system
b765a61 Rewrite SetRoomWalls: cut door/window openings, dedup shared edges
94ad0e0 Simplify 3D room walls: 4 walls per room using get3DPosition
7399a63 Fix 3D walls: render all 4 walls per room, only cut door/window openings
... (40 earlier commits, starting at 000ee02 Initial commit)
```

---

## Roadmap (Future Phases)

### Phase 2B — Materials, Textures & Polish
Wall materials/textures, floor materials, ceiling types, set piece rendering, shadows/AO, screenshot capture

### Phase 2C — Prop Inventory Integration (BLOCKED — needs separate inventory app)
Connect to prop inventory API, prop images on 2D plan, 3D prop models, AI 3D generation

### Phase 2D — AI Photorealistic Rendering
Scene data export, AI image generation, style reference matching, video walkthrough generation

### Phase 3 — Production Tools
Construction drawings export, cable/power planning, cost estimation, schedule integration, multi-floor, real-time collaboration
