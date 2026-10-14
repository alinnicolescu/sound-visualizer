/**
 * The room: floor, back wall and ceiling. The stage, truss, booth and the rest
 * of the set are structures (three/structures.ts). The room is sized to hold
 * them: the back wall moves back and the ceiling goes up when it has to
 * (physics.roomFit). Every surface uses the room material, so beam pools and
 * gobos show on them (see roomMaterial.ts).
 */
import * as THREE from 'three'
import type { RoomSettings } from '../model/project'
import type { RoomFit } from '../model/physics'
import { createRoomMaterial, setRoomAmbient } from './roomMaterial'
import { setBeamClip } from './beamMaterial'

export interface Stage {
  group: THREE.Group
  /** Lights the props (truss, booth, fixture bodies) with the room's ambient light. */
  hemisphere: THREE.HemisphereLight
}

export function buildStage(room: RoomSettings, fit: RoomFit): Stage {
  const stage = new THREE.Group()
  stage.name = 'room'

  const size = Math.max(60, fit.halfWidth * 2 + 20, (fit.front - fit.wallZ) * 2 + 20)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), createRoomMaterial(0x6a6d73))
  floor.rotation.x = -Math.PI / 2
  stage.add(floor)

  // The back wall reaches the ceiling when there is one.
  const wallHeight = room.ceiling ? fit.ceiling : Math.max(8, fit.ceiling)
  const width = fit.halfWidth * 2
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, wallHeight), createRoomMaterial(0x9a9da4))
  wall.position.set(0, wallHeight / 2, fit.wallZ)
  stage.add(wall)

  if (room.ceiling) {
    // Faces down: visible from inside the room, see-through from above (so the Top view still works).
    const depth = fit.front - fit.wallZ
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), createRoomMaterial(0x8e9198))
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(0, fit.ceiling, fit.wallZ + depth / 2)
    stage.add(ceiling)
  }
  setBeamClip(room.ceiling ? fit.ceiling : 1e4, fit.wallZ)

  const hemisphere = new THREE.HemisphereLight(0x8a98aa, 0x3a3a3a, 2.4)
  stage.add(hemisphere)
  return { group: stage, hemisphere }
}

const DARK = new THREE.Color(0x0b0c0f)

/**
 * The room's own light: how bright the surfaces are without any show light,
 * and the background and haze colour that goes with it.
 */
export function applyAmbient(room: RoomSettings, stage: Stage, scene: THREE.Scene, fog: THREE.FogExp2): void {
  const tint = new THREE.Color(room.ambientColor)
  const level = Math.max(0, Math.min(1, room.ambient))
  // Squared, so the slider feels even: the low end (club darkness) gets most of its travel.
  const k = 0.08 + level * level * 6
  setRoomAmbient(tint.clone().multiplyScalar(k))
  stage.hemisphere.color.copy(tint)
  stage.hemisphere.groundColor.copy(tint).multiplyScalar(0.35)
  stage.hemisphere.intensity = 1.4 + level * 4.5
  const bg = DARK.clone().lerp(tint.clone().multiplyScalar(0.32), level)
  scene.background = bg
  fog.color.copy(bg)
}
