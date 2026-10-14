import { LANE_COLORS, LANE_COUNT, LANE_LABELS } from '../engine/keys'
import type { Grade, NoteState, Stats, TimedNote } from '../engine/judge'
import { SABOR_MIN_TO_ACTIVATE } from '../engine/judge'
import type { TempoMap } from '../engine/tempo'
import { drawCrowd } from './crowd'

export interface Popup {
  grade: Grade
  lane: number
  /** Song time the popup was created. */
  at: number
}

export interface FrameState {
  /** Song time in seconds (already latency-compensated). */
  time: number
  duration: number
  lookahead: number
  notes: readonly TimedNote[]
  states: readonly NoteState[]
  tempo: TempoMap
  beatsPerBar: number
  pressed: readonly boolean[]
  popups: readonly Popup[]
  stats: Stats
  multiplier: number
  /** Hide HUD (used by the editor preview). */
  hud: boolean
  /** Paint the 2D hall behind the highway; off when the 3D crowd is drawn underneath. */
  background?: boolean
}

const GRADE_TEXT: Record<Grade, string> = { perfect: '¡PERFECTO!', good: 'BIEN', miss: 'FALLO' }
const GRADE_COLOR: Record<Grade, [string, string]> = {
  perfect: ['#fffbe0', '#ff9d00'],
  good: ['#e9fffb', '#00c8ff'],
  miss: ['#ffd0d0', '#e4002b'],
}
const DISPLAY_FONT = "'Bungee', 'Arial Black', Impact, sans-serif"

/** Brushed-chrome vertical gradient between y0 and y1. */
function chrome(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.3, '#e9eef5')
  g.addColorStop(0.48, '#8a96a8')
  g.addColorStop(0.52, '#2b3140')
  g.addColorStop(0.7, '#9aa6b8')
  g.addColorStop(1, '#ffffff')
  return g
}

/** Chunky 2000s CD-cover lettering: black outline, offset shadow, gradient fill. */
function bigText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colors: [string, string],
): void {
  ctx.save()
  ctx.font = `${Math.round(size)}px ${DISPLAY_FONT}`
  ctx.lineJoin = 'round'
  ctx.translate(x, y)
  ctx.transform(1, 0, -0.15, 1, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillText(text, size * 0.08, size * 0.1)
  ctx.lineWidth = Math.max(2, size * 0.14)
  ctx.strokeStyle = '#000'
  ctx.strokeText(text, 0, 0)
  const g = ctx.createLinearGradient(0, -size * 0.8, 0, size * 0.1)
  g.addColorStop(0, colors[0])
  g.addColorStop(1, colors[1])
  ctx.fillStyle = g
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
/** How much the far end of the highway shrinks. */
const DEPTH = 2.6
/** Extra horizontal gap between the two hands, in lane widths. */
const HAND_GAP = 0.35

interface Layout {
  w: number
  h: number
  cx: number
  hitY: number
  topY: number
  laneW: number
}

function layout(w: number, h: number): Layout {
  const laneW = Math.min(w / (LANE_COUNT + HAND_GAP + 1.2), 92)
  return { w, h, cx: w / 2, hitY: h - Math.max(70, h * 0.13), topY: h * 0.06, laneW }
}

/** Perspective scale for a note `z` (0 = at hit line, 1 = far end). */
function scaleAt(z: number): number {
  return 1 / (1 + z * DEPTH)
}

function yAt(l: Layout, z: number): number {
  const s = scaleAt(z)
  const sFar = scaleAt(1)
  const k = (s - sFar) / (1 - sFar)
  return l.topY + (l.hitY - l.topY) * k
}

/** Lane centre offset from the middle, in lane widths. */
function laneOffset(lane: number): number {
  const half = LANE_COUNT / 2
  const gap = lane < half ? -HAND_GAP / 2 : HAND_GAP / 2
  return lane - half + 0.5 + gap
}

function xAt(l: Layout, lane: number, z: number, edge = 0): number {
  return l.cx + (laneOffset(lane) + edge) * l.laneW * scaleAt(z)
}

export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, f: FrameState): void {
  const l = layout(w, h)
  const zOf = (t: number) => (t - f.time) / f.lookahead

  if (f.background === false) {
    ctx.clearRect(0, 0, w, h)
  } else {
    // Background: a smoky bailanta with a sunburst behind the horizon and a jumping crowd
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#6a0014')
    bg.addColorStop(0.5, '#2a0008')
    bg.addColorStop(1, '#0c0103')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    drawSunburst(ctx, l.cx, l.topY, Math.hypot(w, h), f.time, f.stats.saborActive)
    drawCrowd(ctx, w, h, {
      time: f.time,
      beat: f.tempo.timeToBeat(f.time),
      combo: f.stats.combo,
      saborActive: f.stats.saborActive,
    })
  }

  // Highway body
  const leftEdge = -LANE_COUNT / 2 - HAND_GAP / 2
  const rightEdge = LANE_COUNT / 2 + HAND_GAP / 2
  ctx.beginPath()
  ctx.moveTo(l.cx + leftEdge * l.laneW * scaleAt(1), yAt(l, 1))
  ctx.lineTo(l.cx + rightEdge * l.laneW * scaleAt(1), yAt(l, 1))
  ctx.lineTo(l.cx + rightEdge * l.laneW * scaleAt(-0.12), yAt(l, -0.12))
  ctx.lineTo(l.cx + leftEdge * l.laneW * scaleAt(-0.12), yAt(l, -0.12))
  ctx.closePath()
  const body = ctx.createLinearGradient(0, yAt(l, 1), 0, l.hitY)
  if (f.stats.saborActive) {
    body.addColorStop(0, 'rgba(120, 10, 0, 0.85)')
    body.addColorStop(1, 'rgba(255, 110, 0, 0.55)')
  } else {
    body.addColorStop(0, 'rgba(20, 2, 4, 0.96)')
    body.addColorStop(1, 'rgba(48, 6, 12, 0.96)')
  }
  ctx.fillStyle = body
  ctx.fill()

  // Chrome side rails and the hand split
  for (const [edge, width] of [
    [leftEdge, 6],
    [rightEdge, 6],
    [0, 3],
  ] as const) {
    ctx.strokeStyle = chrome(ctx, yAt(l, 1), l.hitY + 40)
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(l.cx + edge * l.laneW * scaleAt(1), yAt(l, 1))
    ctx.lineTo(l.cx + edge * l.laneW * scaleAt(-0.12), yAt(l, -0.12))
    ctx.stroke()
  }

  // Lane dividers
  ctx.lineWidth = 1
  for (let i = 0; i < LANE_COUNT; i++) {
    for (const edge of [-0.5, 0.5]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.moveTo(xAt(l, i, 1, edge), yAt(l, 1))
      ctx.lineTo(xAt(l, i, -0.12, edge), yAt(l, -0.12))
      ctx.stroke()
    }
    if (f.pressed[i]) {
      const grad = ctx.createLinearGradient(0, l.hitY, 0, yAt(l, 0.5))
      grad.addColorStop(0, LANE_COLORS[i] + '55')
      grad.addColorStop(1, LANE_COLORS[i] + '00')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(xAt(l, i, 0, -0.5), l.hitY)
      ctx.lineTo(xAt(l, i, 0.5, -0.5), yAt(l, 0.5))
      ctx.lineTo(xAt(l, i, 0.5, 0.5), yAt(l, 0.5))
      ctx.lineTo(xAt(l, i, 0, 0.5), l.hitY)
      ctx.fill()
    }
  }

  // Beat lines
  const firstBeat = Math.ceil(f.tempo.timeToBeat(f.time - f.lookahead * 0.1))
  const lastBeat = Math.floor(f.tempo.timeToBeat(f.time + f.lookahead))
  for (let b = Math.max(0, firstBeat); b <= lastBeat; b++) {
    const z = zOf(f.tempo.beatToTime(b))
    if (z < -0.1 || z > 1) continue
    const bar = b % f.beatsPerBar === 0
    ctx.strokeStyle = bar ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.1)'
    ctx.lineWidth = bar ? 2 : 1
    const y = yAt(l, z)
    ctx.beginPath()
    ctx.moveTo(l.cx + leftEdge * l.laneW * scaleAt(z), y)
    ctx.lineTo(l.cx + rightEdge * l.laneW * scaleAt(z), y)
    ctx.stroke()
  }

  // Hit line + keys
  for (let i = 0; i < LANE_COUNT; i++) {
    const x = xAt(l, i, 0)
    const r = l.laneW * 0.4
    // chrome bezel
    ctx.beginPath()
    ctx.arc(x, l.hitY, r * 1.12, 0, Math.PI * 2)
    ctx.fillStyle = chrome(ctx, l.hitY - r * 1.12, l.hitY + r * 1.12)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#000'
    ctx.stroke()
    // colored button, lit when pressed
    ctx.beginPath()
    ctx.arc(x, l.hitY, r * 0.86, 0, Math.PI * 2)
    if (f.pressed[i]) {
      const lit = ctx.createRadialGradient(x - r * 0.3, l.hitY - r * 0.3, 1, x, l.hitY, r)
      lit.addColorStop(0, '#fff')
      lit.addColorStop(0.35, LANE_COLORS[i])
      lit.addColorStop(1, shade(LANE_COLORS[i]))
      ctx.fillStyle = lit
      ctx.shadowColor = LANE_COLORS[i]
      ctx.shadowBlur = 24
    } else {
      ctx.fillStyle = shade(shade(LANE_COLORS[i]))
    }
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 3
    ctx.strokeStyle = LANE_COLORS[i]
    ctx.stroke()
    ctx.font = `${Math.round(r * 0.75)}px ${DISPLAY_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#000'
    ctx.strokeText(LANE_LABELS[i], x, l.hitY + 1)
    ctx.fillStyle = '#fff'
    ctx.fillText(LANE_LABELS[i], x, l.hitY + 1)
  }

  // Notes, far to near so near ones draw on top
  const visible: number[] = []
  for (let i = 0; i < f.notes.length; i++) {
    const n = f.notes[i]
    if (n.time - f.time > f.lookahead) break
    if (zOf(n.end) < -0.15) continue
    const st = f.states[i]
    if (st === 'hit' || st === 'held') continue
    visible.push(i)
  }
  for (let k = visible.length - 1; k >= 0; k--) {
    const i = visible[k]
    const n = f.notes[i]
    const st = f.states[i]
    const color = LANE_COLORS[n.lane]
    const dim = st === 'missed' || st === 'dropped'

    if (n.end > n.time) {
      const zs = st === 'holding' ? 0 : Math.max(zOf(n.time), -0.12)
      const ze = Math.min(zOf(n.end), 1)
      if (ze > zs) {
        ctx.beginPath()
        ctx.moveTo(xAt(l, n.lane, zs, -0.16), yAt(l, zs))
        ctx.lineTo(xAt(l, n.lane, ze, -0.16), yAt(l, ze))
        ctx.lineTo(xAt(l, n.lane, ze, 0.16), yAt(l, ze))
        ctx.lineTo(xAt(l, n.lane, zs, 0.16), yAt(l, zs))
        ctx.closePath()
        ctx.fillStyle = dim ? 'rgba(120,120,120,0.35)' : color + (st === 'holding' ? 'ee' : '99')
        ctx.fill()
      }
    }
    if (st === 'holding') continue

    const z = zOf(n.time)
    if (z > 1 || z < -0.15) continue
    const s = scaleAt(z)
    const x = xAt(l, n.lane, z)
    const y = yAt(l, z)
    const rw = l.laneW * 0.42 * s
    const rh = l.laneW * 0.22 * s
    // chrome bezel
    ctx.beginPath()
    ctx.ellipse(x, y + rh * 0.18, rw * 1.08, rh * 1.15, 0, 0, Math.PI * 2)
    ctx.fillStyle = dim ? '#333' : chrome(ctx, y - rh, y + rh * 1.4)
    ctx.fill()
    // candy gem
    ctx.beginPath()
    ctx.ellipse(x, y, rw * 0.9, rh * 0.85, 0, 0, Math.PI * 2)
    if (dim) {
      ctx.fillStyle = '#555'
    } else {
      const gem = ctx.createRadialGradient(x - rw * 0.3, y - rh * 0.4, 1, x, y, rw)
      gem.addColorStop(0, '#ffffff')
      gem.addColorStop(0.25, color)
      gem.addColorStop(1, shade(color))
      ctx.fillStyle = gem
    }
    ctx.fill()
    ctx.lineWidth = Math.max(1, 1.5 * s)
    ctx.strokeStyle = '#000'
    ctx.stroke()
    if (!dim) {
      ctx.beginPath()
      ctx.ellipse(x - rw * 0.15, y - rh * 0.35, rw * 0.5, rh * 0.28, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fill()
    }
  }

  // Judgement popups
  for (const p of f.popups) {
    const age = f.time - p.at
    if (age < 0 || age > 0.6) continue
    const alpha = 1 - age / 0.6
    ctx.globalAlpha = alpha
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const pop = 1 + Math.max(0, 0.12 - age) * 3
    bigText(
      ctx,
      GRADE_TEXT[p.grade],
      xAt(l, p.lane, 0),
      l.hitY - l.laneW * 0.75 - age * 60,
      l.laneW * 0.3 * pop,
      GRADE_COLOR[p.grade],
    )
    ctx.globalAlpha = 1
  }

  if (f.hud) drawHud(ctx, l, f)
}

function drawHud(ctx: CanvasRenderingContext2D, l: Layout, f: FrameState): void {
  const s = f.stats
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  bigText(ctx, Math.round(s.score).toLocaleString(), 22, 50, 32, ['#ffffff', '#9aa6b8'])
  if (s.combo >= 5) bigText(ctx, `¡${s.combo} COMBO!`, 22, 84, 18, ['#fffbe0', '#ff1fa9'])

  ctx.textAlign = 'right'
  bigText(
    ctx,
    `x${f.multiplier}`,
    l.w - 22,
    54,
    40,
    s.saborActive ? ['#fffbe0', '#e4002b'] : ['#fffbe0', '#ff9d00'],
  )

  // Sabor meter: chrome frame, fire fill
  const mw = 170
  const mh = 14
  const mx = l.w - 22 - mw
  const my = 68
  ctx.fillStyle = chrome(ctx, my - 3, my + mh + 3)
  ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6)
  ctx.fillStyle = '#05021e'
  ctx.fillRect(mx, my, mw, mh)
  const fire = ctx.createLinearGradient(mx, 0, mx + mw, 0)
  fire.addColorStop(0, '#e4002b')
  fire.addColorStop(0.5, '#ff7a00')
  fire.addColorStop(1, '#ffe600')
  ctx.fillStyle = s.sabor >= SABOR_MIN_TO_ACTIVATE || s.saborActive ? fire : '#7a3cff'
  ctx.fillRect(mx, my, mw * s.sabor, mh)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(mx, my, mw * s.sabor, mh * 0.4)
  ctx.fillStyle = '#fff'
  ctx.fillRect(mx + mw * SABOR_MIN_TO_ACTIVATE - 1, my - 3, 2, mh + 6)
  const label = s.saborActive ? '¡SABOR!' : s.sabor >= SABOR_MIN_TO_ACTIVATE ? 'SABOR — ¡ESPACIO!' : 'SABOR'
  bigText(ctx, label, l.w - 22, my + mh + 22, 14, ['#ffffff', '#ffe600'])

  // Progress
  const p = Math.max(0, Math.min(1, f.time / f.duration))
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, l.h - 5, l.w, 5)
  ctx.fillStyle = fire
  ctx.fillRect(0, l.h - 5, l.w * p, 5)
}

/** Darken a #rrggbb colour. */
function shade(hex: string, k = 0.45): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * k)
  const g = Math.round(((n >> 8) & 255) * k)
  const b = Math.round((n & 255) * k)
  return `rgb(${r},${g},${b})`
}

/** Red/yellow sunburst rays radiating from the horizon, turning with the music. */
function drawSunburst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  time: number,
  hot: boolean,
): void {
  const rays = 24
  const step = (Math.PI * 2) / rays
  const spin = time * 0.08
  ctx.save()
  for (let i = 0; i < rays; i++) {
    const a = spin + i * step
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, a, a + step / 2)
    ctx.closePath()
    ctx.fillStyle = i % 2 ? (hot ? 'rgba(255,230,0,0.22)' : 'rgba(255,230,0,0.12)') : hot ? 'rgba(228,0,43,0.3)' : 'rgba(228,0,43,0.16)'
    ctx.fill()
  }
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.35)
  glow.addColorStop(0, 'rgba(255,250,200,0.9)')
  glow.addColorStop(0.1, 'rgba(255,160,0,0.45)')
  glow.addColorStop(1, 'rgba(255,160,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  ctx.restore()
}
