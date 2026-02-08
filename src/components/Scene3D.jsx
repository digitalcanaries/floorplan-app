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
const FLAT_PANEL_HEIGHT = 12     // standard flat panel is 12' tall
const RAIL_HEIGHT = 2            // 2' standard rail (top + bottom)
const TIMBER_SIZE = 0.0625       // 1×3 actual is ~0.75" = 0.0625' (depth on flat)
const TIMBER_WIDTH = 0.208       // 1×3 actual is ~2.5" = 0.208' width
const LUAN_THICKNESS = 0.021     // ~1/4" luan

// ─── Flat Construction Frame (visible lumber) ────────────────────────
function FlatConstructionFrame({ widthFt, heightFt, depthFt, position, rotation, side, style }) {
  const railH = RAIL_HEIGHT
  const timberW = style === 'hollywood' ? 0.292 : 0.0625 // on edge vs flat
  const innerHeight = heightFt - railH * 2
  const toggleSpacing = 2.5
  const toggleCount = Math.max(0, Math.floor(innerHeight / toggleSpacing))
  const panelCount = Math.ceil(widthFt / FLAT_PANEL_WIDTH)

  // Determine offset for front vs rear
  const sideOffset = side === 'rear' ? -depthFt / 2 : depthFt / 2

  return (
    <group position={position} rotation={rotation}>
      {/* Timber frame colour */}
      {(() => {
        const timberColor = '#C4A35A' // raw pine/SPF lumber
        const luanColor = '#D2B48C'   // luan plywood tan
        const frameDepth = timberW

        const elements = []

        // Bottom rail — runs full width
        elements.push(
          <mesh key="rail-bottom" position={[0, railH / 2, sideOffset]} castShadow>
            <boxGeometry args={[widthFt, railH, frameDepth]} />
            <meshStandardMaterial color={timberColor} roughness={0.85} />
          </mesh>
        )

        // Top rail — runs full width
        elements.push(
          <mesh key="rail-top" position={[0, heightFt - railH / 2, sideOffset]} castShadow>
            <boxGeometry args={[widthFt, railH, frameDepth]} />
            <meshStandardMaterial color={timberColor} roughness={0.85} />
          </mesh>
        )

        // Stiles — left and right, run full height
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

        // Toggles — horizontal cross members between rails
        for (let i = 1; i <= toggleCount; i++) {
          const ty = railH + (innerHeight / (toggleCount + 1)) * i
          elements.push(
            <mesh key={`toggle-${i}`} position={[0, ty, sideOffset]} castShadow>
              <boxGeometry args={[widthFt - TIMBER_WIDTH * 2, TIMBER_WIDTH, frameDepth]} />
              <meshStandardMaterial color={timberColor} roughness={0.85} />
            </mesh>
          )
        }

        // Panel join stiles (where 4' flats meet) — every 4' along width
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

        // Luan skin (thin plane covering the frame, slightly in front)
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

// ─── Wall Mesh ─────────────────────────────────────────────────────
function WallMesh({ set, ppu, allSets, renderMode }) {
  const wallHeight = set.wallHeight || DEFAULT_WALL_HEIGHT
  const thickness = set.thickness || 0.5
  const widthFt = set.width
  const depthFt = thickness

  // Position: convert from 2D canvas coords (pixels) to 3D world coords (feet)
  const x3d = set.x / ppu + widthFt / 2
  const z3d = set.y / ppu + depthFt / 2

  // Rotation
  const rotY = set.rotation ? -set.rotation * (Math.PI / 180) : 0

  // Find doors/windows that overlap this wall to cut openings
  const openings = useMemo(() => {
    return allSets.filter(s => {
      if (s.id === set.id) return false
      if (s.category !== 'Door' && s.category !== 'Window') return false
      if (!s.onPlan || s.hidden) return false

      // Check if this door/window overlaps the wall's footprint
      const sx = s.x / ppu, sy = s.y / ppu
      const sw = s.width, sh = s.height
      const wx = set.x / ppu, wy = set.y / ppu
      const ww = set.width, wh = set.thickness || 0.5

      const overlap = sx < wx + ww && sx + sw > wx && sy < wy + wh && sy + sh > wy
      return overlap
    })
  }, [allSets, set, ppu])

  // Wall colour based on material
  const wallColor = useMemo(() => {
    if (set.materialTexture === 'brick') return '#8B4513'
    if (set.materialTexture === 'concrete') return '#999999'
    if (set.materialTexture === 'greenscreen') return '#00CC00'
    if (set.materialTexture === 'wood') return '#DEB887'
    return '#E8E0D8' // default drywall/painted finish
  }, [set.materialTexture])

  const isConstructionView = renderMode === 'construction-front' || renderMode === 'construction-rear'
  const constructionSide = renderMode === 'construction-rear' ? 'rear' : 'front'
  const flatStyle = set.componentProperties?.style || 'hollywood'

  if (isConstructionView && (set.iconType === 'flat' || set.iconType === 'flat-double' || set.iconType === 'flat-braced' || set.category === 'Wall')) {
    // Construction view — show lumber framing
    return (
      <group position={[x3d, 0, z3d]} rotation={[0, rotY, 0]}>
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
    // Simple solid wall — no openings
    return (
      <mesh position={[x3d, wallHeight / 2, z3d]} rotation={[0, rotY, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthFt, wallHeight, depthFt]} />
        <meshStandardMaterial color={wallColor} roughness={0.8} />
      </mesh>
    )
  }

  // Wall with openings — build as multiple box segments
  return (
    <group position={[x3d, 0, z3d]} rotation={[0, rotY, 0]}>
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
    const wx = wallSet.x / ppu
    const segs = []

    // Sort openings by their x position relative to wall
    const sorted = openings
      .map(o => {
        const ox = o.x / ppu - wx
        const ow = o.width
        const isDoor = o.category === 'Door'
        const sillH = isDoor ? 0 : WINDOW_SILL_HEIGHT
        const headH = isDoor ? DOOR_HEIGHT : WINDOW_HEAD_HEIGHT
        return { ox, ow, sillH, headH, isDoor }
      })
      .sort((a, b) => a.ox - b.ox)

    let cursor = -widthFt / 2

    for (const op of sorted) {
      const openLeft = op.ox - widthFt / 2 + widthFt / 2 // offset from wall center
      const openRight = openLeft + op.ow

      // Segment before opening (full height)
      if (openLeft > cursor + 0.01) {
        const segW = openLeft - cursor
        segs.push({
          x: cursor + segW / 2,
          y: wallHeight / 2,
          w: segW,
          h: wallHeight,
        })
      }

      // Above the opening
      if (op.headH < wallHeight - 0.01) {
        const aboveH = wallHeight - op.headH
        segs.push({
          x: openLeft + op.ow / 2,
          y: op.headH + aboveH / 2,
          w: op.ow,
          h: aboveH,
        })
      }

      // Below window (sill)
      if (op.sillH > 0.01) {
        segs.push({
          x: openLeft + op.ow / 2,
          y: op.sillH / 2,
          w: op.ow,
          h: op.sillH,
        })
      }

      cursor = openRight
    }

    // Final segment after last opening
    const wallRight = widthFt / 2
    if (cursor < wallRight - 0.01) {
      const segW = wallRight - cursor
      segs.push({
        x: cursor + segW / 2,
        y: wallHeight / 2,
        w: segW,
        h: wallHeight,
      })
    }

    return segs
  }, [widthFt, wallHeight, openings, wallSet, ppu])

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
        const ox = o.x / ppu - wallSet.x / ppu - widthFt / 2 + widthFt / 2 + o.width / 2
        const midY = (WINDOW_SILL_HEIGHT + WINDOW_HEAD_HEIGHT) / 2
        return (
          <mesh key={`glass-${i}`} position={[ox, midY, 0]}>
            <planeGeometry args={[o.width, WINDOW_HEAD_HEIGHT - WINDOW_SILL_HEIGHT]} />
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

// ─── Generic Set Mesh (furniture, bathroom, etc.) ──────────────────
function SetMesh({ set, ppu }) {
  const heightFt = set.wallHeight || (set.category === 'Furniture' ? 3 : set.category === 'Bathroom' ? 3 : 2)
  const x3d = set.x / ppu + set.width / 2
  const z3d = set.y / ppu + set.height / 2
  const elevation = set.elevation || 0

  const color = useMemo(() => {
    if (set.color && set.color !== '#ffffff') return set.color
    switch (set.category) {
      case 'Furniture': return '#8B7355'
      case 'Bathroom': return '#B0C4DE'
      case 'Kitchen': return '#DAA520'
      case 'Stair': return '#A0A0A0'
      case 'Column': return '#808080'
      default: return '#CCCCCC'
    }
  }, [set.color, set.category])

  // Columns are cylinders
  if (set.category === 'Column') {
    const radius = Math.min(set.width, set.height) / 2
    return (
      <mesh position={[x3d, (set.wallHeight || DEFAULT_WALL_HEIGHT) / 2 + elevation, z3d]} castShadow>
        <cylinderGeometry args={[radius, radius, set.wallHeight || DEFAULT_WALL_HEIGHT, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    )
  }

  // Stairs - stepped blocks
  if (set.category === 'Stair') {
    const steps = 12
    const stepH = (set.wallHeight || 10) / steps
    return (
      <group position={[x3d, elevation, z3d]}>
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

  return (
    <mesh position={[x3d, heightFt / 2 + elevation, z3d]} castShadow receiveShadow>
      <boxGeometry args={[set.width, heightFt, set.height]} />
      <meshStandardMaterial
        color={color}
        transparent={set.opacity < 1}
        opacity={Math.max(set.opacity || 1, 0.5)}
        roughness={0.7}
      />
    </mesh>
  )
}

// ─── Floor Plane ────────────────────────────────────────────────────
function FloorPlane({ sets, ppu }) {
  const bounds = useMemo(() => {
    if (sets.length === 0) return { cx: 0, cz: 0, w: 100, d: 100 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const s of sets) {
      const sx = s.x / ppu
      const sy = s.y / ppu
      minX = Math.min(minX, sx)
      minY = Math.min(minY, sy)
      maxX = Math.max(maxX, sx + s.width)
      maxY = Math.max(maxY, sy + s.height)
    }
    const pad = 20
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2,
      w: maxX - minX + pad * 2,
      d: maxY - minY + pad * 2,
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
function SetLabel3D({ set, ppu }) {
  const wallHeight = set.wallHeight || DEFAULT_WALL_HEIGHT
  const x3d = set.x / ppu + set.width / 2
  const z3d = set.y / ppu + set.height / 2

  if (set.labelHidden || set.category === 'Column') return null

  return (
    <Text
      position={[x3d, wallHeight + 1, z3d]}
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
  const { sets, pixelsPerUnit, layerVisibility, labelsVisible, wallRenderMode } = useStore()

  const ppu = pixelsPerUnit || 1

  // Filter visible sets
  const visibleSets = useMemo(() => {
    return sets.filter(s =>
      s.onPlan !== false &&
      !s.hidden &&
      (layerVisibility[s.category || 'Set'] !== false)
    )
  }, [sets, layerVisibility])

  // Separate walls from other sets
  const wallSets = useMemo(() =>
    visibleSets.filter(s => s.category === 'Wall' || s.iconType === 'flat' || s.iconType === 'double-flat' || s.iconType === 'braced-wall'),
    [visibleSets]
  )
  const otherSets = useMemo(() =>
    visibleSets.filter(s => s.category !== 'Wall' && s.category !== 'Door' && s.category !== 'Window'
      && s.iconType !== 'flat' && s.iconType !== 'double-flat' && s.iconType !== 'braced-wall'),
    [visibleSets]
  )

  // Calculate scene center for orbit controls
  const sceneCenter = useMemo(() => {
    if (visibleSets.length === 0) return [0, 5, 0]
    let cx = 0, cz = 0
    for (const s of visibleSets) {
      cx += s.x / ppu + s.width / 2
      cz += s.y / ppu + s.height / 2
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
        <WallMesh key={s.id} set={s} ppu={ppu} allSets={visibleSets} renderMode={wallRenderMode} />
      ))}

      {/* Other sets (furniture, columns, stairs, etc.) */}
      {otherSets.map(s => (
        <SetMesh key={s.id} set={s} ppu={ppu} />
      ))}

      {/* 3D Labels */}
      {labelsVisible && visibleSets.map(s => (
        <SetLabel3D key={`label-${s.id}`} set={s} ppu={ppu} />
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
  const [controlMode, setControlMode] = useState('orbit') // 'orbit' or 'firstperson'
  const { wallRenderMode, setWallRenderMode } = useStore()

  return (
    <div className="w-full h-full relative bg-gray-900">
      {/* Control bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-gray-800/90 rounded-lg px-2 py-1.5 shadow-lg border border-gray-600">
        {/* Camera mode */}
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

        {/* Wall render mode */}
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

      {/* Instructions overlay */}
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
