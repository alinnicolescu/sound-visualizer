/**
 * Gobo patterns, drawn once into a 4 × 2 texture atlas. Cell 0 is "open" (a
 * plain circle); cells 1-7 are seven common gobo shapes. A fixture's gobo slot
 * picks a cell, so different slots look different on the ceiling and floor.
 *
 * Real gobo images aren't in the fixture data, so these are representative
 * shapes, not the exact glass of each fixture.
 */
import * as THREE from 'three'

export const GOBO_CELLS = 8
const SIZE = 256

function draw(ctx: CanvasRenderingContext2D, cell: number): void {
  const r = SIZE * 0.46
  ctx.save()
  ctx.translate(SIZE / 2, SIZE / 2)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  const circle = (x: number, y: number, rad: number) => {
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  switch (cell) {
    case 0: // open
      circle(0, 0, r)
      break
    case 1: // ring of dots
      circle(0, 0, r * 0.18)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        circle(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, r * 0.17)
      }
      break
    case 2: // star / spokes
      for (let i = 0; i < 6; i++) {
        ctx.save()
        ctx.rotate((i / 6) * Math.PI * 2)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-r * 0.12, -r)
        ctx.lineTo(r * 0.12, -r)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      break
    case 3: { // breakup: random leafy blobs, seeded so it's the same every time
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2
        const d = Math.sqrt(rnd()) * r * 0.85
        circle(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + rnd() * 0.12))
      }
      break
    }
    case 4: // bars
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.38 - r * 0.09, -r, r * 0.18, r * 2)
      break
    case 5: // triangle
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.9)
      ctx.lineTo(r * 0.8, r * 0.55)
      ctx.lineTo(-r * 0.8, r * 0.55)
      ctx.closePath()
      ctx.fill()
      break
    case 6: // rings
      ctx.lineWidth = r * 0.12
      for (const k of [0.3, 0.62, 0.92]) {
        ctx.beginPath()
        ctx.arc(0, 0, r * k, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    case 7: // flower
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.42, r * 0.18, a, 0, Math.PI * 2)
        ctx.fill()
      }
      circle(0, 0, r * 0.16)
      break
  }
  ctx.restore()
  // Clip to the gobo's round aperture.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

let atlas: THREE.Texture | null = null

export function goboAtlas(): THREE.Texture {
  if (atlas) return atlas
  const canvas = document.createElement('canvas')
  canvas.width = SIZE * 4
  canvas.height = SIZE * 2
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let cell = 0; cell < GOBO_CELLS; cell++) {
    const cellCanvas = document.createElement('canvas')
    cellCanvas.width = cellCanvas.height = SIZE
    draw(cellCanvas.getContext('2d')!, cell)
    ctx.drawImage(cellCanvas, (cell % 4) * SIZE, Math.floor(cell / 4) * SIZE)
  }
  atlas = new THREE.CanvasTexture(canvas)
  atlas.colorSpace = THREE.NoColorSpace
  atlas.flipY = false // row 0 of the canvas is row 0 of the atlas, as drawn
  atlas.minFilter = THREE.LinearMipmapLinearFilter
  atlas.generateMipmaps = true
  return atlas
}

/** Which atlas cell a gobo slot uses: 0 open, then cycling through the seven shapes. */
export function goboCell(slot: number): number {
  return slot <= 0 ? 0 : ((slot - 1) % (GOBO_CELLS - 1)) + 1
}
