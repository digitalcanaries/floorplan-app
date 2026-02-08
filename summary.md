# Floor Plan Layout Tool — Project Summary

## Overview
A web-based film/TV set floor plan layout tool for designing stage layouts, placing architectural components, and planning set construction. Built for production designers and set decorators working on film, television, and stage productions.

**Live URL:** http://16.54.34.31:3080
**Repository:** digitalcanaries/floorplan-app

## Tech Stack
- **Frontend:** React 19 + Vite 7, Fabric.js v7.1 (canvas), Zustand (state), Tailwind CSS v4
- **Backend:** Express.js v5, better-sqlite3, JWT authentication
- **Deployment:** Docker multi-stage build on AWS Lightsail (Ubuntu 24.04)
- **PDF:** pdfjs-dist for PDF rendering + Tesseract.js for OCR dimension extraction

## Features

### Core Canvas
- Upload PDF floor plans as background images
- Calibrate scale by clicking two known points and entering real-world distance
- Rotate PDFs 90 degrees at a time
- Scroll to zoom, Ctrl+drag to pan
- Grid overlay with snap-to-grid
- Edge snapping with visual guide lines

### Sets
- Add individual sets with name, dimensions (width x height), colour, category
- Bulk import via paste list format ("Set Name - 23x27")
- OCR: Read measurements directly from PDF text/image layers
- Categories: Set, Wall, Window, Door, Furniture, Other
- Opacity control per set (10%-100%)
- Z-order layering (bring forward/send backward)
- Duplicate sets with auto-incrementing names
- Lock sets to PDF position (move with PDF)
- Hide/show sets, remove from plan, restore
- Cut-into feature: cut one set's shape out of another (L-shapes, notched polygons)
- Wall access gap zones with presets (1ft, 2ft, 4ft, 6ft)
- No-cut flag for walls/windows/doors

### Build Tab & Component Library
- Server-side SQLite database of ~40+ default architectural components
- Categories: Hollywood Flats, Double Flats, Braced Access Walls, Windows (single/multi-pane/picture), Doors (single/double/arch), Columns, Staircases
- Custom Flat Builder: Hollywood or Broadway style, single/double/braced construction, material estimates
- Custom Window Builder: 1-4 panes, configurable divider and surround widths, visual preview
- Custom Door Builder: single, double, or arch with swing direction
- Suggest Flats: auto-calculate flat combination for a set's perimeter walls
- Component icons render on canvas (window panes, door swing arcs, flat framing, braced wall gaps, column circles, stair treads)

### Labels & Callouts
- Global labels toggle showing name, dimensions, category, rotation
- Three display modes: On Sets (inline), Right Side callout, Left Side callout
- Callout mode: labels stacked along margin with colour-coded leader lines and arrowheads
- Per-set label position (9 positions: TL, T, TR, L, C, R, BL, B, BR)
- Per-set label toggle (show/hide individual labels)
- Bulk label position change via multi-select

### Multi-Select & Alignment
- Checkbox multi-select + Shift+click
- Bulk actions: change category, colour, no-cut flag, hide, remove, delete
- Alignment tools: left, right, top, bottom, centre horizontal, centre vertical
- Distribution: distribute horizontally/vertically with equal spacing
- Bulk label position

### Rules & Auto Layout
- Relationship rules: NEAR, CONNECT, SEPARATE, FIXED
- Auto layout using bin-packing with simulated annealing
- Respects FIXED rules and locked-to-PDF sets

### Save/Load
- Autosave to browser localStorage on every change
- Save/load to server (SQLite database)
- Save to browser with named saves
- Export/import as JSON files
- Export canvas as PNG screenshot
- Share projects with other users

### User Management
- JWT-based authentication
- Admin panel for user CRUD
- Password change with first-login forced change
- Project sharing between users

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
    store.js          — Main Zustand store (sets, rules, canvas state, save/load)
    engine/
      geometry.js     — AABB, overlap detection, cut polygons, label positioning
      componentIcons.js — Fabric.js icon rendering (windows, doors, flats, etc.)
      autoLayout.js   — Bin-packing + simulated annealing
    components/
      FloorCanvas.jsx — Main fabric.js canvas (rendering, interaction, snapping)
      Sidebar.jsx     — Resizable sidebar with Sets/Build/Rules tabs
      SetsTab.jsx     — Set list, add/edit forms, multi-select, alignment
      BuildTab.jsx    — Component library browser, suggest flats
      FlatBuilder.jsx — Custom flat/window/door creation modals
      RulesTab.jsx    — Rule management
      TopBar.jsx      — Toolbar (grid, snap, labels, save/load, layout)
      HelpGuide.jsx   — Searchable help guide with 13+ sections
      UserMenu.jsx    — User dropdown (help, password, admin, logout)
      ...
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
| category | string | Set/Wall/Window/Door/Furniture/Other |
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
| componentProperties | object | Panes, swing direction, etc. |

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

## Roadmap

### Phase 2 — 3D Visualization
- **Three.js:** Real-time interactive 3D walkthrough in-browser
  - Extrude each set by its thickness/height
  - First-person camera controls for set walkthroughs
  - Material textures on surfaces
- **AI Photorealistic Renders:** Export scene data for AI image generation
  - Photorealistic stills and video
  - Incorporate reference photos of existing sets
  - Prop/furniture placement from inventory

### Phase 2 Data Model Extensions
| Field | Purpose |
|-------|---------|
| elevation | Height off floor for 3D placement |
| materialTexture | Surface texture reference |
| connectionPoints | 3D joining endpoints for flat-to-flat connections |
| wallHeight | Visual wall height for 3D extrusion |

### Future Features
- Prop/furniture inventory integration
- Set construction drawings export (elevation views, cut lists)
- Cable/power run planning within braced access walls
- Cost estimation based on materials
- Timeline/schedule integration for set builds
- Multi-floor support
- Print-ready architectural drawings (scale rulers, title blocks)

## Deployment

```bash
# Build and deploy
git push origin main
scp -i ~/.claude/projects/keypairs/devkey.pem -r src server package.json vite.config.js Dockerfile docker-compose.yml ubuntu@16.54.34.31:/opt/apps/floorplan-app/
ssh -i ~/.claude/projects/keypairs/devkey.pem ubuntu@16.54.34.31 "cd /opt/apps/floorplan-app && docker compose down && docker compose up -d --build"
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
