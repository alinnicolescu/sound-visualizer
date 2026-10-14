/**
 * A cheap "light in haze" beam: a cone drawn with additive blending.
 *
 * It fades along its length and towards its silhouette edges, which reads as a
 * soft shaft of light. With a gobo in, the beam breaks into streaks (like a real
 * gobo seen through haze); `goboTurn` rotates them.
 */
import * as THREE from 'three'

/** Shared by every beam; the stage sets them when the room changes. */
const clipTop = { value: 1e4 }
const clipBack = { value: -1e4 }

export function setBeamClip(top: number, back: number): void {
  clipTop.value = top
  clipBack.value = back
}

export function createBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(1, 1, 1) },
      intensity: { value: 0 },
      haze: { value: 0.5 },
      gobo: { value: 0 },
      goboTurn: { value: 0 },
      // The room: beams stop at the floor, the ceiling and the back wall.
      clipTop: clipTop,
      clipBack: clipBack
    },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vAround;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vAlong = position.y;               // 0 at the lens, 1 at the far end
        vAround = atan(position.z, position.x);
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-viewPos.xyz);
        gl_Position = projectionMatrix * viewPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float intensity;
      uniform float haze;
      uniform float gobo;
      uniform float goboTurn;
      uniform float clipTop;
      uniform float clipBack;
      varying vec3 vWorld;
      varying float vAlong;
      varying float vAround;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        if (vWorld.y < 0.0 || vWorld.y > clipTop || vWorld.z < clipBack) discard;
        float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float edge = pow(facing, 1.6);
        float falloff = pow(1.0 - vAlong, 1.4);
        float pattern = 1.0;
        if (gobo > 0.5) {
          float spokes = 3.0 + mod(gobo, 6.0);
          pattern = 0.25 + 0.75 * smoothstep(0.2, 0.8, 0.5 + 0.5 * cos(vAround * spokes + goboTurn));
        }
        float a = intensity * haze * edge * falloff * pattern * 0.55;
        gl_FragColor = vec4(color * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  })
}
