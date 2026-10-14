import { useEffect, useRef, useState } from 'react'
import { audioContext, loadAudio, SongPlayer } from '../engine/audio'
import { SongTiming, timeChart } from '../engine/chart'
import { Judge, type Stats } from '../engine/judge'
import { LANE_COUNT, laneForCode } from '../engine/keys'
import type { CrowdScene } from '../render/crowd3d'
import { drawFrame, type Popup } from '../render/highway'
import type { Settings } from '../settings'
import type { Chart, Song } from '../songs/types'
import { useCanvasSize } from './useCanvasSize'

interface Props {
  song: Song
  chart: Chart
  settings: Settings
  onFinish: (stats: Stats) => void
  onQuit: () => void
}

const LEAD_IN = 2

export function Game({ song, chart, settings, onFinish, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crowdRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<CrowdScene | null>(null)
  const size = useCanvasSize(canvasRef)
  const [player, setPlayer] = useState<SongPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    let cancelled = false
    let p: SongPlayer | null = null
    loadAudio(import.meta.env.BASE_URL + song.audio)
      .then((buf) => {
        if (cancelled) return
        p = new SongPlayer(buf)
        p.setVolume(settings.volume)
        setPlayer(p)
      })
      .catch((e: unknown) => setError(String(e)))
    return () => {
      cancelled = true
      p?.dispose()
    }
  }, [song.audio, settings.volume])

  // The 3D crowd loads lazily; until it is ready (or if WebGL is missing) the 2D hall is drawn instead.
  useEffect(() => {
    let cancelled = false
    const canvas = crowdRef.current
    if (!canvas) return
    import('../render/crowd3d')
      .then(({ CrowdScene }) => {
        if (cancelled) return
        sceneRef.current = new CrowdScene(canvas)
      })
      .catch((e: unknown) => console.warn('3D crowd unavailable, using 2D backdrop', e))
    return () => {
      cancelled = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!player || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const timing = new SongTiming(song)
    const judge = new Judge(timeChart(chart, timing))
    const pressed: boolean[] = Array.from({ length: LANE_COUNT }, () => false)
    const popups: Popup[] = []
    const actx = audioContext()
    const offset = settings.offsetMs / 1000
    let done = false
    let raf = 0

    /** What the player is hearing right now, in song seconds. */
    const heardTime = () => player.currentTime - (actx.outputLatency || 0) * player.playbackRate
    const judgeTime = () => heardTime() - offset

    judge.onJudge((e) => {
      popups.push({ grade: e.grade, lane: e.lane, at: heardTime() })
      if (popups.length > 24) popups.shift()
    })

    const lastNote = judge.notes.length ? judge.notes[judge.notes.length - 1].end : 0
    const endTime = Math.min(player.duration, Math.max(lastNote + 3, 10))

    const finish = () => {
      if (done) return
      done = true
      player.pause()
      onFinish({ ...judge.stats })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        if (player.playing) {
          player.pause()
          setPaused(true)
        }
        return
      }
      if (!player.playing || e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        judge.activateSabor()
        return
      }
      const lane = laneForCode(e.code)
      if (lane < 0) return
      e.preventDefault()
      pressed[lane] = true
      judge.press(lane, judgeTime())
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const lane = laneForCode(e.code)
      if (lane < 0) return
      pressed[lane] = false
      judge.release(lane, judgeTime())
    }
    const onBlur = () => {
      if (player.playing) {
        player.pause()
        setPaused(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (player.playing) judge.update(judgeTime())
      const t = heardTime()
      const dpr = window.devicePixelRatio || 1
      const scene = sceneRef.current
      if (scene) {
        const w = canvas.width / dpr
        const h = canvas.height / dpr
        scene.resize(w, h)
        scene.render({
          time: t,
          beat: timing.tempo.timeToBeat(t),
          combo: judge.stats.combo,
          saborActive: judge.stats.saborActive,
        })
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawFrame(ctx, canvas.width / dpr, canvas.height / dpr, {
        time: t,
        duration: endTime,
        lookahead: settings.lookahead,
        notes: judge.notes,
        states: judge.states,
        tempo: timing.tempo,
        beatsPerBar: song.beatsPerBar,
        pressed,
        popups,
        stats: judge.stats,
        multiplier: judge.multiplier,
        hud: true,
        background: !scene,
      })
      if (player.playing && t >= endTime) finish()
    }
    raf = requestAnimationFrame(frame)

    player.setOnEnded(finish)
    setPaused(false)
    player.play(-LEAD_IN)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      player.setOnEnded(null)
      player.pause()
    }
  }, [player, song, chart, settings, onFinish, runId])

  const resume = () => {
    if (!player) return
    // Rewind slightly so the player can find the groove again.
    player.play(Math.max(-LEAD_IN, player.currentTime - 1.5))
    setPaused(false)
  }

  return (
    <div className="game">
      <canvas ref={crowdRef} className="crowd-canvas" />
      <canvas ref={canvasRef} className="game-canvas" width={size.w} height={size.h} />
      {!player && !error && <div className="overlay">Cargando…</div>}
      {error && (
        <div className="overlay">
          <p>No se pudo cargar el audio: {error}</p>
          <button onClick={onQuit}>Volver</button>
        </div>
      )}
      {paused && (
        <div className="overlay">
          <h2 className="chrome">Pausa</h2>
          <div className="stack">
            <button className="hot" autoFocus onClick={resume}>
              Seguir
            </button>
            <button onClick={() => setRunId((r) => r + 1)}>Reiniciar</button>
            <button onClick={onQuit}>Salir</button>
          </div>
        </div>
      )}
    </div>
  )
}
