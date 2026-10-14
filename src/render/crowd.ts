/**
 * Bailanta backdrop in the spirit of the keyboard-battle videos: a small,
 * smoky room seen from the stage, sweeping lights, phone flashes, a
 * hand-painted trapo and a handful of fans who jump on the beat and go wild as the
 * combo climbs.
 */

interface Fan {
  /** Horizontal position, 0..1 across the screen. */
  x: number
  /** Row index, 0 = back. */
  row: number
  /** Beat phase offset so the crowd doesn't move as one body. */
  phase: number
  /** 0 both arms up, 1 one arm waving, 2 fist pump, 3 phone up, 4 clapping */
  pose: number
  /** Body width multiplier. */
  size: number
  /** Jumps on the off-beat instead of the beat. */
  offbeat: boolean
}

const ROWS = 2

/** Deterministic PRNG so the crowd layout is the same every frame. */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const FANS: Fan[] = (() => {
  const r = rng(2001)
  const fans: Fan[] = []
  for (let row = 0; row < ROWS; row++) {
    // A handful either side of the highway, not a packed hall
    for (const x of row ? [0.08, 0.2, 0.8, 0.92] : [0.14, 0.27, 0.73, 0.86]) {
      fans.push({
        x: x + (r() - 0.5) * 0.03,
        row,
        phase: r() * 0.35,
        pose: Math.floor(r() * 5),
        size: 0.85 + r() * 0.35,
        offbeat: r() < 0.25,
      })
    }
  }
  return fans
})()

/** Phone flashes: fixed spots that pop on particular beats. */
const FLASHES = (() => {
  const r = rng(77)
  return Array.from({ length: 18 }, () => ({ x: r(), y: 0.5 + r() * 0.35, beat: Math.floor(r() * 8) }))
})()

const BEAMS = [
  { x: 0.12, color: '255,230,0', speed: 0.7, phase: 0 },
  { x: 0.3, color: '228,0,43', speed: -0.55, phase: 1.3 },
  { x: 0.7, color: '255,122,0', speed: 0.6, phase: 2.1 },
  { x: 0.88, color: '255,255,255', speed: -0.75, phase: 0.6 },
]

export interface CrowdState {
  time: number
  /** Song position in beats. */
  beat: number
  combo: number
  saborActive: boolean
  /** Song time of the player's most recent miss, so the rival can gloat. */
  missAt?: number
  /** Same for the rival, so the player can gloat back. */
  rivalMissAt?: number
  /** Whose turn it is in a duel; the other keyboardist steps back and taunts. */
  turn?: 'you' | 'rival'
}

export function drawCrowd(ctx: CanvasRenderingContext2D, w: number, h: number, s: CrowdState): void {
  // Energy rises with the combo and maxes out under Sabor
  const energy = s.saborActive ? 1.25 : 0.35 + Math.min(1, s.combo / 40) * 0.65
  const pulse = Math.pow(1 - (((s.beat % 1) + 1) % 1), 3)

  ctx.save()
  drawBeams(ctx, w, h, s.time, energy)
  drawTrapo(ctx, w, h, s.time)

  // Haze over the back of the hall, brighter on the downbeat
  const haze = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.7)
  haze.addColorStop(0, `rgba(255,140,60,${0.05 + pulse * 0.08 * energy})`)
  haze.addColorStop(1, 'rgba(255,140,60,0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, h * 0.3, w, h * 0.4)

  for (let row = 0; row < ROWS; row++) {
    const depth = row / (ROWS - 1)
    const baseY = h * (0.5 + depth * 0.42)
    const unit = h * (0.035 + depth * 0.035)
    // Back rows sink into the smoke, front rows are rim-lit by the stage
    const shade = Math.round(18 + (1 - depth) * 40)
    const body = `rgb(${shade + 20},${Math.round(shade * 0.35)},${Math.round(shade * 0.4)})`
    const rim = s.saborActive ? 'rgba(255,230,0,0.55)' : `rgba(255,${120 + Math.round(depth * 80)},40,${0.25 + depth * 0.25})`
    for (const fan of FANS) {
      if (fan.row !== row) continue
      const b = s.beat + fan.phase + (fan.offbeat ? 0.5 : 0)
      const hop = Math.abs(Math.sin(Math.PI * b)) * unit * 0.9 * energy
      drawFan(ctx, fan.x * w, baseY - hop, unit * fan.size, fan, b, energy, body, rim)
    }
  }

  // Phone camera flashes on the beat
  const beatIdx = Math.floor(s.beat)
  for (const f of FLASHES) {
    if ((beatIdx + f.beat) % 8 !== 0 || pulse < 0.4) continue
    const x = f.x * w
    const y = f.y * h
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26)
    g.addColorStop(0, `rgba(255,255,255,${pulse})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 26, y - 26, 52, 52)
  }
  ctx.restore()
}

function drawFan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  fan: Fan,
  b: number,
  energy: number,
  body: string,
  rim: string,
): void {
  const swing = Math.sin(Math.PI * 2 * b * 0.5) * energy
  const shoulderY = y - u * 1.1
  const headR = u * 0.42

  ctx.lineCap = 'round'
  ctx.lineWidth = u * 0.32
  ctx.strokeStyle = body
  ctx.fillStyle = body

  // Arms first so the torso covers the shoulders
  const arm = (side: -1 | 1, ang: number, len = 1.6) => {
    const sx = x + side * u * 0.55
    ctx.beginPath()
    ctx.moveTo(sx, shoulderY + u * 0.1)
    ctx.lineTo(sx + Math.sin(ang) * u * len, shoulderY - Math.cos(ang) * u * len)
    ctx.stroke()
    return [sx + Math.sin(ang) * u * len, shoulderY - Math.cos(ang) * u * len] as const
  }
  switch (fan.pose) {
    case 0:
      arm(-1, -0.35 - swing * 0.15)
      arm(1, 0.35 + swing * 0.15)
      break
    case 1:
      arm(-1, -1.9, 1.1)
      arm(1, 0.3 + swing * 0.6)
      break
    case 2: {
      const pump = Math.abs(Math.sin(Math.PI * b)) * energy
      arm(-1, -2.4, 1)
      const [hx, hy] = arm(1, 0.1, 0.9 + pump * 0.8)
      ctx.beginPath()
      ctx.arc(hx, hy, u * 0.2, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 3: {
      arm(-1, -2.3, 1)
      const [hx, hy] = arm(1, 0.15)
      ctx.fillStyle = body
      ctx.fillRect(hx - u * 0.18, hy - u * 0.5, u * 0.36, u * 0.6)
      ctx.fillStyle = 'rgba(190,230,255,0.85)'
      ctx.fillRect(hx - u * 0.13, hy - u * 0.45, u * 0.26, u * 0.42)
      ctx.fillStyle = body
      break
    }
    default: {
      // Clapping above the head, hands meet on the beat
      const open = (1 - Math.abs(Math.sin(Math.PI * b))) * 0.5
      arm(-1, 0.25 - open)
      arm(1, -0.25 + open)
    }
  }

  // Torso and head
  ctx.beginPath()
  ctx.moveTo(x - u * 0.8, y + u * 2)
  ctx.lineTo(x - u * 0.75, shoulderY + u * 0.2)
  ctx.quadraticCurveTo(x, shoulderY - u * 0.25, x + u * 0.75, shoulderY + u * 0.2)
  ctx.lineTo(x + u * 0.8, y + u * 2)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, shoulderY - headR * 0.9, headR, 0, Math.PI * 2)
  ctx.fill()

  // Stage light catching the top of the head and shoulders
  ctx.strokeStyle = rim
  ctx.lineWidth = Math.max(1, u * 0.08)
  ctx.beginPath()
  ctx.arc(x, shoulderY - headR * 0.9, headR, Math.PI * 1.1, Math.PI * 1.9)
  ctx.stroke()
}

function drawBeams(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, energy: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const beam of BEAMS) {
    const ox = beam.x * w
    const ang = Math.sin(time * beam.speed + beam.phase) * 0.55
    const len = h * 1.1
    const spread = 0.12
    const g = ctx.createLinearGradient(ox, 0, ox + Math.sin(ang) * len, Math.cos(ang) * len)
    g.addColorStop(0, `rgba(${beam.color},${0.22 * energy})`)
    g.addColorStop(1, `rgba(${beam.color},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(ox, -10)
    ctx.lineTo(ox + Math.sin(ang - spread) * len, Math.cos(ang - spread) * len)
    ctx.lineTo(ox + Math.sin(ang + spread) * len, Math.cos(ang + spread) * len)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** A hand-painted football-style flag strung across the back of the hall. */
function drawTrapo(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const y = h * 0.36
  const bw = Math.min(w * 0.9, 1100)
  const x0 = (w - bw) / 2
  const bh = h * 0.07
  const sway = Math.sin(time * 1.3) * bh * 0.08
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x0, y + sway)
  ctx.quadraticCurveTo(w / 2, y + bh * 0.25 - sway, x0 + bw, y + sway)
  ctx.lineTo(x0 + bw, y + bh + sway)
  ctx.quadraticCurveTo(w / 2, y + bh * 1.25 - sway, x0, y + bh + sway)
  ctx.closePath()
  const stripes = ctx.createLinearGradient(x0, 0, x0 + bw, 0)
  for (let i = 0; i <= 8; i++) {
    stripes.addColorStop(i / 8, i % 2 ? 'rgba(120,0,20,0.75)' : 'rgba(150,120,0,0.75)')
  }
  ctx.fillStyle = stripes
  ctx.fill()
  ctx.font = `${Math.round(bh * 0.55)}px 'Permanent Marker', 'Bungee', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,240,200,0.6)'
  ctx.fillText('¡DALE TECLADISTA!  ·  LA BANDA DE LA CUMBIA', w / 2, y + bh * 0.62)
  ctx.restore()
}
