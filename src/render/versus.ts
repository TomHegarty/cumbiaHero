/**
 * Fighting-game banner across the top of the highway, as in the keyboard-battle
 * clips: both players' names, chrome-framed health bars with a red damage trail,
 * and the seconds left in the song in the middle.
 */

export interface VersusState {
  youName: string
  rivalName: string
  /** Current health, 0..1. */
  you: number
  rival: number
  /** Lagging health shown as the red damage trail, 0..1. */
  youTrail: number
  rivalTrail: number
  secondsLeft: number
}

const FONT = "'Bungee', 'Arial Black', Impact, sans-serif"

export function drawVersus(ctx: CanvasRenderingContext2D, w: number, v: VersusState): void {
  const bw = Math.min(w * 0.5, 620)
  const x0 = (w - bw) / 2
  const y = 14
  const barH = 16
  const gap = 58
  const half = (bw - gap) / 2

  ctx.save()
  // Bars empty from the timer outwards, as in the arcade games
  bar(ctx, x0, y + 6, half, barH, v.you, v.youTrail, false)
  bar(ctx, x0 + half + gap, y + 6, half, barH, v.rival, v.rivalTrail, true)

  // Timer badge
  const cx = w / 2
  const cy = y + 6 + barH / 2
  ctx.beginPath()
  ctx.arc(cx, cy, 24, 0, Math.PI * 2)
  ctx.fillStyle = '#140204'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffe600'
  ctx.stroke()
  const secs = String(Math.max(0, Math.ceil(v.secondsLeft)))
  ctx.font = `${secs.length > 2 ? 15 : 20}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(secs, cx, cy + 1)

  // Title tucked under the timer
  ctx.font = `10px ${FONT}`
  ctx.textBaseline = 'top'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#000'
  ctx.strokeText('DUELO DE TECLADISTAS', cx, cy + 28)
  ctx.fillStyle = '#ffe600'
  ctx.fillText('DUELO DE TECLADISTAS', cx, cy + 28)

  // Names under the bars
  ctx.font = `14px ${FONT}`
  ctx.textBaseline = 'top'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#000'
  ctx.textAlign = 'left'
  ctx.strokeText(v.youName, x0, y + 6 + barH + 5)
  ctx.fillStyle = '#ffe600'
  ctx.fillText(v.youName, x0, y + 6 + barH + 5)
  ctx.textAlign = 'right'
  ctx.strokeText(v.rivalName, x0 + bw, y + 6 + barH + 5)
  ctx.fillStyle = '#ff5a5a'
  ctx.fillText(v.rivalName, x0 + bw, y + 6 + barH + 5)
  ctx.restore()
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  trail: number,
  anchorRight: boolean,
): void {
  // Chrome frame
  const frame = ctx.createLinearGradient(0, y - 3, 0, y + h + 3)
  frame.addColorStop(0, '#ffffff')
  frame.addColorStop(0.5, '#8a96a8')
  frame.addColorStop(1, '#f2f2f2')
  ctx.fillStyle = '#000'
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8)
  ctx.fillStyle = frame
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6)
  ctx.fillStyle = '#2a0008'
  ctx.fillRect(x, y, w, h)

  const span = (v: number) => {
    const len = w * Math.max(0, Math.min(1, v))
    return anchorRight ? [x + w - len, len] : [x, len]
  }
  const [tx, tw] = span(trail)
  ctx.fillStyle = '#e4002b'
  ctx.fillRect(tx, y, tw, h)
  const [hx, hw] = span(hp)
  const fill = ctx.createLinearGradient(0, y, 0, y + h)
  fill.addColorStop(0, '#fff6a0')
  fill.addColorStop(0.45, '#ffe600')
  fill.addColorStop(1, '#ff9d00')
  ctx.fillStyle = hp < 0.25 ? '#ff7a00' : fill
  ctx.fillRect(hx, y, hw, h)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(hx, y + 1, hw, 3)
}
