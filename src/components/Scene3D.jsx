import { useRef, useMemo, useState, useEffect, useCallback, createContext, useContext } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, Grid, Text, Environment } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store.js'

// Context to share OrbitControls ref + controlMode + lock state with draggable components
const DragContext = createContext({ orbitRef: null, controlMode: 'orbit', locked3D: false })

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

// ─── Coordinate helpers ──────────────────────────────────────────────
// 2D canvas: set.x, set.y are the Fabric.js (left, top) with originX='left', originY='top'
//   This means (x, y) is the rotation PIVOT — the top-left corner of the UNROTATED rect.
//   For 0° and 90°, this coincides with the visual bounding box top-left, but NOT for 180°/270°.
// 2D canvas: set.width, set.height are in feet (NOT pixels)
// 2D pixel footprint = width * ppu, height * ppu
// 3D world: X = right, Y = up, Z = into screen (matching 2D Y axis)
// Rotation: 2D rotation is clockwise degrees, 3D Y rotation is counter-clockwise
//
// To find the visual bounding box center, we rotate the 4 corners of the unrotated rect
// around the pivot (set.x, set.y) and then compute the bounding box center.

function get3DPosition(set, ppu) {
  const rotDeg = (set.rotation || 0) % 360
  const wPx = set.width * ppu   // unrotated width in pixels
  const hPx = set.height * ppu  // unrotated height in pixels

  // The 4 corners of the unrotated rect relative to pivot (set.x, set.y) = (0,0)
  const corners = [
    { x: 0, y: 0 },         // top-left (the pivot)
    { x: wPx, y: 0 },       // top-right
    { x: wPx, y: hPx },     // bottom-right
    { x: 0, y: hPx },       // bottom-left
  ]

  // Rotate corners around (0,0) by rotDeg clockwise
  const rad = rotDeg * Math.PI / 180
  const cosA = Math.cos(rad)
  const sinA = Math.sin(rad)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of corners) {
    // Clockwise rotation: x' = x*cos + y*sin, y' = -x*sin + y*cos
    const rx = c.x * cosA + c.y * sinA
    const ry = -c.x * sinA + c.y * cosA
    // Translate back to world coords (add pivot)
    const wx = set.x + rx
    const wy = set.y + ry
    minX = Math.min(minX, wx)
    minY = Math.min(minY, wy)
    maxX = Math.max(maxX, wx)
    maxY = Math.max(maxY, wy)
  }

  // Bounding box in pixels
  const bbW = maxX - minX
  const bbH = maxY - minY
  const bbCenterX = (minX + maxX) / 2
  const bbCenterY = (minY + maxY) / 2

  // Convert to feet for 3D
  const footprintW = bbW / ppu
  const footprintH = bbH / ppu
  const cx = bbCenterX / ppu
  const cz = bbCenterY / ppu

  // 3D Y rotation (counter-clockwise to match visual)
  const rotY = rotDeg ? -(rotDeg * Math.PI / 180) : 0

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
  const doorWidth = set.width
  const doorDepth = set.height  // plan-view depth (typically thin)
  const doorHeight = set.componentProperties?.elevationHeight || set.wallHeight || DOOR_HEIGHT

  // Door frame (dark wood outline)
  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
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
  const winWidth = set.width
  const winDepth = set.height  // plan-view depth
  // Use actual elevation height from component properties, falling back to defaults
  const elevH = set.componentProperties?.elevationHeight
  const sillHeight = elevH ? Math.max(WINDOW_SILL_HEIGHT, 0) : WINDOW_SILL_HEIGHT
  const headHeight = elevH ? (sillHeight + elevH) : WINDOW_HEAD_HEIGHT
  const winHeight = headHeight - sillHeight

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
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

  // For legacy data, recalculate 3D position using corrected plan-view depth
  const cx_raw = set.x / ppu
  const cz_raw = set.y / ppu
  const isRotated = (set.rotation || 0) % 180 !== 0
  const footprintW = isRotated ? depthFt : widthFt
  const footprintH = isRotated ? widthFt : depthFt
  const cx = cx_raw + footprintW / 2
  const cz = cz_raw + footprintH / 2
  const rotY = set.rotation ? -(set.rotation * Math.PI / 180) : 0

  // Find doors/windows that overlap this wall to cut openings
  const openings = useMemo(() => {
    return allSets.filter(s => {
      if (s.id === set.id) return false
      if (s.category !== 'Door' && s.category !== 'Window') return false
      if (s.onPlan === false || s.hidden) return false

      // Get both bounding boxes in feet
      const sPos = get3DPosition(s, ppu)
      const isRotS = (s.rotation || 0) % 180 !== 0
      const sw = isRotS ? s.height : s.width
      const sh = isRotS ? s.width : s.height
      const sx1 = s.x / ppu, sy1 = s.y / ppu
      const sx2 = sx1 + sw, sy2 = sy1 + sh

      const isRotW = (set.rotation || 0) % 180 !== 0
      const ww = isRotW ? depthFt : widthFt
      const wh = isRotW ? widthFt : depthFt
      const wx1 = set.x / ppu, wy1 = set.y / ppu
      const wx2 = wx1 + ww, wy2 = wy1 + wh

      return sx1 < wx2 && sx2 > wx1 && sy1 < wy2 && sy2 > wy1
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
  const { cx, cz, footprintW, footprintH } = get3DPosition(set, ppu)
  const h = set.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT
  return (
    <mesh position={[cx, h / 2, cz]}>
      <boxGeometry args={[footprintW + 0.3, h + 0.3, footprintH + 0.3]} />
      <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.5} />
    </mesh>
  )
}

// ─── Draggable Set Group ────────────────────────────────────────────
// Wraps 3D children in a group that can be clicked (select) and dragged (reposition).
// Uses raycasting against an invisible XZ ground plane for drag motion.
function DraggableSetGroup({ set, ppu, children, defaultWallHeight }) {
  const selectedSetId = useStore(s => s.selectedSetId)
  const setSelectedSetId = useStore(s => s.setSelectedSetId)
  const updateSet = useStore(s => s.updateSet)
  const isSelected = selectedSetId === set.id

  const groupRef = useRef()
  const dragState = useRef(null)
  const [dragOffset, setDragOffset] = useState([0, 0, 0])
  const { camera, gl, size } = useThree()
  const { orbitRef, controlMode, locked3D } = useContext(DragContext)

  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const getHitPoint = useCallback((e) => {
    // Convert pointer event to NDC coordinates
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

    const hit = getHitPoint(e)
    if (!hit) return

    const { cx, cz } = get3DPosition(set, ppu)
    dragState.current = {
      startHit: hit.clone(),
      startCx: cx,
      startCz: cz,
    }
    setDragOffset([0, 0, 0])

    if (orbitRef?.current) orbitRef.current.enabled = false

    // Use native DOM events for reliable move/up tracking
    const onMove = (moveEvt) => {
      if (!dragState.current) return
      const currentHit = getHitPoint(moveEvt)
      if (!currentHit) return
      const dx = currentHit.x - dragState.current.startHit.x
      const dz = currentHit.z - dragState.current.startHit.z
      setDragOffset([dx, 0, dz])
    }

    const onUp = (upEvt) => {
      if (dragState.current) {
        const currentHit = getHitPoint(upEvt)
        if (currentHit) {
          const dx = currentHit.x - dragState.current.startHit.x
          const dz = currentHit.z - dragState.current.startHit.z
          if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
            // The delta in 3D feet maps directly to a pixel delta
            // Since the 3D center moved by (dx, dz) feet, the pixel pivot moves by the same delta * ppu
            const newPixelX = set.x + dx * ppu
            const newPixelY = set.y + dz * ppu
            updateSet(set.id, { x: newPixelX, y: newPixelY })
          }
        }
        dragState.current = null
        setDragOffset([0, 0, 0])
      }
      if (orbitRef?.current) orbitRef.current.enabled = true
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
    }

    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
  }, [controlMode, locked3D, set, ppu, getHitPoint, orbitRef, gl, setSelectedSetId, updateSet])

  return (
    <group ref={groupRef} position={dragOffset} onPointerDown={onPointerDown}>
      {children}
      {isSelected && <SelectionHighlight set={set} ppu={ppu} defaultWallHeight={defaultWallHeight} />}
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
    // Helper: compute bounding box in feet from a set's pixel-based Fabric.js coords
    // Handles rotation correctly by rotating corners around the pivot (set.x, set.y)
    function getBBoxFeet(s) {
      const rotDeg = (s.rotation || 0) % 360
      const wPx = s.width * ppu
      const hPx = s.height * ppu

      // 4 corners relative to pivot (0,0)
      const corners = [[0, 0], [wPx, 0], [wPx, hPx], [0, hPx]]
      const rad = rotDeg * Math.PI / 180
      const cosA = Math.cos(rad)
      const sinA = Math.sin(rad)

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [cx, cy] of corners) {
        const rx = s.x + cx * cosA + cy * sinA
        const ry = s.y + (-cx * sinA + cy * cosA)
        minX = Math.min(minX, rx)
        minY = Math.min(minY, ry)
        maxX = Math.max(maxX, rx)
        maxY = Math.max(maxY, ry)
      }

      // Convert to feet
      const x1 = minX / ppu
      const z1 = minY / ppu
      const x2 = maxX / ppu
      const z2 = maxY / ppu
      return { x1, z1, x2, z2, fw: x2 - x1, fh: z2 - z1 }
    }

    // Pre-compute bounding boxes in FEET for all rooms
    const boxes = roomSets.map(s => {
      const bb = getBBoxFeet(s)
      return { s, ...bb }
    })

    // Pre-compute door/window bounding boxes in feet
    const openingBoxes = [...doorSets, ...windowSets].map(o => {
      const bb = getBBoxFeet(o)
      return {
        o, ...bb,
        isDoor: o.category === 'Door',
      }
    })

    // Helper: subtract intervals from a range, returning remaining segments
    function subtractIntervals(rangeMin, rangeMax, intervals) {
      if (intervals.length === 0) return [{ min: rangeMin, max: rangeMax }]
      // Sort and merge intervals
      const sorted = [...intervals].sort((a, b) => a.min - b.min)
      const merged = []
      for (const iv of sorted) {
        if (merged.length > 0 && iv.min <= merged[merged.length - 1].max + 0.01) {
          merged[merged.length - 1].max = Math.max(merged[merged.length - 1].max, iv.max)
        } else {
          merged.push({ min: iv.min, max: iv.max })
        }
      }
      // Subtract from range
      const result = []
      let cursor = rangeMin
      for (const m of merged) {
        const clampMin = Math.max(m.min, rangeMin)
        const clampMax = Math.min(m.max, rangeMax)
        if (clampMin >= clampMax) continue
        if (clampMin > cursor + 0.05) {
          result.push({ min: cursor, max: clampMin })
        }
        cursor = Math.max(cursor, clampMax)
      }
      if (cursor < rangeMax - 0.05) {
        result.push({ min: cursor, max: rangeMax })
      }
      return result
    }

    // Group segments and floors by room (setId)
    const roomGroups = {} // keyed by set.id → { set, segments: [], floor: {} }

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const wh = b.s.wallHeight || defaultWallHeight || DEFAULT_WALL_HEIGHT
      const color = (b.s.color && b.s.color !== '#ffffff') ? b.s.color : '#E8E0D8'

      // Initialise group for this room
      const fcx = (b.x1 + b.x2) / 2
      const fcz = (b.z1 + b.z2) / 2
      roomGroups[b.s.id] = {
        set: b.s,
        segments: [],
        floor: { cx: fcx, cz: fcz, w: b.fw, d: b.fh, color },
      }

      // 4 edges: each defined by a fixed axis/value and a range along the other axis
      // 'h' edges run along X (horizontal), 'v' edges run along Z (vertical)
      const edges = [
        { dir: 'h', fixedVal: b.z1, rMin: b.x1, rMax: b.x2 }, // top (front)
        { dir: 'h', fixedVal: b.z2, rMin: b.x1, rMax: b.x2 }, // bottom (back)
        { dir: 'v', fixedVal: b.x1, rMin: b.z1, rMax: b.z2 }, // left
        { dir: 'v', fixedVal: b.x2, rMin: b.z1, rMax: b.z2 }, // right
      ]

      for (const edge of edges) {
        // --- Step 1: Dedup — find overlap intervals from lower-index rooms ---
        const dedupIntervals = []
        for (let j = 0; j < i; j++) {
          const other = boxes[j]
          let matchesEdge = false
          if (edge.dir === 'h') {
            matchesEdge = Math.abs(other.z1 - edge.fixedVal) < EDGE_TOL ||
                          Math.abs(other.z2 - edge.fixedVal) < EDGE_TOL
          } else {
            matchesEdge = Math.abs(other.x1 - edge.fixedVal) < EDGE_TOL ||
                          Math.abs(other.x2 - edge.fixedVal) < EDGE_TOL
          }
          if (matchesEdge) {
            const oMin = edge.dir === 'h' ? other.x1 : other.z1
            const oMax = edge.dir === 'h' ? other.x2 : other.z2
            const overlapMin = Math.max(edge.rMin, oMin)
            const overlapMax = Math.min(edge.rMax, oMax)
            if (overlapMax > overlapMin + 0.05) {
              dedupIntervals.push({ min: overlapMin, max: overlapMax })
            }
          }
        }

        // Get the ranges this room should actually render (after dedup subtraction)
        const ownedRanges = subtractIntervals(edge.rMin, edge.rMax, dedupIntervals)

        // --- Step 2: For each owned range, find door/window openings on this edge ---
        for (const range of ownedRanges) {
          // Find openings that sit on this wall edge
          const edgeOpenings = []
          for (const ob of openingBoxes) {
            // Check if the opening overlaps this edge positionally
            let onEdge = false
            if (edge.dir === 'h') {
              // Horizontal edge at fixedVal (Z). Opening must straddle this Z.
              onEdge = ob.z1 < edge.fixedVal + OPEN_TOL && ob.z2 > edge.fixedVal - OPEN_TOL
            } else {
              // Vertical edge at fixedVal (X). Opening must straddle this X.
              onEdge = ob.x1 < edge.fixedVal + OPEN_TOL && ob.x2 > edge.fixedVal - OPEN_TOL
            }
            if (!onEdge) continue

            // Check overlap along the range axis
            const opMin = edge.dir === 'h' ? ob.x1 : ob.z1
            const opMax = edge.dir === 'h' ? ob.x2 : ob.z2
            const clampMin = Math.max(range.min, opMin)
            const clampMax = Math.min(range.max, opMax)
            if (clampMax <= clampMin + 0.05) continue

            const elevH = ob.o.componentProperties?.elevationHeight
            const sillH = ob.isDoor ? 0 : WINDOW_SILL_HEIGHT
            const headH = ob.isDoor
              ? (elevH || ob.o.wallHeight || DOOR_HEIGHT)
              : (elevH ? (sillH + elevH) : WINDOW_HEAD_HEIGHT)

            edgeOpenings.push({ min: clampMin, max: clampMax, sillH, headH, isDoor: ob.isDoor })
          }

          // Sort openings along the range
          edgeOpenings.sort((a, b) => a.min - b.min)

          // Build wall segments with openings cut out
          let cursor = range.min
          for (const op of edgeOpenings) {
            // Solid wall before this opening
            if (op.min > cursor + 0.05) {
              roomGroups[b.s.id].segments.push({
                dir: edge.dir, fixedVal: edge.fixedVal,
                rMin: cursor, rMax: op.min,
                yBot: 0, yH: wh, color,
              })
            }
            // Wall above opening (header to ceiling)
            if (op.headH < wh - 0.05) {
              roomGroups[b.s.id].segments.push({
                dir: edge.dir, fixedVal: edge.fixedVal,
                rMin: op.min, rMax: op.max,
                yBot: op.headH, yH: wh - op.headH, color,
              })
            }
            // Wall below window (sill)
            if (op.sillH > 0.05) {
              roomGroups[b.s.id].segments.push({
                dir: edge.dir, fixedVal: edge.fixedVal,
                rMin: op.min, rMax: op.max,
                yBot: 0, yH: op.sillH, color,
              })
            }
            cursor = Math.max(cursor, op.max)
          }
          // Solid wall after last opening
          if (cursor < range.max - 0.05) {
            roomGroups[b.s.id].segments.push({
              dir: edge.dir, fixedVal: edge.fixedVal,
              rMin: cursor, rMax: range.max,
              yBot: 0, yH: wh, color,
            })
          }
        }
      }
    }

    return roomGroups
  }, [roomSets, doorSets, windowSets, ppu, defaultWallHeight])

  return (
    <>
      {Object.values(roomGroups).map(group => (
        <DraggableSetGroup key={group.set.id} set={group.set} ppu={ppu} defaultWallHeight={defaultWallHeight}>
          {/* Floor plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[group.floor.cx, 0.01, group.floor.cz]} receiveShadow>
            <planeGeometry args={[group.floor.w, group.floor.d]} />
            <meshStandardMaterial color={group.floor.color} transparent opacity={0.2} side={THREE.DoubleSide} />
          </mesh>
          {/* Wall segments for this room */}
          {group.segments.map((seg, i) => {
            const len = seg.rMax - seg.rMin
            const mid = (seg.rMin + seg.rMax) / 2
            const yCenter = seg.yBot + seg.yH / 2

            let pos, size
            if (seg.dir === 'h') {
              pos = [mid, yCenter, seg.fixedVal]
              size = [len, seg.yH, WALL_T]
            } else {
              pos = [seg.fixedVal, yCenter, mid]
              size = [WALL_T, seg.yH, len]
            }

            return (
              <mesh key={`wall-${i}`} position={pos} castShadow receiveShadow>
                <boxGeometry args={size} />
                <meshStandardMaterial color={seg.color} roughness={0.8} />
              </mesh>
            )
          })}
        </DraggableSetGroup>
      ))}
    </>
  )
}

// ─── Floor Plane ────────────────────────────────────────────────────
function FloorPlane({ sets, ppu }) {
  const bounds = useMemo(() => {
    if (sets.length === 0) return { cx: 0, cz: 0, w: 100, d: 100 }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const s of sets) {
      const { cx, cz } = get3DPosition(s, ppu)
      const isRotated = (s.rotation || 0) % 180 !== 0
      const hw = (isRotated ? s.height : s.width) / 2
      const hd = (isRotated ? s.width : s.height) / 2
      minX = Math.min(minX, cx - hw)
      minZ = Math.min(minZ, cz - hd)
      maxX = Math.max(maxX, cx + hw)
      maxZ = Math.max(maxZ, cz + hd)
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.01, bounds.cz]} receiveShadow>
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
function SceneContent({ controlMode, orbitRef, locked3D }) {
  const { sets, pixelsPerUnit, layerVisibility, labelsVisible, wallRenderMode, defaultWallHeight } = useStore()

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

  const dragContextValue = useMemo(() => ({ orbitRef, controlMode, locked3D }), [orbitRef, controlMode, locked3D])

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

      {/* Floor */}
      <FloorPlane sets={visibleSets} ppu={ppu} />

      {/* Grid helper on floor */}
      <gridHelper
        args={[500, 500, '#666666', '#444444']}
        position={[sceneCenter[0], -0.005, sceneCenter[2]]}
      />

      {/* Individual wall pieces (flat components) */}
      {wallSets.map(s => (
        <DraggableSetGroup key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight}>
          <WallMesh set={s} ppu={ppu} allSets={visibleSets} renderMode={wallRenderMode} defaultWallHeight={defaultWallHeight} />
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
  const { wallRenderMode, setWallRenderMode, setSelectedSetId } = useStore()
  const orbitRef = useRef()

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
            : 'Click to select | Drag to move | Right-drag to pan | Scroll to zoom | Left-drag background to rotate'
          }
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
        <SceneContent controlMode={controlMode} orbitRef={orbitRef} locked3D={locked3D} />
      </Canvas>
    </div>
  )
}
