# Floor Plan Layout Tool — Project Summary

## Overview
A web-based film/TV set floor plan layout tool for designing stage layouts, placing architectural components, and planning set construction. Built for production designers and set decorators working on film, television, and stage productions.

**Live URL:** http://16.54.34.31:3080
**Repository:** digitalcanaries/floorplan-app
**Last Updated:** February 2026

## Tech Stack
- **Frontend:** React 19 + Vite 7, Fabric.js v7.1 (canvas), Zustand (state), Tailwind CSS v4
- **Backend:** Express.js v5, better-sqlite3, JWT authentication
- **Deployment:** Docker multi-stage build on AWS Lightsail (Ubuntu 24.04)
- **PDF:** pdfjs-dist for PDF rendering + Tesseract.js for OCR dimension extraction

---

## Phase 1 — Feature Status (COMPLETE)

### Core Canvas
| Feature | Status |
|---------|--------|
| Upload PDF floor plans as background | DONE |
| Calibrate scale (two-point click) | DONE |
| Rotate PDFs 90 degrees | DONE |
| Scroll to zoom, Ctrl+drag to pan | DONE |
| Grid overlay with snap-to-grid | DONE |
| Edge snapping with visual guide lines | DONE |

### Sets
| Feature | Status |
|---------|--------|
| Add individual sets (name, dimensions, colour, category) | DONE |
| Bulk import via paste list ("Set Name - 23x27") | DONE |
| OCR: Read measurements from PDF text/image layers | DONE |
| Categories: Set, Wall, Window, Door, Furniture, Bathroom, Stair, Column, Other | DONE |
| Opacity control per set (10%-100%) | DONE |
| Z-order layering (bring forward/send backward) | DONE |
| Duplicate sets with auto-incrementing names | DONE |
| Lock sets to PDF position (move with PDF) | DONE |
| Hide/show sets, remove from plan, restore | DONE |
| Cut-into feature (L-shapes, notched polygons) | DONE |
| Wall access gap zones with presets (1ft, 2ft, 4ft, 6ft) | DONE |
| No-cut flag for walls/windows/doors | DONE |
| Door frame depth in inches (presets: 4, 4.5, 5, 6") | DONE |
| Window depth in inches (presets: 3, 4, 6, 12, 18, 24, 36") | DONE |

### Build Tab & Component Library
| Feature | Status |
|---------|--------|
| Server-side SQLite database (~40+ default components) | DONE |
| Hollywood Flats, Double Flats, Braced Access Walls | DONE |
| Windows (single/multi-pane/picture) | DONE |
| Doors (single, double, arch) with both-swing support | DONE |
| Custom Flat Builder with material estimates | DONE |
| Custom Window Builder (1-4 panes, visual preview) | DONE |
| Custom Door Builder (swing direction) | DONE |
| Suggest Flats (auto-calculate flat layout for set walls) | DONE |
| Architectural plan-view icons on canvas | DONE |

### Labels, Callouts & Visibility
| Feature | Status |
|---------|--------|
| Global labels toggle (name, dims, category, rotation) | DONE |
| Three display modes: On Sets, Right Side, Left Side callout | DONE |
| Callout leader lines with colour-coded arrowheads | DONE |
| Per-set label position (9 positions: TL, T, TR, L, C, R, BL, B, BR) | DONE |
| Per-set label toggle (show/hide individual labels) | DONE |
| Bulk label position change via multi-select | DONE |
| Dimension lines (per-set width/height + inter-set distances) | DONE |
| Hover tooltips with toggle on/off | DONE |
| Overlap zone detection (red dashed rectangles) | DONE |

### Layers Panel
| Feature | Status |
|---------|--------|
| Layers tab in sidebar | DONE |
| Display options toggles (grid, labels, overlaps, dims, tooltips) | DONE |
| Category layer visibility (show/hide by category) | DONE |
| Area calculation summary (per-category + bounding box) | DONE |

### Groups
| Feature | Status |
|---------|--------|
| Create groups from multi-select or Layers tab | DONE |
| Collapse/expand groups | DONE |
| Delete groups (sets remain) | DONE |
| Group button in bulk actions bar | DONE |

### Annotations
| Feature | Status |
|---------|--------|
| Add text annotations to canvas | DONE |
| Draggable annotation positioning | DONE |
| Double-click to edit annotation text | DONE |
| Font size, colour control per annotation | DONE |
| Delete annotations | DONE |
| Annotations included in undo/redo history | DONE |

### Copy, Paste & Keyboard Shortcuts
| Feature | Status |
|---------|--------|
| Ctrl+C: Copy selected set | DONE |
| Ctrl+V: Paste at offset | DONE |
| Ctrl+D: Duplicate selected set | DONE |
| Delete/Backspace: Delete selected set | DONE |
| Ctrl+Z: Undo (50-step history) | DONE |
| Ctrl+Shift+Z / Ctrl+Y: Redo | DONE |

### Multi-Select & Alignment
| Feature | Status |
|---------|--------|
| Checkbox multi-select + Shift+click | DONE |
| Bulk actions: category, colour, no-cut, hide, remove, delete, group | DONE |
| Alignment tools: left, right, top, bottom, centre H/V | DONE |
| Distribution: horizontal/vertical with equal spacing | DONE |

### Rules & Auto Layout
| Feature | Status |
|---------|--------|
| Relationship rules: NEAR, CONNECT, SEPARATE, FIXED | DONE |
| Auto layout (bin-packing + simulated annealing) | DONE |
| Try Alternate / Clear Layout | DONE |

### Save/Load & Export
| Feature | Status |
|---------|--------|
| Autosave to browser localStorage | DONE |
| Save/load to server (SQLite) | DONE |
| Save to browser with named saves | DONE |
| Export/import as JSON files | DONE |
| Export canvas as PNG screenshot | DONE |
| Share projects with other users | DONE |
| Print/PDF export (title block, scale bar, legend, area table) | DONE |
| Templates (883 Islington Ave warehouse pre-loaded) | DONE |
| Load from file (JSON import) | DONE |

### PDF Floor Plan Extraction
| Feature | Status |
|---------|--------|
| 883 Islington Ave floor plan extracted and recreated | DONE |
| Warehouse zones (Option 1/2/3 with sq footage) | DONE |
| Office rooms, washrooms, utility rooms, corridors | DONE |
| Loading docks (6 T.L. + 1 G.L.), stairwells, columns | DONE |
| Ceiling height annotations throughout | DONE |
| Groups organized by building section | DONE |

### User Management
| Feature | Status |
|---------|--------|
| JWT-based authentication | DONE |
| Admin panel for user CRUD | DONE |
| Password change with first-login forced change | DONE |
| Project sharing between users | DONE |

### Help & Documentation
| Feature | Status |
|---------|--------|
| Searchable help guide (16 sections) | DONE |
| Resizable sidebar with width persistence | DONE |

---

## Architecture

```
floorplan-app/
  server/
    index.js          — Express server, static file serving, SPA fallback
    db.js             — SQLite database (users, projects, component_types tables)
    auth.js           — JWT middleware
    routes/
      auth.js         — Login endpoint
      projects.js     — Project CRUD + sharing
      admin.js        — User management (admin only)
      components.js   — Component library CRUD
  src/
    api.js            — API fetch helper with auth headers
    authStore.js      — Zustand auth state
    store.js          — Main Zustand store (~800 lines: sets, rules, annotations,
                        groups, layers, clipboard, canvas state, save/load, undo/redo)
    engine/
      geometry.js     — AABB, overlap detection, cut polygons, label positioning
      componentIcons.js — Fabric.js icon rendering (windows, doors, flats, etc.)
      autoLayout.js   — Bin-packing + simulated annealing
    components/
      FloorCanvas.jsx — Main fabric.js canvas (~1100 lines: rendering, interaction,
                        snapping, dimensions, annotations, keyboard shortcuts)
      Sidebar.jsx     — Resizable sidebar with Sets/Build/Rules/Layers tabs
      SetsTab.jsx     — Set list, add/edit forms, multi-select, alignment
      BuildTab.jsx    — Component library browser, suggest flats
      FlatBuilder.jsx — Custom flat/window/door creation modals
      RulesTab.jsx    — Rule management
      LayersTab.jsx   — Layer visibility, groups, annotations, area calculation
      Scene3D.jsx     — Three.js 3D rendering engine (~700 lines: wall extrusion,
                        door/window openings, flat construction frame, orbit/walkthrough,
                        lighting, sky, floor, labels)
      TopBar.jsx      — Toolbar (~580 lines: grid, snap, labels, dims, save/load,
                        layout, print/PDF, templates, 3D view toggle)
      HelpGuide.jsx   — Searchable help guide (16 sections)
      UserMenu.jsx    — User dropdown (help, password, admin, logout)
  public/
    883-islington-floorplan.json — Template floor plan
    pdf.worker.min.mjs           — PDF.js web worker
```

## Data Model

### Set Properties
| Field | Type | Description |
|-------|------|-------------|
| id | number | Unique ID |
| name | string | Display name |
| width, height | number | Dimensions in project units |
| color | string | Hex colour |
| x, y | number | Canvas position (pixels) |
| rotation | number | 0, 90, 180, or 270 |
| category | string | Set/Wall/Window/Door/Furniture/Bathroom/Stair/Column/Other |
| noCut | boolean | Cannot be cut into |
| opacity | number | 0.1 to 1.0 |
| zIndex | number | Rendering order |
| lockedToPdf | boolean | Moves with PDF background |
| onPlan | boolean | Visible on canvas |
| hidden | boolean | Temporarily hidden |
| labelHidden | boolean | Per-set label visibility |
| labelPosition | string | Label anchor position |
| wallGap | number | Access gap distance (units) |
| cutouts | array | Cut polygon definitions |
| iconType | string | Component icon type (rect/flat/window/door/etc.) |
| thickness | number | Physical thickness for 3D |
| componentTypeId | number | Reference to component_types table |
| componentProperties | object | Panes, swing direction, depthFt, etc. |

### Annotation Properties
| Field | Type | Description |
|-------|------|-------------|
| id | number | Unique ID |
| text | string | Display text |
| x, y | number | Canvas position |
| fontSize | number | Font size in pixels |
| color | string | Text colour |

### Group Properties
| Field | Type | Description |
|-------|------|-------------|
| id | number | Unique ID |
| name | string | Group name |
| setIds | number[] | Array of set IDs in group |
| collapsed | boolean | UI collapse state |

### Component Types Table (SQLite)
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Primary key |
| category | TEXT | Wall/Window/Door/Other |
| subcategory | TEXT | Hollywood Flat, Multi Pane, etc. |
| name | TEXT | Display name |
| width, height | REAL | Dimensions in feet |
| thickness | REAL | Physical depth (feet) |
| icon_type | TEXT | Icon rendering type |
| properties | TEXT (JSON) | Panes, style, swing, etc. |
| is_default | INTEGER | 1 for seed data, 0 for user-created |
| created_by | INTEGER | User ID (custom components) |

---

## Development Roadmap — Path to 3D Set Walkthroughs

### Phase 2A — 3D Foundation (DONE)
_Goal: Get basic 3D extrusion of the 2D floor plan so you can see walls standing up._

| Step | Task | Status |
|------|------|--------|
| 2A-1 | **Add Three.js / React Three Fiber** — `@react-three/fiber` + `@react-three/drei` + `three`. Scene3D.jsx component lazy-loaded. "3D Walk-Through" option in view mode dropdown. | DONE |
| 2A-2 | **Extrude walls from 2D plan** — Walls/flats extruded to 3D boxes. `wallHeight` field (default 12ft). Construction view shows 1×3 timber framing with rails, stiles, toggles, luan skin. Toggle: Finished / Construction Front / Construction Rear. | DONE |
| 2A-3 | **Floor plane** — Dynamic floor mesh computed from set bounding box with 20ft padding. Concrete grey material. Grid helper overlay. | DONE |
| 2A-4 | **Camera controls** — OrbitControls (rotate/pan/zoom). First-person walkthrough (WASD + pointer lock mouse look). Eye-height at 5'6". Space/Shift for vertical movement. | DONE |
| 2A-5 | **Door & window openings** — Doors cut floor-to-head (7ft) openings in walls. Windows cut sill-to-head (3ft-7ft) openings with glass pane. Doors rendered as 3D frames with open passage. Windows rendered with frame and glass. | DONE |
| 2A-6 | **Lighting** — Ambient + directional (with shadow maps 2048px) + hemisphere sky/ground. Sky dome. | DONE |
| 2A-7 | **Per-wall access gap control** — Individual wall sides can have gap/no-gap. Zero gap option for back-to-back walls. Global + per-wall height settings. | DONE |
| 2A-8 | **Standard architectural icons** — Plan-view door symbols with swing arcs (single/double/arch). Window symbols with frame lines and glass. Proper wall section fills. | DONE |

**Deliverable:** Toggle between 2D plan view and 3D walkthrough. Navigate through sets in first-person. Toggle wall construction view to see framing.

### Phase 2B — Materials, Textures & Polish
_Goal: Make the 3D look realistic enough for client presentations._

| Step | Task | Details | Effort |
|------|------|---------|--------|
| 2B-1 | **Wall materials/textures** | Material selector per set: painted drywall, exposed brick, wood panelling, concrete, green screen. Store as `materialTexture` field on each set. | Medium |
| 2B-2 | **Floor materials** | Concrete, hardwood, carpet, tile, epoxy. Per-room floor material based on set category. | Small |
| 2B-3 | **Ceiling types** | Open joist (warehouse), drop ceiling (office), exposed deck. Use ceiling height annotations to set per-room heights. | Medium |
| 2B-4 | **Set piece rendering** | Furniture/bathroom/kitchen category sets rendered as basic 3D shapes (tables, chairs, toilets, sinks) instead of flat planes. | Medium |
| 2B-5 | **Shadows & ambient occlusion** | Shadow maps from directional light. SSAO for realistic depth. | Small |
| 2B-6 | **Screenshot / video capture** | "Capture 3D View" button exports a high-res PNG from the 3D scene. Optional screen recording for video walkthroughs. | Small |

**Deliverable:** Photo-quality 3D renders of set designs for director/producer approval.

### Phase 2C — Prop Inventory Integration (FUTURE — inventory not yet built)
_Goal: Connect to prop inventory system and place real props in 3D scenes._
_**Blocked by:** Prop inventory system needs to be built first as a separate project. This phase will be revisited once the inventory app exists with an API._

| Step | Task | Details | Effort |
|------|------|---------|--------|
| 2C-0 | **Build prop inventory app** | Separate project: prop database with photos, dimensions, categories, availability tracking. REST API for integration. | Large (separate project) |
| 2C-1 | **Prop inventory API connection** | Connect floor plan app to prop inventory API. Browse props by category, search by name. | Medium |
| 2C-2 | **Prop images on 2D plan** | Drag props from inventory onto the 2D floor plan. Display prop photo as the set icon instead of a plain rectangle. | Medium |
| 2C-3 | **3D prop models** | For props with photos: generate basic 3D models from images (billboards/sprites for photos, or proper .glb models if available). Place in 3D scene at floor-plan coordinates. | Large |
| 2C-4 | **AI 3D model generation** | Use AI image-to-3D (e.g., TripoSR, Meshy, Luma) to convert prop photos into 3D meshes. Cache generated models for reuse. | Large |
| 2C-5 | **Prop catalogue in Build tab** | New "Props" section in the Build tab showing inventory items with thumbnails, dimensions, and "Place on Plan" button. | Medium |
| 2C-6 | **Prop data sync** | Two-way sync: props placed on plan update inventory (assigned to production/set). Check-in/check-out status visible on plan. | Medium |

**Deliverable:** Browse real props from inventory, drag them onto the floor plan, see them in the 3D walkthrough with actual photos/models.

### Phase 2D — AI Photorealistic Rendering
_Goal: Generate photorealistic images and video of set designs for pre-visualization._

| Step | Task | Details | Effort |
|------|------|---------|--------|
| 2D-1 | **Scene data export** | Export full scene (geometry, materials, lighting, camera) as a structured format (glTF / USD / custom JSON) for AI rendering. | Medium |
| 2D-2 | **AI image generation integration** | Send scene description + camera angle to an AI image model (Stable Diffusion / DALL-E / Midjourney API). Generate photorealistic stills from chosen viewpoints. | Large |
| 2D-3 | **Style reference matching** | Upload reference photos (real locations, mood boards) and use style-transfer to match the render aesthetic. | Medium |
| 2D-4 | **Video walkthrough generation** | Define camera path through the 3D scene. Generate frame-by-frame AI renders stitched into a video. | Large |
| 2D-5 | **Before/after comparison** | Side-by-side view: 3D wireframe vs. AI photorealistic render vs. reference photo. | Small |

**Deliverable:** From a 2D floor plan, generate photorealistic video walkthroughs of the dressed set for stakeholder review.

### Phase 3 — Production Tools
_Goal: Full production pipeline integration._

| Step | Task | Details | Effort |
|------|------|---------|--------|
| 3-1 | **Construction drawings export** | Generate elevation views, section cuts, and cut lists from the 3D model. Export as PDF or DXF for the construction crew. | Large |
| 3-2 | **Cable/power run planning** | Plan cable routes through braced access walls. Show power distribution in both 2D and 3D views. | Medium |
| 3-3 | **Cost estimation** | Calculate material costs based on component library (lumber, luan, hardware). Connect to vendor pricing. | Medium |
| 3-4 | **Schedule integration** | Timeline view showing set build/strike dates. Gantt chart linked to floor plan elements. | Large |
| 3-5 | **Multi-floor / multi-stage** | Support multiple floors (mezzanine, second story) and multiple stages/locations in one project. | Medium |
| 3-6 | **Collaboration** | Real-time multi-user editing (WebSocket). Cursor positions and live changes visible to all connected users. | Large |

---

## Phase 2A/2B Data Model Extensions (for 3D)
| Field | Type | Phase | Purpose |
|-------|------|-------|---------|
| wallHeight | number | 2A | Visual wall height for 3D extrusion (default 10ft) |
| elevation | number | 2A | Height off floor for 3D placement |
| materialTexture | string | 2B | Surface texture/material reference |
| connectionPoints | array | 2B | 3D joining endpoints for flat-to-flat connections |

### Future Data Model Extensions (Phase 2C — when prop inventory exists)
| Field | Type | Purpose |
|-------|------|---------|
| propInventoryId | string | Link to prop inventory system |
| propImageUrl | string | Photo URL for prop rendering |
| prop3dModelUrl | string | .glb model URL for 3D scene |

---

## What's Next — Recommended Priority

### Immediate (can start now)
1. **Phase 2A-1 through 2A-4** — Get basic 3D working with wall extrusion and first-person walkthrough. This is the minimum viable 3D feature that transforms the tool from a 2D planner into a spatial design tool.

2. **Phase 2A-5 & 2A-6** — Add door/window openings and lighting to make the walkthrough feel real.

3. **Phase 2B** — Add materials and textures to make the 3D presentable for client meetings.

### After 3D is solid
4. **Phase 2D** — AI photorealistic renders (the endgame for pre-viz). Can be built on top of the 3D scene without needing the prop inventory.

### When prop inventory is built (separate project)
5. **Phase 2C** — Prop inventory integration. Blocked until the prop inventory app exists with an API. Once available, props can be placed on 2D plans and rendered in the 3D walkthrough.

---

## Deployment

```bash
# Build and deploy
git push origin main
scp -i ~/.claude/projects/keypairs/devkey.pem -r src server public package.json vite.config.js Dockerfile docker-compose.yml ubuntu@16.54.34.31:/opt/apps/floorplan-app/
ssh -i ~/.claude/projects/keypairs/devkey.pem ubuntu@16.54.34.31 "cd /opt/apps/floorplan-app && docker compose down && docker compose up -d --build"

# If seed data changed, delete DB first:
ssh -i ~/.claude/projects/keypairs/devkey.pem ubuntu@16.54.34.31 "rm -f /opt/apps/floorplan-app/data/floorplan.db"
```

## Film/TV Set Construction Reference

### Hollywood (Hard) Flats
- Frame: 1x3 lumber (3/4" x 2-1/2" actual) set on edge
- Covering: 1/8" or 1/4" luan plywood
- Standard widths: 1', 2', 3', 4' (4' most common)
- Standard heights: 8', 10', 12'
- Thickness: ~3.5" (frame depth on edge)
- Toggles (horizontal braces): every 2' to 2'6"

### Broadway (Soft) Flats
- Frame: 1x3 lumber laid flat
- Covering: Muslin or canvas, stapled every 6-8"
- Corner blocks: 1/4" plywood, 10"x10" triangles
- Keystones: 3-1/2" x 7" x 2-1/2" plywood connectors

### Standard Set Wall Types
- Single-sided flat: ~3.5" thick
- Double-sided flat: ~4" thick (luan both sides)
- Braced access wall: two single-sided flats with 2' gap for power/cable runs
