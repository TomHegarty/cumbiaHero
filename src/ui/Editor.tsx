import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAudio, SongPlayer } from '../engine/audio'
import { SongTiming } from '../engine/chart'
import { LANE_COLORS, LANE_COUNT, LANE_LABELS, laneForCode } from '../engine/keys'
import type { Chart, ChartNote, Song } from '../songs/types'
import { useCanvasSize } from './useCanvasSize'

interface Props {
  song: Song
  chart: Chart
  onTest: (chart: Chart) => void
  onBack: (chart: Chart) => void
}

const SNAPS = [
  { label: '1/1', div: 1 },
  { label: '1/2', div: 2 },
  { label: '1/3', div: 3 },
  { label: '1/4', div: 4 },
]

const round = (x: number) => Math.round(x * 1000) / 1000

function sortNotes(notes: ChartNote[]): ChartNote[] {
  return [...notes].sort((a, b) => a.b - b.b || a.l - b.l)
}

/**
 * Chart editor: scrub the song, click to add/remove notes, drag for holds,
 * or press Record and play along on the home row.
 */
export function Editor({ song, chart, onTest, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useCanvasSize(canvasRef)
  const timing = useMemo(() => new SongTiming(song), [song])
  const tempo = timing.tempo
  const [player, setPlayer] = useState<SongPlayer | null>(null)
  const [notes, setNotes] = useState<ChartNote[]>(() => sortNotes(chart.notes))
  const [snap, setSnap] = useState(2)
  const [rate, setRate] = useState(1)
  const [zoom, setZoom] = useState(8)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const history = useRef<ChartNote[][]>([])
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])
  /** Beat at the playhead while paused. */
  const cursorBeat = useRef(0)

  const commit = (next: ChartNote[]) => {
    history.current.push(notesRef.current)
    if (history.current.length > 200) history.current.shift()
    setNotes(sortNotes(next))
  }

  const snapBeat = (b: number) => round(Math.round(b * snap) / snap)

  useEffect(() => {
    let p: SongPlayer | null = null
    let cancelled = false
    void loadAudio(import.meta.env.BASE_URL + song.audio).then((buf) => {
      if (cancelled) return
      p = new SongPlayer(buf)
      p.setOnEnded(() => setPlaying(false))
      setPlayer(p)
    })
    return () => {
      cancelled = true
      p?.dispose()
    }
  }, [song.audio])

  useEffect(() => {
    player?.setPlaybackRate(rate)
  }, [player, rate])

  const currentBeat = () =>
    player?.playing ? tempo.timeToBeat(player.currentTime) : cursorBeat.current

  const togglePlay = () => {
    if (!player) return
    if (player.playing) {
      player.pause()
      cursorBeat.current = tempo.timeToBeat(player.currentTime)
      setPlaying(false)
    } else {
      player.play(Math.max(0, tempo.beatToTime(cursorBeat.current)))
      setPlaying(true)
    }
  }

  // Keyboard: transport, undo, and recording on the home row.
  useEffect(() => {
    const down = new Map<number, number>()
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
        return
      }
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        const prev = history.current.pop()
        if (prev) setNotes(prev)
        return
      }
      const lane = laneForCode(e.code)
      if (lane < 0 || e.repeat || !recording || !player?.playing) return
      e.preventDefault()
      down.set(lane, player.currentTime)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const lane = laneForCode(e.code)
      const start = down.get(lane)
      if (start === undefined || !player) return
      down.delete(lane)
      const b = round(timing.snap(start, snap))
      const endB = round(timing.snap(player.currentTime, snap))
      const d = endB - b >= 1 ? round(endB - b) : undefined
      const rest = notesRef.current.filter((n) => !(n.l === lane && Math.abs(n.b - b) < 1e-3))
      commit([...rest, d ? { b, l: lane, d } : { b, l: lane }])
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#1a0306'
      ctx.fillRect(0, 0, w, h)
      const laneW = Math.min(70, (w - 80) / LANE_COUNT)
      const x0 = (w - laneW * LANE_COUNT) / 2
      const playY = h * 0.8
      const pxPerBeat = h / zoom
      const now = currentBeat()
      const yOf = (b: number) => playY - (b - now) * pxPerBeat

      for (let i = 0; i < LANE_COUNT; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)'
        ctx.fillRect(x0 + i * laneW, 0, laneW, h)
      }
      const firstB = Math.floor(now - (h - playY) / pxPerBeat) - 1
      const lastB = Math.ceil(now + playY / pxPerBeat) + 1
      for (let b = Math.max(0, firstB) * snap; b <= lastB * snap; b++) {
        const beat = b / snap
        const y = yOf(beat)
        const isBeat = b % snap === 0
        const isBar = isBeat && beat % song.beatsPerBar === 0
        ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.4)' : isBeat ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'
        ctx.beginPath()
        ctx.moveTo(x0, y)
        ctx.lineTo(x0 + laneW * LANE_COUNT, y)
        ctx.stroke()
        if (isBar) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.font = '11px system-ui'
          ctx.textAlign = 'right'
          ctx.fillText(String(beat / song.beatsPerBar + 1), x0 - 6, y + 4)
        }
      }
      for (const n of notesRef.current) {
        if (n.b + (n.d ?? 0) < firstB || n.b > lastB) continue
        const x = x0 + n.l * laneW
        if (n.d) {
          ctx.fillStyle = LANE_COLORS[n.l] + '88'
          ctx.fillRect(x + laneW * 0.35, yOf(n.b + n.d), laneW * 0.3, n.d * pxPerBeat)
        }
        ctx.fillStyle = LANE_COLORS[n.l]
        ctx.fillRect(x + 4, yOf(n.b) - 5, laneW - 8, 10)
      }
      ctx.strokeStyle = recording ? '#ff3d3d' : '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x0 - 10, playY)
      ctx.lineTo(x0 + laneW * LANE_COUNT + 10, playY)
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 13px system-ui'
      ctx.textAlign = 'center'
      for (let i = 0; i < LANE_COUNT; i++) ctx.fillText(LANE_LABELS[i], x0 + (i + 0.5) * laneW, h - 10)
      ctx.textAlign = 'left'
      ctx.fillText(
        `bar ${Math.floor(now / song.beatsPerBar) + 1} · beat ${(now % song.beatsPerBar + 1).toFixed(2)}`,
        10,
        20,
      )
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  })

  // Mouse editing.
  const drag = useRef<{ lane: number; b: number } | null>(null)
  const hit = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    const w = r.width
    const h = r.height
    const laneW = Math.min(70, (w - 80) / LANE_COUNT)
    const x0 = (w - laneW * LANE_COUNT) / 2
    const lane = Math.floor((e.clientX - r.left - x0) / laneW)
    const b = currentBeat() + (h * 0.8 - (e.clientY - r.top)) / (h / zoom)
    return { lane, b }
  }
  const onMouseDown = (e: React.MouseEvent) => {
    const { lane, b } = hit(e)
    if (lane < 0 || lane >= LANE_COUNT) return
    const existing = notesRef.current.find(
      (n) => n.l === lane && b >= n.b - 0.5 / snap && b <= n.b + Math.max(n.d ?? 0, 0) + 0.5 / snap,
    )
    if (existing) {
      commit(notesRef.current.filter((n) => n !== existing))
      return
    }
    drag.current = { lane, b: snapBeat(b) }
  }
  const onMouseUp = (e: React.MouseEvent) => {
    const start = drag.current
    drag.current = null
    if (!start) return
    const end = snapBeat(hit(e).b)
    const d = end - start.b >= 0.5 ? round(end - start.b) : undefined
    commit([...notesRef.current, d ? { b: start.b, l: start.lane, d } : { b: start.b, l: start.lane }])
  }
  const onWheel = (e: React.WheelEvent) => {
    if (player?.playing) return
    cursorBeat.current = Math.max(0, cursorBeat.current - e.deltaY / 100 / (8 / zoom))
  }

  const current: Chart = { ...chart, source: 'hand-charted', notes }
  const json = JSON.stringify(current)

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${song.id}.${chart.name.toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="editor">
      <div className="toolbar">
        <button onClick={() => onBack(current)}>← Menú</button>
        <button onClick={togglePlay} disabled={!player}>
          {playing ? 'Pause' : 'Play'} (Space)
        </button>
        <button className={recording ? 'rec on' : 'rec'} onClick={() => setRecording((r) => !r)}>
          ● Rec
        </button>
        <label>
          Snap
          <select value={snap} onChange={(e) => setSnap(Number(e.target.value))}>
            {SNAPS.map((s) => (
              <option key={s.div} value={s.div}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speed
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {[0.5, 0.75, 1].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
        <label>
          Zoom
          <input type="range" min={2} max={32} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        <span className="meta">{notes.length} notes</span>
        <button onClick={() => onTest(current)} disabled={notes.length === 0}>
          Test play
        </button>
        <button onClick={download}>Download JSON</button>
        <button onClick={() => void navigator.clipboard.writeText(json)}>Copy JSON</button>
      </div>
      <canvas
        ref={canvasRef}
        className="editor-canvas"
        width={size.w}
        height={size.h}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
      />
      <p className="hint">
        Scroll to move · click to add/remove · drag up for a hold · Rec + play to record on the home row · Ctrl+Z
        undo · save the JSON to <code>src/songs/{song.id}/</code>
      </p>
    </div>
  )
}
