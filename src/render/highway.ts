import { LANE_COLORS, LANE_COUNT, LANE_LABELS } from '../engine/keys'
import type { Grade, NoteState, Stats, TimedNote } from '../engine/judge'
import { SABOR_MIN_TO_ACTIVATE } from '../engine/judge'
import type { TempoMap } from '../engine/tempo'

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
}

const GRADE_TEXT: Record<Grade, string> = { perfect: '¡PERFECTO!', good: 'BIEN', miss: 'FALLO' }
const GRADE_COLOR: Record<Grade, string> = { perfect: '#ffe14d', good: '#4dffb8', miss: '#ff4d6a' }
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

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#12002b')
  bg.addColorStop(0.6, '#2a0040')
  bg.addColorStop(1, '#070012')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Highway body
  const leftEdge = -LANE_COUNT / 2 - HAND_GAP / 2
  const rightEdge = LANE_COUNT / 2 + HAND_GAP / 2
  ctx.beginPath()
  ctx.moveTo(l.cx + leftEdge * l.laneW * scaleAt(1), yAt(l, 1))
  ctx.lineTo(l.cx + rightEdge * l.laneW * scaleAt(1), yAt(l, 1))
  ctx.lineTo(l.cx + rightEdge * l.laneW * scaleAt(-0.12), yAt(l, -0.12))
  ctx.lineTo(l.cx + leftEdge * l.laneW * scaleAt(-0.12), yAt(l, -0.12))
  ctx.closePath()
  ctx.fillStyle = f.stats.saborActive ? 'rgba(255, 120, 40, 0.18)' : 'rgba(10, 0, 25, 0.75)'
  ctx.fill()

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
    ctx.beginPath()
    ctx.arc(x, l.hitY, r, 0, Math.PI * 2)
    ctx.fillStyle = f.pressed[i] ? LANE_COLORS[i] : 'rgba(0,0,0,0.6)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = LANE_COLORS[i]
    ctx.stroke()
    ctx.fillStyle = f.pressed[i] ? '#111' : '#fff'
    ctx.font = `bold ${Math.round(r * 0.8)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
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
    ctx.beginPath()
    ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2)
    ctx.fillStyle = dim ? '#555' : color
    ctx.fill()
    ctx.lineWidth = Math.max(1, 3 * s)
    ctx.strokeStyle = dim ? '#333' : '#fff'
    ctx.stroke()
    if (!dim) {
      ctx.beginPath()
      ctx.ellipse(x, y - rh * 0.2, rw * 0.45, rh * 0.35, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fill()
    }
  }

  // Judgement popups
  for (const p of f.popups) {
    const age = f.time - p.at
    if (age < 0 || age > 0.6) continue
    const alpha = 1 - age / 0.6
    ctx.globalAlpha = alpha
    ctx.fillStyle = GRADE_COLOR[p.grade]
    ctx.font = `bold ${Math.round(l.laneW * 0.32)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(GRADE_TEXT[p.grade], xAt(l, p.lane, 0), l.hitY - l.laneW * 0.7 - age * 60)
    ctx.globalAlpha = 1
  }

  if (f.hud) drawHud(ctx, l, f)
}

function drawHud(ctx: CanvasRenderingContext2D, l: Layout, f: FrameState): void {
  const s = f.stats
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText(Math.round(s.score).toLocaleString(), 20, 18)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillStyle = '#ffb3f0'
  ctx.fillText(`Combo ${s.combo}`, 20, 54)

  ctx.textAlign = 'right'
  ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.fillStyle = s.saborActive ? '#ff9a3d' : '#00e0ff'
  ctx.fillText(`×${f.multiplier}`, l.w - 20, 16)

  // Sabor meter
  const mw = 160
  const mx = l.w - 20 - mw
  const my = 60
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(mx, my, mw, 10)
  ctx.fillStyle = s.saborActive ? '#ff9a3d' : s.sabor >= SABOR_MIN_TO_ACTIVATE ? '#ffe14d' : '#b04dff'
  ctx.fillRect(mx, my, mw * s.sabor, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(mx + mw * SABOR_MIN_TO_ACTIVATE - 1, my - 2, 2, 14)
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(
    s.saborActive ? '¡SABOR!' : s.sabor >= SABOR_MIN_TO_ACTIVATE ? 'SABOR listo — ESPACIO' : 'SABOR',
    l.w - 20,
    76,
  )

  // Progress
  const p = Math.max(0, Math.min(1, f.time / f.duration))
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, l.h - 4, l.w, 4)
  ctx.fillStyle = '#ff3d7f'
  ctx.fillRect(0, l.h - 4, l.w * p, 4)
}
