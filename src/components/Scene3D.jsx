import { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, Grid, Text, Environment } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store.js'

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
// 2D canvas: set.x, set.y are pixel positions (top-left corner)
// 2D canvas: set.width, set.height are in feet
// 2D pixel footprint = width * ppu, height * ppu
// 3D world: X = right, Y = up, Z = into screen (matching 2D Y axis)
// Convert: center_x_feet = set.x / ppu + set.width / 2
//          center_z_feet = set.y / ppu + set.height / 2
// Rotation: 2D rotation is clockwise degrees, 3D Y rotation is counter-clockwise

function get3DPosition(set, ppu) {
  const isRotated = (set.rotation || 0) % 180 !== 0
  // In 2D, when rotated 90/270, fabric.js swaps the rendered dimensions
  // but x,y still refers to the top-left of the bounding box
  const footprintW = isRotated ? set.height : set.width
  const footprintH = isRotated ? set.width : set.height
  const cx = set.x / ppu + footprintW / 2
  const cz = set.y / ppu + footprintH / 2
  const rotY = set.rotation ? -(set.rotation * Math.PI / 180) : 0
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

// ─── Generic Set Mesh ──────────────────────────────────────────────────────
function SetMesh({ set, ppu, defaultWallHeight }) {
  const { cx, cz, rotY } = get3DPosition(set, ppu)
  const elevation = set.elevation || 0

  const color = useMemo(() => {
    if (set.color && set.color !== '#ffffff') return set.color
    return '#CCCCCC'
  }, [set.color])

  // Columns are cylinders
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

  // Stairs - stepped blocks
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

  // Furniture — keep as low solid boxes
  if (set.category === 'Furniture' || set.category === 'Other') {
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

  // Default (category: 'Set') — render as a colored floor plane (room area marker)
  // The actual walls come from Wall category pieces placed by the user
  return (
    <group position={[cx, elevation, cz]} rotation={[0, rotY, 0]}>
      {/* Floor plane showing the room area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[set.width, set.height]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Thin border lines on the floor to show room edges */}
      {[
        // Front edge
        { pos: [0, 0.03, -set.height / 2], size: [set.width, 0.02, 0.08] },
        // Back edge
        { pos: [0, 0.03, set.height / 2], size: [set.width, 0.02, 0.08] },
        // Left edge
        { pos: [-set.width / 2, 0.03, 0], size: [0.08, 0.02, set.height] },
        // Right edge
        { pos: [set.width / 2, 0.03, 0], size: [0.08, 0.02, set.height] },
      ].map((edge, i) => (
        <mesh key={i} position={edge.pos}>
          <boxGeometry args={edge.size} />
          <meshStandardMaterial color={color} opacity={0.6} transparent />
        </mesh>
      ))}
    </group>
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
function SceneContent({ controlMode }) {
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

  // Separate walls, doors, windows, and other sets
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
  const otherSets = useMemo(() =>
    visibleSets.filter(s =>
      s.category !== 'Wall' && s.category !== 'Door' && s.category !== 'Window'
      && s.iconType !== 'flat' && s.iconType !== 'double-flat' && s.iconType !== 'braced-wall'
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

  return (
    <>
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

      {/* Walls */}
      {wallSets.map(s => (
        <WallMesh key={s.id} set={s} ppu={ppu} allSets={visibleSets} renderMode={wallRenderMode} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* Doors */}
      {doorSets.map(s => (
        <DoorMesh3D key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* Windows */}
      {windowSets.map(s => (
        <WindowMesh3D key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* Other sets (rooms, furniture, columns, stairs, etc.) */}
      {otherSets.map(s => (
        <SetMesh key={s.id} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* 3D Labels */}
      {labelsVisible && visibleSets.map(s => (
        <SetLabel3D key={`label-${s.id}`} set={s} ppu={ppu} defaultWallHeight={defaultWallHeight} />
      ))}

      {/* Camera controls */}
      {controlMode === 'orbit' && (
        <OrbitControls
          target={sceneCenter}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={300}
          enableDamping
          dampingFactor={0.1}
        />
      )}
      <FirstPersonControls enabled={controlMode === 'firstperson'} startPos={startPos} />
    </>
  )
}

// ─── Main Exported Component ───────────────────────────────────────
export default function Scene3D() {
  const [controlMode, setControlMode] = useState('orbit')
  const { wallRenderMode, setWallRenderMode } = useStore()

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
      </div>

      {controlMode === 'firstperson' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-xs px-4 py-2 rounded-lg">
          Click to lock mouse | WASD to move | Mouse to look | Space/Shift for up/down | Esc to unlock
        </div>
      )}

      {controlMode === 'orbit' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-xs px-4 py-2 rounded-lg">
          Left-drag to rotate | Right-drag to pan | Scroll to zoom
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
      >
        <SceneContent controlMode={controlMode} />
      </Canvas>
    </div>
  )
}
