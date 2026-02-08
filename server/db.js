import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'

const DATA_DIR = process.env.DATA_DIR || './data'
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'floorplan.db'))

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    is_admin INTEGER DEFAULT 0,
    must_change_password INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    shared_from TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

// Component types library
db.exec(`
  CREATE TABLE IF NOT EXISTS component_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    subcategory TEXT,
    name TEXT NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    thickness REAL DEFAULT 0.292,
    icon_type TEXT DEFAULT 'rect',
    properties TEXT,
    is_default INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );
`)

// Seed default components if none exist
const componentCount = db.prepare('SELECT COUNT(*) as cnt FROM component_types WHERE is_default = 1').get()
if (componentCount.cnt === 0) {
  const insertComp = db.prepare(`
    INSERT INTO component_types (category, subcategory, name, width, height, thickness, icon_type, properties, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `)

  const seedMany = db.transaction((components) => {
    for (const c of components) {
      insertComp.run(c.category, c.subcategory, c.name, c.width, c.height, c.thickness, c.icon_type, c.properties ? JSON.stringify(c.properties) : null)
    }
  })

  seedMany([
    // === FLATS — Hollywood (Hard) Flats ===
    // 1×3 lumber on edge, ⅛" luan plywood skin, ~3.5" thick
    // Standard widths: 1', 2', 3', 4' — Standard heights: 8', 10', 12'
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '1\'×8\' Flat', width: 1, height: 8, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '2\'×8\' Flat', width: 2, height: 8, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '3\'×8\' Flat', width: 3, height: 8, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '4\'×8\' Flat', width: 4, height: 8, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '1\'×10\' Flat', width: 1, height: 10, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '2\'×10\' Flat', width: 2, height: 10, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '3\'×10\' Flat', width: 3, height: 10, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '4\'×10\' Flat', width: 4, height: 10, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '1\'×12\' Flat', width: 1, height: 12, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '2\'×12\' Flat', width: 2, height: 12, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '3\'×12\' Flat', width: 3, height: 12, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },
    { category: 'Wall', subcategory: 'Hollywood Flat', name: '4\'×12\' Flat', width: 4, height: 12, thickness: 0.292, icon_type: 'flat', properties: { style: 'hollywood', sides: 'single' } },

    // Double-sided flats (luan both sides, ~4" thick)
    { category: 'Wall', subcategory: 'Double Flat', name: '4\'×8\' Double Flat', width: 4, height: 8, thickness: 0.333, icon_type: 'flat-double', properties: { style: 'hollywood', sides: 'double' } },
    { category: 'Wall', subcategory: 'Double Flat', name: '4\'×10\' Double Flat', width: 4, height: 10, thickness: 0.333, icon_type: 'flat-double', properties: { style: 'hollywood', sides: 'double' } },
    { category: 'Wall', subcategory: 'Double Flat', name: '4\'×12\' Double Flat', width: 4, height: 12, thickness: 0.333, icon_type: 'flat-double', properties: { style: 'hollywood', sides: 'double' } },

    // Braced access walls (two single flats with 2' gap for power/cables)
    { category: 'Wall', subcategory: 'Braced Access', name: '4\'×8\' Braced Access', width: 4, height: 8, thickness: 2.583, icon_type: 'flat-braced', properties: { style: 'braced', gap: 2, sides: 'double' } },
    { category: 'Wall', subcategory: 'Braced Access', name: '4\'×10\' Braced Access', width: 4, height: 10, thickness: 2.583, icon_type: 'flat-braced', properties: { style: 'braced', gap: 2, sides: 'double' } },
    { category: 'Wall', subcategory: 'Braced Access', name: '4\'×12\' Braced Access', width: 4, height: 12, thickness: 2.583, icon_type: 'flat-braced', properties: { style: 'braced', gap: 2, sides: 'double' } },

    // === WINDOWS ===
    // Standard window sizes with single pane — height is plan-view depth, elevationHeight stores face height
    { category: 'Window', subcategory: 'Single Pane', name: '2\'×3\' Window', width: 2, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 3 } },
    { category: 'Window', subcategory: 'Single Pane', name: '3\'×4\' Window', width: 3, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Single Pane', name: '4\'×4\' Window', width: 4, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Single Pane', name: '4\'×6\' Window', width: 4, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 6 } },
    { category: 'Window', subcategory: 'Single Pane', name: '6\'×4\' Window', width: 6, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Single Pane', name: '6\'×6\' Window', width: 6, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 6 } },

    // Multi-pane windows
    { category: 'Window', subcategory: 'Multi Pane', name: '6\' 2-Pane Window', width: 6, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 2, divider: 0.333, surround: 0.333, depth: 0.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Multi Pane', name: '8\' 2-Pane Window', width: 8, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 2, divider: 0.333, surround: 0.333, depth: 0.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Multi Pane', name: '8\' 2-Pane Tall', width: 8, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 2, divider: 0.333, surround: 0.333, depth: 0.5, elevationHeight: 6 } },
    { category: 'Window', subcategory: 'Multi Pane', name: '12\' 3-Pane Window', width: 12, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 3, divider: 0.333, surround: 0.333, depth: 0.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Multi Pane', name: '12\' 3-Pane Tall', width: 12, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 3, divider: 0.333, surround: 0.333, depth: 0.5, elevationHeight: 6 } },

    // Large picture windows
    { category: 'Window', subcategory: 'Picture Window', name: '8\'×8\' Picture', width: 8, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 8 } },
    { category: 'Window', subcategory: 'Picture Window', name: '12\'×8\' Picture', width: 12, height: 0.5, thickness: 0.292, icon_type: 'window', properties: { panes: 1, divider: 0, surround: 0.333, depth: 0.5, elevationHeight: 8 } },

    // Bay windows
    { category: 'Window', subcategory: 'Bay Window', name: '6\' 3-Section Bay', width: 6, height: 2, thickness: 0.292, icon_type: 'window-bay', properties: { panes: 3, baySections: 3, bayAngle: 30, depth: 2, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Bay Window', name: '8\' 3-Section Bay', width: 8, height: 2.5, thickness: 0.292, icon_type: 'window-bay', properties: { panes: 3, baySections: 3, bayAngle: 30, depth: 2.5, elevationHeight: 4 } },
    { category: 'Window', subcategory: 'Bay Window', name: '10\' 5-Section Bay', width: 10, height: 3, thickness: 0.292, icon_type: 'window-bay', properties: { panes: 5, baySections: 5, bayAngle: 45, depth: 3, elevationHeight: 5 } },
    { category: 'Window', subcategory: 'Bay Window', name: '12\' 5-Section Bay', width: 12, height: 3.5, thickness: 0.292, icon_type: 'window-bay', properties: { panes: 5, baySections: 5, bayAngle: 45, depth: 3.5, elevationHeight: 6 } },

    // === DOORS === height is plan-view depth, elevationHeight stores face height
    { category: 'Door', subcategory: 'Single Door', name: '3\'×7\' Door', width: 3, height: 0.333, thickness: 0.292, icon_type: 'door', properties: { style: 'single', swing: 'left', depth: 0.333, elevationHeight: 7 } },
    { category: 'Door', subcategory: 'Single Door', name: '3\'×8\' Door', width: 3, height: 0.333, thickness: 0.292, icon_type: 'door', properties: { style: 'single', swing: 'left', depth: 0.333, elevationHeight: 8 } },
    { category: 'Door', subcategory: 'Single Door', name: '3.5\'×8\' Door', width: 3.5, height: 0.333, thickness: 0.292, icon_type: 'door', properties: { style: 'single', swing: 'left', depth: 0.333, elevationHeight: 8 } },
    { category: 'Door', subcategory: 'Double Door', name: '6\'×8\' Double Door', width: 6, height: 0.333, thickness: 0.292, icon_type: 'door-double', properties: { style: 'double', swing: 'both', depth: 0.333, elevationHeight: 8 } },
    { category: 'Door', subcategory: 'Double Door', name: '8\'×8\' Double Door', width: 8, height: 0.333, thickness: 0.292, icon_type: 'door-double', properties: { style: 'double', swing: 'both', depth: 0.333, elevationHeight: 8 } },
    { category: 'Door', subcategory: 'Arch', name: '4\'×8\' Arch Door', width: 4, height: 0.333, thickness: 0.292, icon_type: 'door-arch', properties: { style: 'arch', depth: 0.333, elevationHeight: 8 } },
    { category: 'Door', subcategory: 'Arch', name: '6\'×10\' Arch Door', width: 6, height: 0.333, thickness: 0.292, icon_type: 'door-arch', properties: { style: 'arch', depth: 0.333, elevationHeight: 10 } },

    // === ARCHITECTURAL ===
    { category: 'Other', subcategory: 'Column', name: '1\'×1\' Column', width: 1, height: 1, thickness: 1, icon_type: 'column', properties: { shape: 'round' } },
    { category: 'Other', subcategory: 'Column', name: '1.5\'×1.5\' Column', width: 1.5, height: 1.5, thickness: 1.5, icon_type: 'column', properties: { shape: 'round' } },
    { category: 'Other', subcategory: 'Column', name: '2\'×2\' Column', width: 2, height: 2, thickness: 2, icon_type: 'column', properties: { shape: 'square' } },
    { category: 'Other', subcategory: 'Stair', name: '3\'×8\' Staircase', width: 3, height: 8, thickness: 0.75, icon_type: 'stair', properties: { treads: 12 } },
    { category: 'Other', subcategory: 'Stair', name: '4\'×10\' Staircase', width: 4, height: 10, thickness: 0.75, icon_type: 'stair', properties: { treads: 15 } },
  ])
  console.log('Default component types seeded')
}

// Seed admin user if none exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
if (!adminExists) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin'
  const hash = bcrypt.hashSync(adminPassword, 10)
  db.prepare(
    'INSERT INTO users (username, password, display_name, is_admin, must_change_password) VALUES (?, ?, ?, 1, 1)'
  ).run('admin', hash, 'Administrator')
  console.log('Admin user seeded (username: admin)')
}

export default db
