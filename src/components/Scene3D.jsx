import { useRef, useMemo, useState, useEffect, useCallback, createContext, useContext } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, Grid, Text, Environment } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store.js'

// Context to share OrbitControls ref + controlMode + lock state + R-key with draggable components
const DragContext = createContext({ orbitRef: null, controlMode: 'orbit', locked3D: false, rKeyRef: null })

// ─── Constants ───────────────────────────────────────────────────────
const DEFAULT_WALL_HEIGHT = 12  // feet (standard 4'×12' flat)
const DOOR_HEIGHT = 7            // feet (standard door opening)
const WINDOW_SILL_HEIGHT = 3     // feet off floor
const WINDOW_HEAD_HEIGHT = 7     // feet (top of window)
const EYE_HEIGHT = 5.5           // feet for first-person
const MOVE_SPEED = 0.3           // feet per frame
const LOOK_SPEED = 0.002

// Standard flat construction dimensions
const FLAT_PANEL_WIDTH = 4       // standard flat panel is 4' wide
const RAIL_HEIGHT = 2            // 2' standard rail (top + bottom)
const TIMBER_SIZE = 0.0625       // 1×3 actual is ~0.75" = 0.0625' (depth on flat)
const TIMBER_WIDTH = 0.208       // 1×3 actual is ~2.5" = 0.208' width
const LUAN_THICKNESS = 0.021     // ~1/4" luan

// ─── Building Wall 3D ────────────────────────────────────────────────
function BuildingWall3D({ wall, ppu, defaultWallHeight }) {
  const x1ft = wall.x1 / ppu
  const z1ft = wall.y1 / ppu
  const x2ft = wall.x2 / ppu
  const z2ft = wall.y2 / ppu

  const dx = x2ft - x1ft
  const dz = z2ft - z1ft
  const lengthFt = Math.sqrt(dx * dx + dz * dz)
  if (lengthFt < 0.1) return null

  const angle = Math.atan2(dz, dx) // rotation around Y axis
  const cx = (x1ft + x2ft) / 2
  const cz = (z1ft + z2ft) / 2
  const wallH = wall.height || defaultWallHeight
  const thickness = wall.thickness || 0.5

  return (
    <mesh
      position={[cx, wallH / 2, cz]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[lengthFt, wallH, thickness]} />
      <meshStandardMaterial color={wall.color || '#8B4513'} roughness={0.85} />
    </mesh>
  )
}

// ─── Coordinate helpers ──────────────────────────────────────────────
// 2D canvas: set.x, set.y are pixel positions (top-left corner of bounding box)
// 2D canvas: set.width, set.height are in feet
// 2D pixel footprint = width * ppu, height * ppu
// 3D world: X = right, Y = up, Z = into screen (matching 2D Y axis)
// Convert: center_x_feet = set.x / ppu + footprintW / 2
//          center_z_feet = set.y / ppu + footprintH / 2
// Rotation: 2D rotation is clockwise degrees, 3D Y rotation is counter-clockwise

function get3DPosition(set, ppu) {
  const rotDeg = ((set.rotation || 0) % 360 + 360) % 360
  const rad = rotDeg * Math.PI / 180
  const cosR = Math.cos(rad), sinR = Math.sin(rad)

  // Fabric.js (left, top) = rotation pivot = top-left of UNROTATED rect.
  // Unrotated center in local coords: (w/2, h/2) (in feet).
  // Fabric.js CW rotation in screen coords (y-down):
  //   cx = pivot_x + (w/2)*cos(θ) - (h/2)*sin(θ)
  //   cz = pivot_y + (w/2)*sin(θ) + (h/2)*cos(θ)
  const pivotX = set.x / ppu
  const pivotZ = set.y / ppu
  const hw = set.width / 2, hh = set.height / 2
  const cx = pivotX + hw * cosR - hh * sinR
  const cz = pivotZ + hw * sinR + hh * cosR

  // footprint dimensions (unrotated — the rect is w×h, rotation applied via rotY)
  const footprintW = set.width
  const footprintH = set.height

  // 3D Y rotation is negative because 2D CW maps to 3D CCW around Y-up
  const rotY = rotDeg ? -(rad) : 0
  return { cx, cz, rotY, footprintW, footprintH }
}

// ─── Flat Construction Frame (visible lumber) ────────────────────────
function FlatConstructionFrame({ widthFt, heightFt, depthFt, position, rotation, side, style }) {
  const railH = RAIL_HEIGHT
  const timberW = style === 'hollywood' ? 0.292 : 0.0625 // on edge vs flat
  const innerHeight = heightFt - railH * 2
  const toggleSpacing = 2.5
  const toggleCount = Math.max(0, Math.floor(innerHeight / toggleSpacing))
  const panelCount = Math.ceil(widthFt / FLAT_PANEL_WIDTH)

  const sideOffset = side === 'rear' ? -depthFt / 2 : depthFt / 2

  return (
    <group position={position} rotation={rotation}>
      {(() => {
        const timberColor = '#C4A35A'
        const luanColor = '#D2B48C'
        const frameDepth = timberW
        const elements = []

        // Bottom rail
        elements.push(
          <mesh key="rail-bottom" position={[0, railH / 2, sideOffset]} castShadow>
            <boxGeometry args={[widthFt, railH, frameDepth]} />
            <meshStandardMaterial color={timberColor} roughness={0.85} />
          </mesh>
        )

        // Top rail
        elements.push(
          <mesh key="rail-top" position={[0, heightFt - railH / 2, sideOffset]} castShadow>
            <boxGeometry args={[widthFt, railH, frameDepth]} />
            <meshStandardMaterial color={timberColor} roughness={0.85} />
          </mesh>
        )

        // Stiles
        elements.push(
          <mesh key="stile-left" position={[-widthFt / 2 + TIMBER_WIDTH / 2, heightFt / 2, sideOffset]} castShadow>
            <boxGeometry args={[TIMBER_WIDTH, heightFt, frameDepth]} />
            <meshStandardMaterial color={timberColor} roughness={0.85} />
          </mesh>
        )
        elements.push(
          <mesh key="stile-right" position={[widthFt / 2 - TIMBER_WIDTH / 2, heightFt / 2, sideOffset]} castShadow>
            <boxGeometry args={[TIMBER_WIDTH, heightFt, frameDepth]} />
            <meshStandardMaterial color={timberColor} roughness={0.85} />
          </mesh>
        )

        // Toggles
        for (let i = 1; i <= toggleCount; i++) {
          const ty = railH + (innerHeight / (toggleCount + 1)) * i
          elements.push(
            <mesh key={`toggle-${i}`} position={[0, ty, sideOffset]} castShadow>
              <boxGeometry args={[widthFt - TIMBER_WIDTH * 2, TIMBER_WIDTH, frameDepth]} />
              <meshStandardMaterial color={timberColor} roughness={0.85} />
            </mesh>
          )
        }

        // Panel join stiles
        for (let p = 1; p < panelCount; p++) {
          const px = -widthFt / 2 + p * FLAT_PANEL_WIDTH
          if (px > -widthFt / 2 + TIMBER_WIDTH && px < widthFt / 2 - TIMBER_WIDTH) {
            elements.push(
              <mesh key={`join-stile-${p}`} position={[px, heightFt / 2, sideOffset]} castShadow>
                <boxGeometry args={[TIMBER_WIDTH * 2, heightFt, frameDepth]} />
                <meshStandardMaterial color={timberColor} roughness={0.85} />
              </mesh>
            )
          }
        }

        // Luan skin
        const luanOffset = side === 'rear'
          ? sideOffset - frameDepth / 2 - LUAN_THICKNESS / 2
          : sideOffset + frameDepth / 2 + LUAN_THICKNESS / 2
        elements.push(
          <mesh key="luan-skin" position={[0, heightFt / 2, luanOffset]} receiveShadow>
            <boxGeometry args={[widthFt, heightFt, LUAN_THICKNESS]} />
            <meshStandardMaterial
              color={luanColor}
              roughness={0.7}
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        )

        return elements
      })()}
    </group>
  )
}

// ─── Door/Window 3D Mesh ─────────────────────────────────────────────
function DoorMesh3D({ set, ppu, defaultWallHeight }) {
  const { cx, cz, rotY } = get3DPosition(set, ppu)
  const elevation = set.elevation || 0
  const doorWidth = set.width
  const doorDepth = set.height  // plan-view depth (typically thin)
  const doorHeight = set.componentProperties?.elevationHeight || set.wallHeight || DOOR_HEIGHT

  // Door frame (dark wood outline)
  return (
    <group position={[cx, elevation, cz]} rotation={[0, rotY, 0]}>
      {/* Door frame */}
      <mesh position={[0, doorHeight / 2, 0]} castShadow>
        <boxGeometry args={[doorWidth, doorHeight, Math.max(doorDepth, 0.3)]} />
        <meshStandardMaterial color="#8B6914" roughness={0.7} transparent opacity={0.15} />
      </mesh>
      {/* Frame posts (left) */}
      <mesh position={[-doorWidth / 2, doorHeight / 2, 0]} castShadow>
        <boxGeometry args={[0.15, doorHeight, Math.max(doorDepth, 0.3)]} />
        <meshStandardMaterial color="#654321" roughness={0.6} />
      </mesh>
      {/* Frame posts (right) */}
      <mesh position={[doorWidth / 2, doorHeight / 2, 0]} castShadow>
        <boxGeometry args={[0.15, doorHeight, Math.max(doorDepth, 0.3)]} />
        <meshStandardMaterial color="#654321" roughness={0.6} />
      </mesh>
      {/* Header */}
      <mesh position={[0, doorHeight, 0]} castShadow>
        <boxGeometry args={[doorWidth + 0.3, 0.25, Math.max(doorDepth, 0.3)]} />
        <meshStandardMaterial color="#654321" roughness={0.6} />
      </mesh>
      {/* Threshold line on floor */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[doorWidth, 0.04, Math.max(doorDepth, 0.3)]} />
        <meshStandardMaterial color="#555555" roughness={0.9} />
      </mesh>
    </group>
  )
}

function WindowMesh3D({ set, ppu, defaultWallHeight }) {
  const { cx, cz, rotY } = get3DPosition(set, ppu)
  const elevation = set.elevation || 0
  const winWidth = set.width
  const winDepth = set.height  // plan-view depth
  // Use actual elevation height from component properties, falling back to defaults
  const elevH = set.componentProperties?.elevationHeight
  const sillHeight = elevH ? Math.max(WINDOW_SILL_HEIGHT, 0) : WINDOW_SILL_HEIGHT
  const headHeight = elevH ? (sillHeight + elevH) : WINDOW_HEAD_HEIGHT
  const winHeight = headHeight - sillHeight

  return (
    <group position={[cx, elevation, cz]} rotation={[0, rotY, 0]}>
      {/* Glass pane */}
      <mesh position={[0, (sillHeight + headHeight) / 2, 0]}>
        <boxGeometry args={[winWidth, winHeight, 0.05]} />
        <meshStandardMaterial
          color="#88CCEE"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Frame - left */}
      <mesh position={[-winWidth / 2, (sillHeight + headHeight) / 2, 0]} castShadow>
        <boxGeometry args={[0.12, winHeight + 0.2, Math.max(winDepth, 0.25)]} />
        <meshStandardMaterial color="#D4D4D4" roughness={0.5} />
      </mesh>
      {/* Frame - right */}
      <mesh position={[winWidth / 2, (sillHeight + headHeight) / 2, 0]} castShadow>
        <boxGeometry args={[0.12, winHeight + 0.2, Math.max(winDepth, 0.25)]} />
        <meshStandardMaterial color="#D4D4D4" roughness={0.5} />
      </mesh>
      {/* Frame - top */}
      <mesh position={[0, headHeight + 0.06, 0]} castShadow>
        <boxGeometry args={[winWidth + 0.24, 0.12, Math.max(winDepth, 0.25)]} />
        <meshStandardMaterial color="#D4D4D4" roughness={0.5} />
      </mesh>
      {/* Frame - sill */}
      <mesh position={[0, sillHeight - 0.06, 0]} castShadow>
        <boxGeometry args={[winWidth + 0.24, 0.12, Math.max(winDepth, 0.35)]} />
        <meshStandardMaterial color="#D4D4D4" roughness={0.5} />
      </mesh>
      {/* Sill wall below window */}
      {sillHeight > 0.01 && (
        <mesh position={[0, sillHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[winWidth, sillHeight, Math.max(winDepth, 0.25)]} />
          <meshStandardMaterial color="#E8E0D8" roughness={0.8} />
        </mesh>
      )}
    </group>
  )
}

// ─── Wall Mesh ─────────────────────────────────────────────────────
function WallMesh({ set, ppu, allSets, renderMode, defaultWallHeight }) {
  // Handle legacy wall data where set.height = elevation height (e.g. 8, 10, 12)
  // instead of plan-view depth/thickness (e.g. 0.292). Detect by checking if
  // height >> thickness — real plan-view depth should be near the thickness value.
  const thickness = set.thickness || 0.292
  const isLegacyHeight = set.height > thickness * 3
  const widthFt = set.width
  const depthFt = isLegacyHeight ? thickness : set.height
  const wallHeight = set.wallHeight || (isLegacyHeight ? set.height : null) || defaultWallHeight || DEFAULT_WALL_HEIGHT

  // General trig-based position (same as get3DPosition but with corrected depthFt for legacy)
  const rotDeg = ((set.rotation || 0) % 360 + 360) % 360
  const rad = rotDeg * Math.PI / 180
  const cosR = Math.cos(rad), sinR = Math.sin(rad)
  const pivotX = set.x / ppu, pivotZ = set.y / ppu
  const cx = pivotX + (widthFt / 2) * cosR - (depthFt / 2) * sinR
  const cz = pivotZ + (widthFt / 2) * sinR + (depthFt / 2) * cosR
  const rotY = rotDeg ? -rad : 0

  // Find doors/windows that overlap this wall to cut openings (AABB overlap test)
  const openings = useMemo(() => {
    // Compute AABB for this wall
    const corners = [[0,0],[widthFt,0],[widthFt,depthFt],[0,depthFt]]
    let wMinX = Infinity, wMinZ = Infinity, wMaxX = -Infinity, wMaxZ = -Infinity
    for (const [lx, lz] of corners) {
      const wx = pivotX + lx * cosR - lz * sinR
      const wz = pivotZ + lx * sinR + lz * cosR
      wMinX = Math.min(wMinX, wx); wMaxX = Math.max(wMaxX, wx)
      wMinZ = Math.min(wMinZ, wz); wMaxZ = Math.max(wMaxZ, wz)
    }
    return allSets.filter(s => {
      if (s.id === set.id) return false
      if (s.category !== 'Door' && s.category !== 'Window') return false
      if (s.onPlan === false || s.hidden) return false
      const sPos = get3DPosition(s, ppu)
      const sx1 = sPos.cx - sPos.footprintW / 2, sy1 = sPos.cz - sPos.footprintH / 2
      const sx2 = sPos.cx + sPos.footprintW / 2, sy2 = sPos.cz + sPos.footprintH / 2
      return sx1 < wMaxX && sx2 > wMinX && sy1 < wMaxZ && sy2 > wMinZ
    })
  }, [allSets, set, ppu, widthFt, depthFt])

  // Wall colour
  const wallColor = useMemo(() => {
    if (set.materialTexture === 'brick') return '#8B4513'
    if (set.materialTexture === 'concrete') return '#999999'
    if (set.materialTexture === 'greenscreen') return '#00CC00'
    if (set.materialTexture === 'wood') return '#DEB887'
    return '#E8E0D8'
  }, [set.materialTexture])

  const isConstructionView = renderMode === 'construction-front' || renderMode === 'construction-rear'
  const constructionSide = renderMode === 'construction-rear' ? 'rear' : 'front'
  const flatStyle = set.componentProperties?.style || 'hollywood'

  if (isConstructionView && (set.iconType === 'flat' || set.iconType === 'flat-double' || set.iconType === 'flat-braced' || set.category === 'Wall')) {
    return (
      <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
        <FlatConstructionFrame
          widthFt={widthFt}
          heightFt={wallHeight}
          depthFt={depthFt}
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          side={constructionSide}
          style={flatStyle}
        />
      </group>
    )
  }

  if (openings.length === 0) {
    return (
      <mesh position={[cx, wallHeight / 2, cz]} rotation={[0, rotY, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthFt, wallHeight, depthFt]} />
        <meshStandardMaterial color={wallColor} roughness={0.8} />
      </mesh>
    )
  }

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      <WallWithOpenings
        widthFt={widthFt}
        depthFt={depthFt}
        wallHeight={wallHeight}
        openings={openings}
        wallSet={set}
        ppu={ppu}
        wallColor={wallColor}
      />
    </group>
  )
}

function WallWithOpenings({ widthFt, depthFt, wallHeight, openings, wallSet, ppu, wallColor }) {
  const segments = useMemo(() => {
    const wallFeetX = wallSet.x / ppu
    const wallFeetW = widthFt // use corrected width, not raw set.width/height
    const segs = []

    // Sort openings by their x position relative to wall left edge (in feet)
    const sorted = openings
      .map(o => {
        const isRotO = (o.rotation || 0) % 180 !== 0
        const oFeetX = o.x / ppu
        const oFeetW = isRotO ? o.height : o.width
        // Offset from wall's left edge
        const ox = oFeetX - wallFeetX
        const isDoor = o.category === 'Door'
        const elevH = o.componentProperties?.elevationHeight
        const sillH = isDoor ? 0 : WINDOW_SILL_HEIGHT
        const headH = isDoor
          ? (elevH || o.wallHeight || DOOR_HEIGHT)
          : (elevH ? (sillH + elevH) : WINDOW_HEAD_HEIGHT)
        return { ox, ow: oFeetW, sillH, headH, isDoor }
      })
      .sort((a, b) => a.ox - b.ox)

    let cursor = 0

    for (const op of sorted) {
      const openLeft = op.ox
      const openRight = openLeft + op.ow

      // Segment before opening (full height)
      if (openLeft > cursor + 0.01) {
        const segW = openLeft - cursor
        segs.push({
          x: -wallFeetW / 2 + cursor + segW / 2,
          y: wallHeight / 2,
          w: segW,
          h: wallHeight,
        })
      }

      // Above the opening
      if (op.headH < wallHeight - 0.01) {
        const aboveH = wallHeight - op.headH
        segs.push({
          x: -wallFeetW / 2 + openLeft + op.ow / 2,
          y: op.headH + aboveH / 2,
          w: op.ow,
          h: aboveH,
        })
      }

      // Below window (sill)
      if (op.sillH > 0.01) {
        segs.push({
          x: -wallFeetW / 2 + openLeft + op.ow / 2,
          y: op.sillH / 2,
          w: op.ow,
          h: op.sillH,
        })
      }

      cursor = openRight
    }

    // Final segment after last opening
    if (cursor < wallFeetW - 0.01) {
      const segW = wallFeetW - cursor
      segs.push({
        x: -wallFeetW / 2 + cursor + segW / 2,
        y: wallHeight / 2,
        w: segW,
        h: wallHeight,
      })
    }

    return segs
  }, [widthFt, depthFt, wallHeight, openings, wallSet, ppu])

  return (
    <>
      {segments.map((seg, i) => (
        <mesh key={i} position={[seg.x, seg.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[seg.w, seg.h, depthFt]} />
          <meshStandardMaterial color={wallColor} roughness={0.8} />
        </mesh>
      ))}
      {/* Glass panes for windows */}
      {openings.filter(o => o.category === 'Window').map((o, i) => {
        const wallFeetX = wallSet.x / ppu
        const wallFeetW = widthFt // use corrected width
        const isRotO = (o.rotation || 0) % 180 !== 0
        const oFeetX = o.x / ppu
        const oFeetW = isRotO ? o.height : o.width
        const ox = oFeetX - wallFeetX
        const glassX = -wallFeetW / 2 + ox + oFeetW / 2
        const elevH = o.componentProperties?.elevationHeight
        const sillH = WINDOW_SILL_HEIGHT
        const headH = elevH ? (sillH + elevH) : WINDOW_HEAD_HEIGHT
        const midY = (sillH + headH) / 2
        return (
          <mesh key={`glass-${i}`} position={[glassX, midY, 0]}>
            <planeGeometry args={[oFeetW, headH - sillH]} />
            <meshStandardMaterial
              color="#88CCEE"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
    </>
  )
}

// ─── Special Set Mesh (columns, stairs, furniture) ───────────────────────
function SpecialSetMesh({ set, ppu, defaultWallHeight }) {
  const { cx, cz, rotY } = get3DPosition(set, ppu)
  const elevation = set.elevation || 0

  const color = useMemo(() => {
    if (set.color && set.color !== '#ffffff') return set.color
    return '#CCCCCC'
  }, [set.color])

  if (set.category === 'Column') {
    const radius = Math.min(set.width, set.height) / 2
    const colHeight = set.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT
    return (
      <mesh position={[cx, colHeight / 2 + elevation, cz]} rotation={[0, rotY, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, colHeight, 16]} />
        <meshStandardMaterial color="#808080" roughness={0.6} />
      </mesh>
    )
  }

  if (set.category === 'Stair') {
    const steps = 12
    const stepH = (set.wallHeight || 10) / steps
    return (
      <group position={[cx, elevation, cz]} rotation={[0, rotY, 0]}>
        {Array.from({ length: steps }, (_, i) => (
          <mesh key={i}
            position={[0, stepH * i + stepH / 2, (i - steps / 2) * (set.height / steps)]}
            castShadow
          >
            <boxGeometry args={[set.width, stepH, set.height / steps]} />
            <meshStandardMaterial color="#909090" roughness={0.7} />
          </mesh>
        ))}
      </group>
    )
  }

  // Furniture / Other — low solid box
  const furnHeight = set.wallHeight || 3
  return (
    <mesh position={[cx, furnHeight / 2 + elevation, cz]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={[set.width, furnHeight, set.height]} />
      <meshStandardMaterial
        color={color}
        transparent={set.opacity < 1}
        opacity={Math.max(set.opacity || 1, 0.5)}
        roughness={0.7}
      />
    </mesh>
  )
}

// ─── Selection Highlight ────────────────────────────────────────────
function SelectionHighlight({ set, ppu, defaultWallHeight }) {
  const { cx, cz, rotY, footprintW, footprintH } = get3DPosition(set, ppu)
  const elevation = set.elevation || 0
  const h = set.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT
  return (
    <mesh position={[cx, h / 2 + elevation, cz]} rotation={[0, rotY, 0]}>
      <boxGeometry args={[footprintW + 0.3, h + 0.3, footprintH + 0.3]} />
      <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.5} />
    </mesh>
  )
}

// ─── Draggable Set Group ────────────────────────────────────────────
// Wraps 3D children in a group that can be clicked (select) and dragged (reposition).
// Supports 3 drag modes:
//   Plain drag     = move on XZ ground plane (existing behavior)
//   Shift + drag   = raise/lower (Y-axis elevation)
//   R + drag       = rotate around Y-axis (snaps to 90° on release)
function DraggableSetGroup({ set, ppu, children, defaultWallHeight }) {
  const selectedSetId = useStore(s => s.selectedSetId)
  const setSelectedSetId = useStore(s => s.setSelectedSetId)
  const updateSet = useStore(s => s.updateSet)
  const isSelected = selectedSetId === set.id

  const groupRef = useRef()
  const dragState = useRef(null)
  const [dragOffset, setDragOffset] = useState([0, 0, 0])  // [dx, dy, dz] visual offset
  const [dragRotation, setDragRotation] = useState(0)        // visual rotation offset (radians)
  const [dragLabel, setDragLabel] = useState(null)            // { mode, value } for HUD overlay
  const { camera, gl, size } = useThree()
  const { orbitRef, controlMode, locked3D, rKeyRef } = useContext(DragContext)

  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const getHitPoint = useCallback((e) => {
    const rect = gl.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(mouse, camera)
    const hit = new THREE.Vector3()
    raycaster.ray.intersectPlane(groundPlane, hit)
    return hit
  }, [camera, gl, raycaster, groundPlane])

  const onPointerDown = useCallback((e) => {
    if (controlMode !== 'orbit') return
    e.stopPropagation()
    setSelectedSetId(set.id)

    // If locked, only select — don't allow dragging
    if (locked3D) return

    // Determine drag mode from modifier keys
    let dragMode = 'move'
    if (e.shiftKey) {
      dragMode = 'elevate'
    } else if (rKeyRef?.current) {
      dragMode = 'rotate'
    }

    const hit = getHitPoint(e)
    if (!hit) return

    const { cx, cz } = get3DPosition(set, ppu)
    dragState.current = {
      dragMode,
      startHit: hit.clone(),
      startCx: cx,
      startCz: cz,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startElevation: set.elevation || 0,
      startRotation: set.rotation || 0,
    }
    setDragOffset([0, 0, 0])
    setDragRotation(0)
    setDragLabel(null)

    if (orbitRef?.current) orbitRef.current.enabled = false

    const onMove = (moveEvt) => {
      if (!dragState.current) return
      const ds = dragState.current

      if (ds.dragMode === 'move') {
        // XZ ground plane movement
        const currentHit = getHitPoint(moveEvt)
        if (!currentHit) return
        const dx = currentHit.x - ds.startHit.x
        const dz = currentHit.z - ds.startHit.z
        setDragOffset([dx, 0, dz])
      } else if (ds.dragMode === 'elevate') {
        // Y-axis elevation: mouse Y delta → feet (moving mouse UP = raise)
        const deltaPixels = ds.startClientY - moveEvt.clientY  // inverted: up = positive
        const deltaFeet = deltaPixels / 30  // ~30px per foot
        setDragOffset([0, deltaFeet, 0])
        setDragLabel({ mode: 'elevate', value: ds.startElevation + deltaFeet })
      } else if (ds.dragMode === 'rotate') {
        // Y-axis rotation: mouse X delta → degrees (moving mouse RIGHT = clockwise)
        const deltaPixels = moveEvt.clientX - ds.startClientX
        const deltaDegrees = deltaPixels * 0.5  // ~0.5 degree per pixel for smooth feedback
        const currentDeg = ds.startRotation + deltaDegrees
        const rotRad = -(deltaDegrees * Math.PI / 180)
        setDragRotation(rotRad)
        // Show snapped value in label
        const snapped = ((Math.round(currentDeg / 90) * 90) % 360 + 360) % 360
        setDragLabel({ mode: 'rotate', value: snapped })
      }
    }

    const onUp = (upEvt) => {
      if (dragState.current) {
        const ds = dragState.current

        if (ds.dragMode === 'move') {
          const currentHit = getHitPoint(upEvt)
          if (currentHit) {
            const dx = currentHit.x - ds.startHit.x
            const dz = currentHit.z - ds.startHit.z
            if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
              const newPixelX = set.x + dx * ppu
              const newPixelY = set.y + dz * ppu
              updateSet(set.id, { x: newPixelX, y: newPixelY })
            }
          }
        } else if (ds.dragMode === 'elevate') {
          const deltaPixels = ds.startClientY - upEvt.clientY
          const deltaFeet = deltaPixels / 30
          if (Math.abs(deltaFeet) > 0.05) {
            const newElev = Math.max(0, ds.startElevation + deltaFeet)  // floor at 0
            updateSet(set.id, { elevation: newElev })
          }
        } else if (ds.dragMode === 'rotate') {
          const deltaPixels = upEvt.clientX - ds.startClientX
          const deltaDegrees = deltaPixels * 0.5
          const currentDeg = ds.startRotation + deltaDegrees
          // Snap to nearest 90°
          const snapped = ((Math.round(currentDeg / 90) * 90) % 360 + 360) % 360
          if (snapped !== ds.startRotation) {
            updateSet(set.id, { rotation: snapped })
          }
        }

        dragState.current = null
        setDragOffset([0, 0, 0])
        setDragRotation(0)
        setDragLabel(null)
      }
      if (orbitRef?.current) orbitRef.current.enabled = true
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
    }

    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
  }, [controlMode, locked3D, set, ppu, getHitPoint, orbitRef, rKeyRef, gl, setSelectedSetId, updateSet])

  return (
    <group
      ref={groupRef}
      position={dragOffset}
      rotation={dragRotation ? [0, dragRotation, 0] : undefined}
      onPointerDown={onPointerDown}
    >
      {children}
      {isSelected && <SelectionHighlight set={set} ppu={ppu} defaultWallHeight={defaultWallHeight} />}
      {/* Drag mode HUD label */}
      {dragLabel && (
        <Text
          position={[0, (set.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT) + 2, 0]}
          fontSize={1.2}
          color={dragLabel.mode === 'elevate' ? '#00ff88' : '#ff8800'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.06}
          outlineColor="#000000"
        >
          {dragLabel.mode === 'elevate'
            ? `↕ Elevation: ${dragLabel.value.toFixed(1)} ft`
            : `↻ Rotation: ${dragLabel.value}°`
          }
        </Text>
      )}
    </group>
  )
}

// ─── Set Rooms: hollow rooms with door/window openings ──────────────────────
// Each room = 4 walls forming a hollow rectangle.
// For each wall edge we:
//   1. Detect doors/windows sitting on that edge and cut openings
//   2. Deduplicate: if another room (with lower array index) shares the same
//      edge position AND overlaps on the range axis, skip that overlap portion
//      so we don't get double-thickness walls. The lower-index room "owns" it.
function SetRoomWalls({ roomSets, doorSets, windowSets, ppu, defaultWallHeight }) {
  const WALL_T = 0.292
  const EDGE_TOL = 0.5 // feet — tolerance for edge coincidence (dedup only)
  const OPEN_TOL = 1.0  // feet — tolerance for door/window proximity to wall edge

  const roomGroups = useMemo(() => {
    // Helper: compute center position and rotation using general trig
    function getRoomCenter(s) {
      const pos = get3DPosition(s, ppu)
      return pos  // { cx, cz, rotY, footprintW, footprintH }
    }

    // Helper: compute axis-aligned bounding box (for dedup/overlap on cardinal rotations)
    function getAABB(s) {
      const rotDeg = ((s.rotation || 0) % 360 + 360) % 360
      const rad = rotDeg * Math.PI / 180
      const cosR = Math.cos(rad), sinR = Math.sin(rad)
      const px = s.x / ppu, pz = s.y / ppu
      // 4 corners of unrotated rect in local coords relative to pivot
      const corners = [
        [0, 0], [s.width, 0], [s.width, s.height], [0, s.height]
      ]
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
      for (const [lx, lz] of corners) {
        const wx = px + lx * cosR - lz * sinR
        const wz = pz + lx * sinR + lz * cosR
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx)
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz)
      }
      return { x1: minX, z1: minZ, x2: maxX, z2: maxZ, fw: maxX - minX, fh: maxZ - minZ }
    }

    // Pre-compute for all rooms
    const boxes = roomSets.map(s => {
      const center = getRoomCenter(s)
      const aabb = getAABB(s)
      return { s, ...center, aabb }
    })

    // Pre-compute door/window bounding boxes (axis-aligned) for opening detection
    const openingBoxes = [...doorSets, ...windowSets].map(o => {
      const aabb = getAABB(o)
      return { o, ...aabb, isDoor: o.category === 'Door' }
    })

    // Helper: subtract intervals from a range, returning remaining segments
    function subtractIntervals(rangeMin, rangeMax, intervals) {
      if (intervals.length === 0) return [{ min: rangeMin, max: rangeMax }]
      const sorted = [...intervals].sort((a, b) => a.min - b.min)
      const merged = []
      for (const iv of sorted) {
        if (merged.length > 0 && iv.min <= merged[merged.length - 1].max + 0.01) {
          merged[merged.length - 1].max = Math.max(merged[merged.length - 1].max, iv.max)
        } else {
          merged.push({ min: iv.min, max: iv.max })
        }
      }
      const result = []
      let cursor = rangeMin
      for (const m of merged) {
        const clampMin = Math.max(m.min, rangeMin)
        const clampMax = Math.min(m.max, rangeMax)
        if (clampMin >= clampMax) continue
        if (clampMin > cursor + 0.05) result.push({ min: cursor, max: clampMin })
        cursor = Math.max(cursor, clampMax)
      }
      if (cursor < rangeMax - 0.05) result.push({ min: cursor, max: rangeMax })
      return result
    }

    // Group segments and floors by room (setId)
    const roomGroups = {}

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const wh = b.s.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT
      const color = (b.s.color && b.s.color !== '#ffffff') ? b.s.color : '#E8E0D8'
      const rotDeg = ((b.s.rotation || 0) % 360 + 360) % 360
      const isCardinal = rotDeg === 0 || rotDeg === 90 || rotDeg === 180 || rotDeg === 270

      // Room center and rotation from get3DPosition
      roomGroups[b.s.id] = {
        set: b.s,
        segments: [],   // local-space segments (relative to room center, unrotated)
        floor: { cx: b.cx, cz: b.cz, w: b.footprintW, d: b.footprintH, color },
        rotY: b.rotY,
      }

      // Walls are defined in LOCAL coordinates (unrotated, centered on room center).
      // Local edges: top = -h/2, bottom = +h/2, left = -w/2, right = +w/2
      const hw = b.s.width / 2, hh = b.s.height / 2
      // 4 edges in local space: dir='h' runs along local X, dir='v' runs along local Z
      const edges = [
        { dir: 'h', fixedVal: -hh, rMin: -hw, rMax: hw },  // top (logical top of unrotated rect)
        { dir: 'h', fixedVal:  hh, rMin: -hw, rMax: hw },  // bottom
        { dir: 'v', fixedVal: -hw, rMin: -hh, rMax: hh },  // left
        { dir: 'v', fixedVal:  hw, rMin: -hh, rMax: hh },  // right
      ]
      const sideNames = ['top', 'bottom', 'left', 'right']  // logical side names (unrotated)
      const removedWalls = b.s.removedWalls || {}
      const hiddenWalls = b.s.hiddenWalls || {}
      const wallExtensions = b.s.wallExtensions || {}

      for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
        const edge = { ...edges[edgeIdx] }  // clone since we may modify range
        const sideName = sideNames[edgeIdx]

        if (removedWalls[sideName]) continue
        const isHidden = hiddenWalls[sideName]

        const ext = wallExtensions[sideName] || 0
        if (ext > 0) { edge.rMin -= ext; edge.rMax += ext }

        // For cardinal rotations, apply dedup/overlap clipping in world space
        // For non-cardinal, skip clipping (matches 2D behavior)
        let ownedRanges = [{ min: edge.rMin, max: edge.rMax }]
        if (isCardinal) {
          // Transform edge to world space for clipping
          const cosR = Math.cos(-b.rotY), sinR = Math.sin(-b.rotY)
          // Transform local fixed point to world for edge matching
          let worldFixed, worldRMin, worldRMax, worldDir
          if (edge.dir === 'h') {
            // local point (0, fixedVal) in room center space
            const wx = b.cx + 0 * cosR - edge.fixedVal * sinR
            const wz = b.cz + 0 * sinR + edge.fixedVal * cosR
            if (Math.abs(sinR) < 0.01) {
              // ~0° or ~180°: horizontal edge stays horizontal in world
              worldDir = 'h'; worldFixed = wz
              worldRMin = b.cx + edge.rMin * cosR
              worldRMax = b.cx + edge.rMax * cosR
              if (worldRMin > worldRMax) { const t = worldRMin; worldRMin = worldRMax; worldRMax = t }
            } else {
              // ~90° or ~270°: horizontal edge becomes vertical in world
              worldDir = 'v'; worldFixed = wx
              worldRMin = b.cz + edge.rMin * sinR
              worldRMax = b.cz + edge.rMax * sinR
              if (worldRMin > worldRMax) { const t = worldRMin; worldRMin = worldRMax; worldRMax = t }
            }
          } else {
            const wx = b.cx + edge.fixedVal * cosR - 0 * sinR
            const wz = b.cz + edge.fixedVal * sinR + 0 * cosR
            if (Math.abs(cosR) < 0.01) {
              // ~90° or ~270°: vertical edge becomes horizontal in world
              worldDir = 'h'; worldFixed = wz
              worldRMin = b.cx - edge.rMax * sinR
              worldRMax = b.cx - edge.rMin * sinR
              if (worldRMin > worldRMax) { const t = worldRMin; worldRMin = worldRMax; worldRMax = t }
            } else {
              // ~0° or ~180°: vertical edge stays vertical in world
              worldDir = 'v'; worldFixed = wx
              worldRMin = b.cz + edge.rMin * cosR
              worldRMax = b.cz + edge.rMax * cosR
              if (worldRMin > worldRMax) { const t = worldRMin; worldRMin = worldRMax; worldRMax = t }
            }
          }

          // Dedup: lower-index rooms sharing this world edge
          const clipIntervals = []
          for (let j = 0; j < i; j++) {
            const other = boxes[j].aabb
            let matchesEdge = false
            if (worldDir === 'h') {
              matchesEdge = Math.abs(other.z1 - worldFixed) < EDGE_TOL || Math.abs(other.z2 - worldFixed) < EDGE_TOL
            } else {
              matchesEdge = Math.abs(other.x1 - worldFixed) < EDGE_TOL || Math.abs(other.x2 - worldFixed) < EDGE_TOL
            }
            if (matchesEdge) {
              const oMin = worldDir === 'h' ? other.x1 : other.z1
              const oMax = worldDir === 'h' ? other.x2 : other.z2
              const overlapMin = Math.max(worldRMin, oMin)
              const overlapMax = Math.min(worldRMax, oMax)
              if (overlapMax > overlapMin + 0.05) clipIntervals.push({ min: overlapMin, max: overlapMax })
            }
          }

          // Overlap: rooms whose interior contains this edge
          for (let j = 0; j < boxes.length; j++) {
            if (j === i) continue
            const other = boxes[j].aabb
            if (worldDir === 'h') {
              if (worldFixed > other.z1 + EDGE_TOL && worldFixed < other.z2 - EDGE_TOL) {
                const oMin = Math.max(worldRMin, other.x1)
                const oMax = Math.min(worldRMax, other.x2)
                if (oMax > oMin + 0.05) clipIntervals.push({ min: oMin, max: oMax })
              }
            } else {
              if (worldFixed > other.x1 + EDGE_TOL && worldFixed < other.x2 - EDGE_TOL) {
                const oMin = Math.max(worldRMin, other.z1)
                const oMax = Math.min(worldRMax, other.z2)
                if (oMax > oMin + 0.05) clipIntervals.push({ min: oMin, max: oMax })
              }
            }
          }

          if (clipIntervals.length > 0) {
            // Subtract in world space, then convert back to local range
            const worldRanges = subtractIntervals(worldRMin, worldRMax, clipIntervals)
            // Convert world ranges back to local ranges
            const localScale = (worldRMax - worldRMin) > 0.01 ? (edge.rMax - edge.rMin) / (worldRMax - worldRMin) : 1
            ownedRanges = worldRanges.map(r => ({
              min: edge.rMin + (r.min - worldRMin) * localScale,
              max: edge.rMin + (r.max - worldRMin) * localScale,
            }))
          }
        }

        // Build wall segments in LOCAL space
        for (const range of ownedRanges) {
          // For simplicity, skip door/window openings on non-cardinal rotations
          // (doors/windows are separate meshes and will overlap visually)
          roomGroups[b.s.id].segments.push({
            dir: edge.dir, fixedVal: edge.fixedVal,
            rMin: range.min, rMax: range.max,
            yBot: 0, yH: wh, color, hidden: isHidden,
          })
        }
      }
    }

    return roomGroups
  }, [roomSets, doorSets, windowSets, ppu, defaultWallHeight])

  return (
    <>
      {Object.values(roomGroups).map(group => {
        const elev = group.set.elevation || 0
        return (
          <DraggableSetGroup key={group.set.id} set={group.set} ppu={ppu} defaultWallHeight={defaultWallHeight}>
            {/* Floor plane — positioned at room center, rotated with room */}
            <group position={[group.floor.cx, 0, group.floor.cz]} rotation={[0, group.rotY, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01 + elev, 0]} receiveShadow>
                <planeGeometry args={[group.floor.w, group.floor.d]} />
                <meshStandardMaterial color={group.floor.color} transparent opacity={0.2} side={THREE.DoubleSide} />
              </mesh>
              {/* Wall segments in local (unrotated) space */}
              {group.segments.map((seg, i) => {
                const len = seg.rMax - seg.rMin
                const mid = (seg.rMin + seg.rMax) / 2
                const yCenter = seg.yBot + seg.yH / 2 + elev

                let pos, size
                if (seg.dir === 'h') {
                  // Horizontal edge: runs along local X, fixed at local Z
                  pos = [mid, yCenter, seg.fixedVal]
                  size = [len, seg.yH, WALL_T]
                } else {
                  // Vertical edge: runs along local Z, fixed at local X
                  pos = [seg.fixedVal, yCenter, mid]
                  size = [WALL_T, seg.yH, len]
                }

                return (
                  <mesh key={`wall-${i}`} position={pos} castShadow={!seg.hidden} receiveShadow={!seg.hidden}>
                    <boxGeometry args={size} />
                    <meshStandardMaterial color={seg.color} roughness={0.8} transparent={!!seg.hidden} opacity={seg.hidden ? 0.15 : 1} />
                  </mesh>
                )
              })}
            </group>
          </DraggableSetGroup>
        )
      })}
    </>
  )
}

// ─── Floor Plane ────────────────────────────────────────────────────
function FloorPlane({ sets, ppu }) {
  const bounds = useMemo(() => {
    if (sets.length === 0) return { cx: 0, cz: 0, w: 100, d: 100 }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const s of sets) {
      // Compute AABB from rotated corners for accurate bounds at any angle
      const rotDeg = ((s.rotation || 0) % 360 + 360) % 360
      const rad = rotDeg * Math.PI / 180
      const cosR = Math.cos(rad), sinR = Math.sin(rad)
      const px = s.x / ppu, pz = s.y / ppu
      for (const [lx, lz] of [[0,0],[s.width,0],[s.width,s.height],[0,s.height]]) {
        const wx = px + lx * cosR - lz * sinR
        const wz = pz + lx * sinR + lz * cosR
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx)
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz)
      }
    }
    const pad = 20
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX + pad * 2,
      d: maxZ - minZ + pad * 2,
    }
  }, [sets, ppu])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.05, bounds.cz]} receiveShadow>
      <planeGeometry args={[bounds.w, bounds.d]} />
      <meshStandardMaterial color="#C0C0B8" roughness={0.9} />
    </mesh>
  )
}

// ─── First Person Controls ─────────────────────────────────────────
function FirstPersonControls({ enabled, startPos }) {
  const { camera, gl } = useThree()
  const moveState = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false })
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const isLocked = useRef(false)

  useEffect(() => {
    if (!enabled) return

    camera.position.set(startPos[0], EYE_HEIGHT, startPos[2])

    const onKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.current.forward = true; break
        case 'KeyS': case 'ArrowDown': moveState.current.backward = true; break
        case 'KeyA': case 'ArrowLeft': moveState.current.left = true; break
        case 'KeyD': case 'ArrowRight': moveState.current.right = true; break
        case 'Space': moveState.current.up = true; e.preventDefault(); break
        case 'ShiftLeft': case 'ShiftRight': moveState.current.down = true; break
      }
    }
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.current.forward = false; break
        case 'KeyS': case 'ArrowDown': moveState.current.backward = false; break
        case 'KeyA': case 'ArrowLeft': moveState.current.left = false; break
        case 'KeyD': case 'ArrowRight': moveState.current.right = false; break
        case 'Space': moveState.current.up = false; break
        case 'ShiftLeft': case 'ShiftRight': moveState.current.down = false; break
      }
    }

    const onMouseMove = (e) => {
      if (!isLocked.current) return
      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= e.movementX * LOOK_SPEED
      euler.current.x -= e.movementY * LOOK_SPEED
      euler.current.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }

    const onPointerLockChange = () => {
      isLocked.current = document.pointerLockElement === gl.domElement
    }

    const onClick = () => {
      if (!isLocked.current) {
        gl.domElement.requestPointerLock()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    gl.domElement.addEventListener('click', onClick)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      gl.domElement.removeEventListener('click', onClick)
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock()
      }
    }
  }, [enabled, camera, gl, startPos])

  useFrame(() => {
    if (!enabled) return
    const ms = moveState.current
    const direction = new THREE.Vector3()
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    if (ms.forward) direction.add(forward)
    if (ms.backward) direction.sub(forward)
    if (ms.right) direction.add(right)
    if (ms.left) direction.sub(right)
    if (ms.up) direction.y += 1
    if (ms.down) direction.y -= 1

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(MOVE_SPEED)
      camera.position.add(direction)
    }
  })

  return null
}

// ─── Labels in 3D ──────────────────────────────────────────────────
function SetLabel3D({ set, ppu, defaultWallHeight }) {
  const { cx, cz } = get3DPosition(set, ppu)
  const wallHeight = set.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT
  const labelHeight = (set.category === 'Wall' || set.category === 'Door' || set.category === 'Window')
    ? wallHeight + 1
    : (set.wallHeight || 4) + 1

  if (set.labelHidden || set.category === 'Column') return null

  return (
    <Text
      position={[cx, labelHeight, cz]}
      fontSize={1.2}
      color="#333333"
      anchorX="center"
      anchorY="bottom"
      rotation={[-Math.PI / 4, 0, 0]}
      outlineWidth={0.05}
      outlineColor="#ffffff"
    >
      {set.name}
    </Text>
  )
}

// ─── Main Scene Content ────────────────────────────────────────────
function SceneContent({ controlMode, orbitRef, locked3D, rKeyRef }) {
  const { sets, pixelsPerUnit, layerVisibility, labelsVisible, wallRenderMode, defaultWallHeight, buildingWalls, buildingWallsVisible } = useStore()

  const ppu = pixelsPerUnit || 1

  // Filter visible sets
  const visibleSets = useMemo(() => {
    return sets.filter(s =>
      s.onPlan !== false &&
      !s.hidden &&
      (layerVisibility[s.category || 'Set'] !== false)
    )
  }, [sets, layerVisibility])

  // Separate sets by type
  const wallSets = useMemo(() =>
    visibleSets.filter(s => s.category === 'Wall' || s.iconType === 'flat' || s.iconType === 'double-flat' || s.iconType === 'braced-wall'),
    [visibleSets]
  )
  const doorSets = useMemo(() =>
    visibleSets.filter(s => s.category === 'Door'),
    [visibleSets]
  )
  const windowSets = useMemo(() =>
    visibleSets.filter(s => s.category === 'Window'),
    [visibleSets]
  )
  // Room sets: category is 'Set' or undefined (the main rooms/spaces)
  const roomSets = useMemo(() =>
    visibleSets.filter(s =>
      (s.category === 'Set' || !s.category) &&
      s.category !== 'Wall' && s.category !== 'Door' && s.category !== 'Window' &&
      s.iconType !== 'flat' && s.iconType !== 'double-flat' && s.iconType !== 'braced-wall'
    ),
    [visibleSets]
  )
  // Special sets: furniture, columns, stairs, other category items
  const specialSets = useMemo(() =>
    visibleSets.filter(s =>
      s.category === 'Furniture' || s.category === 'Other' ||
      s.category === 'Column' || s.category === 'Stair' ||
      s.category === 'Bathroom' || s.category === 'Kitchen'
    ),
    [visibleSets]
  )

  // Calculate scene center for orbit controls
  const sceneCenter = useMemo(() => {
    if (visibleSets.length === 0) return [0, 5, 0]
    let cx = 0, cz = 0
    for (const s of visibleSets) {
      const pos = get3DPosition(s, ppu)
      cx += pos.cx
      cz += pos.cz
    }
    cx /= visibleSets.length
    cz /= visibleSets.length
    return [cx, 5, cz]
  }, [visibleSets, ppu])

  const startPos = useMemo(() => sceneCenter, [sceneCenter])

  const dragContextValue = useMemo(() => ({ orbitRef, controlMode, locked3D, rKeyRef }), [orbitRef, controlMode, locked3D, rKeyRef])

  return (
    <DragContext.Provider value={dragContextValue}>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[sceneCenter[0] + 50, 60, sceneCenter[2] - 30]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
      <hemisphereLight
        skyColor="#87CEEB"
        groundColor="#8B7355"
        intensity={0.3}
      />

      {/* Sky */}
      <Sky sunPosition={[100, 50, -50]} />

      {/* Ground plane — solid color, no grid overlay to avoid z-fighting flicker */}
      <FloorPlane sets={visibleSets} ppu={ppu} />

      {/* Individual wall pieces (flat components) */}
      {wallSets.map(s => (
        <DraggableSetGroup key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight}>
          <WallMesh set={s} ppu={ppu} allSets={visibleSets} renderMode={s.wallRenderMode || wallRenderMode} defaultWallHeight={defaultWallHeight} />
        </DraggableSetGroup>
      ))}

      {/* Room Sets: smart walls on unshared edges, with door/window openings */}
      <SetRoomWalls
        roomSets={roomSets}
        doorSets={doorSets}
        windowSets={windowSets}
        ppu={ppu}
        defaultWallHeight={defaultWallHeight}
      />

      {/* Building Walls (fixed structural walls) */}
      {buildingWallsVisible && buildingWalls.map(bw => (
        <BuildingWall3D key={`bw-${bw.id}`} wall={bw} ppu={ppu} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* Doors */}
      {doorSets.map(s => (
        <DraggableSetGroup key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight}>
          <DoorMesh3D set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
        </DraggableSetGroup>
      ))}

      {/* Windows */}
      {windowSets.map(s => (
        <DraggableSetGroup key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight}>
          <WindowMesh3D set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
        </DraggableSetGroup>
      ))}

      {/* Special sets (furniture, columns, stairs, etc.) */}
      {specialSets.map(s => (
        <DraggableSetGroup key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight}>
          <SpecialSetMesh set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
        </DraggableSetGroup>
      ))}

      {/* 3D Labels */}
      {labelsVisible && visibleSets.map(s => (
        <SetLabel3D key={`label-${s.id}`} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* Camera controls */}
      {controlMode === 'orbit' && (
        <OrbitControls
          ref={orbitRef}
          target={sceneCenter}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={300}
          enableDamping
          dampingFactor={0.1}
        />
      )}
      <FirstPersonControls enabled={controlMode === 'firstperson'} startPos={startPos} />
    </DragContext.Provider>
  )
}

// ─── Main Exported Component ───────────────────────────────────────
export default function Scene3D() {
  const [controlMode, setControlMode] = useState('orbit')
  const [locked3D, setLocked3D] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const { wallRenderMode, setWallRenderMode, setSelectedSetId, selectedSetId, updateSet, sets, pixelsPerUnit } = useStore()
  const orbitRef = useRef()
  const rKeyRef = useRef(false)

  // Track R key state for rotation drag mode
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'r' || e.key === 'R') rKeyRef.current = true
    }
    const onKeyUp = (e) => {
      if (e.key === 'r' || e.key === 'R') rKeyRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const handlePointerMissed = useCallback(() => {
    setSelectedSetId(null)
  }, [setSelectedSetId])

  return (
    <div className="w-full h-full relative bg-gray-900">
      {/* Control bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-gray-800/90 rounded-lg px-2 py-1.5 shadow-lg border border-gray-600">
        <button
          onClick={() => setControlMode('orbit')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            controlMode === 'orbit' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Orbit
        </button>
        <button
          onClick={() => setControlMode('firstperson')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            controlMode === 'firstperson' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Walk Through
        </button>

        <div className="w-px bg-gray-600 mx-1" />

        <select
          value={wallRenderMode}
          onChange={e => setWallRenderMode(e.target.value)}
          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
          title="Wall display mode"
        >
          <option value="finished">Finished Walls</option>
          <option value="construction-front">Construction (Front)</option>
          <option value="construction-rear">Construction (Rear)</option>
        </select>

        <div className="w-px bg-gray-600 mx-1" />

        <button
          onClick={() => setLocked3D(prev => !prev)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            locked3D ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title={locked3D ? 'Unlock 3D layout (allow dragging)' : 'Lock 3D layout (prevent dragging)'}
        >
          {locked3D ? '\uD83D\uDD12 Locked' : '\uD83D\uDD13 Unlocked'}
        </button>

        <div className="w-px bg-gray-600 mx-1" />

        <button
          onClick={() => setShowDebug(prev => !prev)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            showDebug ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title="Toggle debug position overlay"
        >
          Debug
        </button>
      </div>

      {controlMode === 'firstperson' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-xs px-4 py-2 rounded-lg">
          Click to lock mouse | WASD to move | Mouse to look | Space/Shift for up/down | Esc to unlock
        </div>
      )}

      {controlMode === 'orbit' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-xs px-4 py-2 rounded-lg">
          {locked3D
            ? 'Layout locked | Click to select | Right-drag to pan | Scroll to zoom | Left-drag to rotate'
            : 'Click to select | Drag to move | Shift+Drag to raise/lower | R+Drag to rotate | Right-drag to pan | Scroll to zoom'
          }
        </div>
      )}

      {/* Selected set rotation/properties panel */}
      {controlMode === 'orbit' && selectedSetId && (() => {
        const sel = sets.find(s => s.id === selectedSetId)
        if (!sel) return null
        return (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-gray-800/95 rounded-lg px-3 py-2 border border-gray-600 flex items-center gap-2 flex-wrap justify-center max-w-lg">
            <span className="text-[10px] text-gray-400 max-w-[100px] truncate">{sel.name}</span>
            <div className="w-px h-4 bg-gray-600" />
            {/* Resize controls */}
            <span className="text-[10px] text-gray-400">W:</span>
            <button onClick={() => updateSet(selectedSetId, { width: Math.max(0.5, sel.width - 0.5) })}
              className="px-1 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">-</button>
            <span className="text-xs text-white font-mono min-w-[28px] text-center">{sel.width}</span>
            <button onClick={() => updateSet(selectedSetId, { width: sel.width + 0.5 })}
              className="px-1 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">+</button>
            <span className="text-[10px] text-gray-400">H:</span>
            <button onClick={() => updateSet(selectedSetId, { height: Math.max(0.5, sel.height - 0.5) })}
              className="px-1 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">-</button>
            <span className="text-xs text-white font-mono min-w-[28px] text-center">{sel.height}</span>
            <button onClick={() => updateSet(selectedSetId, { height: sel.height + 0.5 })}
              className="px-1 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">+</button>
            <div className="w-px h-4 bg-gray-600" />
            {/* Rotation controls */}
            <span className="text-[10px] text-gray-400">Rot:</span>
            <button onClick={() => updateSet(selectedSetId, { rotation: ((sel.rotation || 0) - 5 + 360) % 360 })}
              className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">-5°</button>
            <button onClick={() => updateSet(selectedSetId, { rotation: ((sel.rotation || 0) - 1 + 360) % 360 })}
              className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">-1°</button>
            <span className="text-xs text-white font-mono min-w-[32px] text-center">{sel.rotation || 0}°</span>
            <button onClick={() => updateSet(selectedSetId, { rotation: ((sel.rotation || 0) + 1) % 360 })}
              className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">+1°</button>
            <button onClick={() => updateSet(selectedSetId, { rotation: ((sel.rotation || 0) + 5) % 360 })}
              className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 hover:bg-gray-600">+5°</button>
            <div className="w-px h-4 bg-gray-600" />
            <button onClick={() => updateSet(selectedSetId, { rotation: ((sel.rotation || 0) + 90) % 360 })}
              className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] text-white hover:bg-indigo-500">90°</button>
          </div>
        )
      })()}

      {/* Debug panel */}
      {showDebug && (
        <div className="absolute top-14 right-2 z-20 bg-black/90 text-green-400 text-[10px] font-mono p-2 rounded max-h-[80vh] overflow-auto w-[420px]">
          <div className="text-white text-xs mb-1 font-bold">SET POSITION DEBUG (ppu={pixelsPerUnit.toFixed(2)})</div>
          <table className="w-full">
            <thead>
              <tr className="text-yellow-400">
                <th className="text-left">Name</th>
                <th>cat</th>
                <th>rot</th>
                <th>x(px)</th>
                <th>y(px)</th>
                <th>w(ft)</th>
                <th>h(ft)</th>
                <th>3D cx</th>
                <th>3D cz</th>
              </tr>
            </thead>
            <tbody>
              {sets.filter(s => s.onPlan !== false && !s.hidden).map(s => {
                const ppu = pixelsPerUnit || 1
                const pos = get3DPosition(s, ppu)
                return (
                  <tr key={s.id} className="hover:bg-white/10">
                    <td className="text-left truncate max-w-[100px]" title={s.name}>{s.name}</td>
                    <td className="text-center">{(s.category || 'Set').slice(0,3)}</td>
                    <td className="text-center">{s.rotation || 0}</td>
                    <td className="text-right">{s.x?.toFixed(1)}</td>
                    <td className="text-right">{s.y?.toFixed(1)}</td>
                    <td className="text-right">{s.width}</td>
                    <td className="text-right">{s.height}</td>
                    <td className="text-right">{pos.cx.toFixed(1)}</td>
                    <td className="text-right">{pos.cz.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [50, 40, 80], fov: 60, near: 0.1, far: 1000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
        onPointerMissed={handlePointerMissed}
      >
        <SceneContent controlMode={controlMode} orbitRef={orbitRef} locked3D={locked3D} rKeyRef={rKeyRef} />
      </Canvas>
    </div>
  )
}
