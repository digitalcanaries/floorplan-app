import { useState } from 'react'

const sections = [
  {
    title: 'Getting Started',
    icon: '1',
    content: [
      {
        heading: 'Upload a Floor Plan',
        text: 'Click "Upload PDF Floor Plan" in the sidebar to load your floor plan PDF. The PDF renders on the canvas as a draggable background image.',
      },
      {
        heading: 'Calibrate Scale',
        text: 'Click "Calibrate Scale" in the toolbar, then click two points on the PDF that you know the real-world distance between. Enter the distance when prompted. This sets the pixels-per-unit ratio so sets draw at the correct size.',
      },
      {
        heading: 'Rotate PDF',
        text: 'Click "Rotate PDF" in the toolbar to rotate the floor plan 90 degrees at a time.',
      },
      {
        heading: 'Navigate the Canvas',
        text: 'Scroll to zoom in/out. Hold Ctrl (or Cmd on Mac) and drag to pan around the canvas.',
      },
    ],
  },
  {
    title: 'Adding Sets',
    icon: '2',
    content: [
      {
        heading: 'Add a Single Set',
        text: 'In the sidebar, select a category type (Set, Wall, Window, Door, Furniture, Other), enter the name and dimensions (width x height in your unit), pick a colour, and click "Add".',
      },
      {
        heading: 'Bulk Import (Paste List)',
        text: 'Click "Paste Set List" to open the bulk import area. Paste a list of sets in the format "Set Name - 23x27" (one per line). Click "Parse" to preview, then "Add All" to import them all at once.',
      },
      {
        heading: 'Read Measurements from PDF',
        text: 'If a PDF is loaded, click "Read Measurements from PDF" to extract dimension text from the PDF. It first tries the text layer, then falls back to OCR (optical character recognition) for image-only PDFs. Detected dimensions are shown for review before importing.',
      },
      {
        heading: 'Categories',
        text: 'Each item has a category type. When you select Wall, Window, or Door, the "No Cut" flag is automatically enabled and the access gap presets appear. Categories are shown as colour-coded badges in the set list and on the canvas.',
      },
    ],
  },
  {
    title: 'Working with Sets on the Canvas',
    icon: '3',
    content: [
      {
        heading: 'Moving Sets',
        text: 'Click and drag any unlocked set to reposition it on the canvas. Double-click a set to rotate it 90 degrees.',
      },
      {
        heading: 'Lock to PDF',
        text: 'Click the pin icon on a set (or use the per-set button in the sidebar) to lock it to the PDF position. When you drag the PDF, all locked sets move with it. Use "Lock All" / "Unlock All" above the set list to lock or unlock everything at once.',
      },
      {
        heading: 'Snapping',
        text: '"Snap" enables grid snapping when dragging sets. "Edge Snap" snaps set edges to nearby edges of other sets, showing cyan guide lines when an edge aligns.',
      },
      {
        heading: 'Grid',
        text: 'Toggle the grid overlay on/off with the "Grid" checkbox in the toolbar.',
      },
      {
        heading: 'Selection',
        text: 'Click a set on the canvas or in the sidebar to select it (highlighted with a white border). Click again to deselect.',
      },
    ],
  },
  {
    title: 'Set Properties & Actions',
    icon: '4',
    content: [
      {
        heading: 'Edit a Set',
        text: 'Click the pencil icon on any set in the sidebar to edit its name, dimensions, category, colour, opacity, wall gap, and no-cut setting.',
      },
      {
        heading: 'Opacity',
        text: 'Each set has an opacity slider (10%-100%). Lower values make sets semi-transparent, useful for windows and overlay elements.',
      },
      {
        heading: 'Wall Access Gap',
        text: 'For Wall, Window, and Door types, you can set an access gap distance. This renders a dashed amber outline around the set showing the required clearance. Presets: 1ft (back-to-back walls), 2ft (power access), 4ft (window/door lighting), 6ft (large lighting rig).',
      },
      {
        heading: 'No Cut Flag',
        text: 'The shield icon indicates a set cannot be cut into or used as a cutter. Enabled automatically for Wall/Window/Door categories. Toggle it per-set or in bulk via multi-select.',
      },
      {
        heading: 'Rotate',
        text: 'Click the rotate button or double-click the set on the canvas to rotate 90 degrees.',
      },
      {
        heading: 'Duplicate',
        text: 'Click the duplicate icon to create a copy of a set with an auto-incremented name suffix, e.g. "Kitchen (2)".',
      },
      {
        heading: 'Z-Order (Layering)',
        text: 'Use the up/down arrows on each set to control which sets render on top of others. Higher z-order = rendered on top.',
      },
    ],
  },
  {
    title: 'Labels & Visibility',
    icon: '5',
    content: [
      {
        heading: 'Global Labels Toggle',
        text: 'The "Labels" checkbox in the toolbar shows/hides all set labels on the canvas (name, dimensions, category badge, lock icon, rotation).',
      },
      {
        heading: 'Per-Set Label Toggle',
        text: 'Click the "Aa" button on any set in the sidebar to hide just that set\'s label while keeping others visible.',
      },
      {
        heading: 'Hide from Plan',
        text: 'Click the eye icon to hide a set from the canvas while keeping its position saved. Hidden sets appear in the "Hidden" section of the sidebar with a button to show them again.',
      },
      {
        heading: 'Remove from Plan',
        text: 'Click the down arrow to remove a set from the plan entirely (resets position). It moves to the "Off Plan" section and can be added back.',
      },
      {
        heading: 'Overlap Zones',
        text: 'Red dashed rectangles show where two sets overlap on the canvas. Toggle these with the "Overlaps" checkbox in the toolbar.',
      },
      {
        heading: 'Hover Tooltips',
        text: 'Hover over any set on the canvas to see a tooltip with its name, dimensions, category, access gap, and lock status.',
      },
    ],
  },
  {
    title: 'Cut-Into Feature',
    icon: '6',
    content: [
      {
        heading: 'Cutting One Set Into Another',
        text: 'Click the scissors icon on the "cutter" set in the sidebar. A picker appears showing all eligible target sets (those without the No Cut flag). Click a target to cut the cutter\'s shape out of the target, reshaping it into an L-shape or notched polygon.',
      },
      {
        heading: 'Restore Original Shape',
        text: 'Sets that have been cut show a "[cut]" indicator with a restore icon. Click it to undo all cuts and return to the full rectangle.',
      },
      {
        heading: 'Ghost Outline',
        text: 'When a set has been cut, a faint dashed outline shows the original full rectangle so you can see what was removed.',
      },
    ],
  },
  {
    title: 'Multi-Select & Bulk Actions',
    icon: '7',
    content: [
      {
        heading: 'Selecting Multiple Sets',
        text: 'Use the checkboxes on each set, or hold Shift and click to add/remove sets from the selection. Click "Select All" to select all visible sets.',
      },
      {
        heading: 'Bulk Actions Bar',
        text: 'When multiple sets are selected, a purple action bar appears with options to change category, colour, or No Cut flag for all selected sets at once. You can also bulk hide, remove from plan, or delete.',
      },
    ],
  },
  {
    title: 'Category Filtering',
    icon: '8',
    content: [
      {
        heading: 'Filter by Category',
        text: 'Above the set list, category filter tabs show counts for each type. Click a category to show only sets of that type. Click again or click "All" to clear the filter.',
      },
    ],
  },
  {
    title: 'Rules & Auto Layout',
    icon: '9',
    content: [
      {
        heading: 'Rules',
        text: 'Switch to the "Rules" tab in the sidebar to create relationship rules between sets. Rule types: NEAR (sets should be close, shown as green dashed line), CONNECT (sets should touch, blue solid line), SEPARATE (sets should be apart, red dashed line), FIXED (set stays in place during auto layout).',
      },
      {
        heading: 'Auto Layout',
        text: 'Click "Auto Layout" in the toolbar to automatically arrange sets using bin-packing with simulated annealing. It respects FIXED rules and locked-to-PDF sets. "Try Alternate" generates a different arrangement.',
      },
      {
        heading: 'Clear Layout',
        text: 'Click "Clear Layout" to reset all set positions to the default (100, 100).',
      },
    ],
  },
  {
    title: 'Saving & Loading',
    icon: '10',
    content: [
      {
        heading: 'Autosave',
        text: 'The app automatically saves to your browser\'s local storage on every change. The "Saved X ago" indicator in the toolbar shows when the last autosave occurred.',
      },
      {
        heading: 'Save to Server',
        text: 'Click "Save" to save the current project to the server. Use the dropdown arrow for "Save As New" to create a separate copy.',
      },
      {
        heading: 'Save to Browser',
        text: 'From the Save dropdown, choose "Save to Browser" for a named local save, or "Export to File" to download as a JSON file.',
      },
      {
        heading: 'Load',
        text: 'Click "Load" to see server projects and browser saves. Server projects show a share option on hover.',
      },
      {
        heading: 'Share Projects',
        text: 'Hover over a server project in the Load menu and enter a username to share a copy of the project with another user.',
      },
      {
        heading: 'Export PNG',
        text: 'Click "Export PNG" to download a screenshot of the current canvas as a PNG image.',
      },
    ],
  },
  {
    title: 'Resizable Sidebar',
    icon: '11',
    content: [
      {
        heading: 'Resize the Sidebar',
        text: 'Drag the thin bar on the right edge of the sidebar to make it wider or narrower. The width is remembered between sessions.',
      },
    ],
  },
  {
    title: 'Keyboard & Mouse Shortcuts',
    icon: 'KB',
    content: [
      {
        heading: 'Canvas Navigation',
        text: 'Scroll wheel: Zoom in/out. Ctrl+Drag: Pan the canvas.',
      },
      {
        heading: 'Set Interaction',
        text: 'Click: Select set. Double-click: Rotate 90 degrees. Drag: Move set.',
      },
      {
        heading: 'Multi-Select',
        text: 'Shift+Click: Add/remove from multi-selection.',
      },
    ],
  },
  {
    title: 'User Management (Admin)',
    icon: 'A',
    content: [
      {
        heading: 'Manage Users',
        text: 'Admin users can click their name in the top right, then "Manage Users" to create new users, reset passwords, or delete users.',
      },
      {
        heading: 'First Login',
        text: 'New users are prompted to change their password on first login.',
      },
    ],
  },
]

export default function HelpGuide({ onClose }) {
  const [activeSection, setActiveSection] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredSections = searchTerm.trim()
    ? sections.map(s => ({
        ...s,
        content: s.content.filter(c =>
          c.heading.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.text.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      })).filter(s => s.content.length > 0 || s.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : sections

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-[720px] max-h-[85vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">User Guide</h2>
            <p className="text-xs text-gray-400 mt-0.5">Film Set Floor Plan Layout Tool</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-700 shrink-0">
          <input
            type="text"
            placeholder="Search help topics..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setActiveSection(0) }}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <div className="w-48 border-r border-gray-700 overflow-y-auto shrink-0 bg-gray-850">
            {filteredSections.map((section, i) => (
              <button
                key={i}
                onClick={() => setActiveSection(i)}
                className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-l-2 ${
                  activeSection === i
                    ? 'bg-gray-700 text-white border-indigo-500'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50 border-transparent'
                }`}
              >
                <span className="inline-block w-5 text-[10px] text-gray-500 mr-1">{section.icon}</span>
                {section.title}
              </button>
            ))}
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {filteredSections.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No results found for "{searchTerm}"</p>
            ) : (
              <>
                <h3 className="text-base font-bold text-white mb-4">
                  {filteredSections[activeSection]?.title}
                </h3>
                <div className="flex flex-col gap-4">
                  {filteredSections[activeSection]?.content.map((item, j) => (
                    <div key={j}>
                      <h4 className="text-sm font-semibold text-indigo-300 mb-1">{item.heading}</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 shrink-0">
          <p className="text-[10px] text-gray-500 text-center">
            Hover over toolbar buttons and set icons for quick tooltips
          </p>
        </div>
      </div>
    </div>
  )
}
