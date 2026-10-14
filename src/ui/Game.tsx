import { useEffect, useRef, useState } from 'react'
import { audioContext, loadSongTracks, SongPlayer } from '../engine/audio'
import { afterRound, SET_SIZE, type Health, type Side } from '../engine/battle'
import { SongTiming, timeChart } from '../engine/chart'
import { AiPlayer, BARS_PER_TURN, damageFor, splitChart, turnIndex, turnOrigin, type DuelResult } from '../engine/duel'
import { Judge, type Stats } from '../engine/judge'
import { LANE_COUNT, laneForCode } from '../engine/keys'
import type { CrowdScene } from '../render/crowd3d'
import { drawFrame, type Popup } from '../render/highway'
import { drawVersus } from '../render/versus'
import type { Settings } from '../settings'
import type { Chart, Song } from '../songs/types'
import { useCanvasSize } from './useCanvasSize'

/** One turn of a set-list battle: a single duelist plays the whole melody. */
export interface RoundSpec {
  owner: Side
  /** Health going into the round. */
  hp: Health
}

interface Props {
  song: Song
  chart: Chart
  settings: Settings
  /** Take turns against the AI; off for editor test plays, where you play the whole chart. */
  duel: boolean
  /** Set-list battle turn; overrides `duel`'s phrase-by-phrase turns. */
  round?: RoundSpec
  onFinish: (stats: Stats, duel?: DuelResult) => void
  onQuit: () => void
}

const LEAD_IN = 2
const YOU_NAME = 'VOS'
const RIVAL_NAME = 'EL RAYO'
const RIVAL_SKILL = 0.85

export function Game({ song, chart, settings, duel, round, onFinish, onQuit }: Props) {
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
    loadSongTracks(song)
      .then(({ main, lead }) => {
        if (cancelled) return
        p = new SongPlayer(main, undefined, lead)
        p.setVolume(settings.volume)
        setPlayer(p)
      })
      .catch((e: unknown) => setError(String(e)))
    return () => {
      cancelled = true
      p?.dispose()
    }
  }, [song, settings.volume])

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
    // In a duel you and the rival take alternating phrases; you only play (and score) yours.
    // In a set-list battle round one side plays the whole melody.
    const bpb = song.beatsPerBar
    const origin = turnOrigin(chart, bpb)
    const versus = duel || !!round
    const empty = { ...chart, notes: [] }
    const [yourPart, rivalPart] = round
      ? round.owner === 'you'
        ? [chart, empty]
        : [empty, chart]
      : duel
        ? splitChart(chart, bpb, 2)
        : [chart, empty]
    const judge = new Judge(timeChart(yourPart, timing))
    const ai = new AiPlayer(timeChart(rivalPart, timing), RIVAL_SKILL)
    const aiPressed: boolean[] = Array.from({ length: LANE_COUNT }, () => false)
    const shown: boolean[] = Array.from({ length: LANE_COUNT }, () => false)
    const pressed: boolean[] = Array.from({ length: LANE_COUNT }, () => false)
    const popups: Popup[] = []
    const actx = audioContext()
    const offset = settings.offsetMs / 1000
    let done = false
    let raf = 0

    /** What the player is hearing right now, in song seconds. */
    const heardTime = () => player.currentTime - (actx.outputLatency || 0) * player.playbackRate
    const judgeTime = () => heardTime() - offset

    // Duel health: every note you land in your turn chips the rival's bar, and theirs chips yours,
    // so a flawless set of turns empties the other side
    let youDealt = 0
    let rivalDealt = 0
    let missAt = -Infinity
    let rivalMissAt = -Infinity
    // A battle round can take at most 1/SET_SIZE of a bar, starting from where the last round left it
    const setSize = round ? SET_SIZE : 1
    const startHp = round?.hp ?? { you: 1, rival: 1 }
    let youTrail = startHp.you
    let rivalTrail = startHp.rival
    const youHp = () => afterRound(startHp, 'rival', rivalDealt, ai.notes.length, setSize).you
    const rivalHp = () => afterRound(startHp, 'you', youDealt, judge.notes.length, setSize).rival
    const popup = (grade: Popup['grade'], lane: number) => {
      popups.push({ grade, lane, at: heardTime() })
      if (popups.length > 24) popups.shift()
    }

    // With the lead synth on its own track, it drops out on a miss and comes back on the next hit
    player.setLeadLevel(1)
    const leadFollows = (grade: Popup['grade']) => player.setLeadLevel(grade === 'miss' ? 0.08 : 1)
    judge.onJudge((e) => {
      leadFollows(e.grade)
      if (e.grade === 'miss') missAt = heardTime()
      youDealt += damageFor(e.grade)
      popup(e.grade, e.lane)
    })
    ai.onJudge((e) => {
      leadFollows(e.grade)
      if (e.grade === 'miss') rivalMissAt = heardTime()
      rivalDealt += damageFor(e.grade)
      popup(e.grade, e.lane)
    })

    const lastNote = Math.max(
      judge.notes.length ? judge.notes[judge.notes.length - 1].end : 0,
      ai.notes.length ? ai.notes[ai.notes.length - 1].end : 0,
    )
    const lastBeat = timing.tempo.timeToBeat(lastNote)
    const turnBeats = bpb * BARS_PER_TURN
    /** Whose turn it is at `beat`, which beat it began on, and whether you are up next. */
    const turnAt = (beat: number) => {
      if (round) return { active: round.owner as Side | null, start: origin, youNext: false }
      const i = turnIndex(beat, bpb, origin)
      const start = origin + i * turnBeats
      const active: 'you' | 'rival' | null = i < 0 || start > lastBeat ? null : i % 2 === 0 ? 'you' : 'rival'
      return { active, start, youNext: (i === -1 || (i >= 0 && i % 2 === 1)) && start + turnBeats <= lastBeat }
    }
    const endTime = Math.min(player.duration, Math.max(lastNote + 3, 10))

    /** Announce each turn as it starts, and warn you a bar before yours. */
    const callout = (beat: number, turn: ReturnType<typeof turnAt>) => {
      const t = heardTime()
      const warnBeat = turn.start + turnBeats - bpb
      if (turn.youNext && turn.active !== 'you' && beat >= warnBeat) {
        return { text: '¡PREPARATE!', age: t - timing.tempo.beatToTime(warnBeat), hot: true }
      }
      if (!turn.active) return undefined
      const age = t - timing.tempo.beatToTime(turn.start)
      return turn.active === 'you'
        ? { text: '¡TU TURNO!', age, hot: true }
        : { text: `TURNO DE ${RIVAL_NAME}`, age, hot: false }
    }

    const finish = () => {
      if (done) return
      done = true
      player.pause()
      onFinish({ ...judge.stats }, versus ? { rivalName: RIVAL_NAME, you: youHp(), rival: rivalHp() } : undefined)
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
      const t = heardTime()
      if (player.playing) {
        judge.update(judgeTime())
        ai.update(t)
      }
      ai.pressedAt(t, aiPressed)
      for (let i = 0; i < LANE_COUNT; i++) shown[i] = pressed[i] || aiPressed[i]
      const beat = timing.tempo.timeToBeat(t)
      const turn = turnAt(beat)
      const dpr = window.devicePixelRatio || 1
      const scene = sceneRef.current
      if (scene) {
        const w = canvas.width / dpr
        const h = canvas.height / dpr
        scene.resize(w, h)
        scene.render({
          time: t,
          beat,
          combo: judge.stats.combo,
          saborActive: judge.stats.saborActive,
          missAt,
          rivalMissAt,
          turn: versus ? (turn.active ?? undefined) : undefined,
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
        pressed: shown,
        popups,
        stats: judge.stats,
        multiplier: judge.multiplier,
        hud: true,
        background: !scene,
        ghosts: [{ notes: ai.notes, states: ai.states }],
        idle: versus && turn.active === 'rival',
      })
      if (versus) {
        const you = youHp()
        const rival = rivalHp()
        youTrail = Math.max(you, youTrail - 0.006)
        rivalTrail = Math.max(rival, rivalTrail - 0.006)
        drawVersus(ctx, canvas.width / dpr, {
          youName: YOU_NAME,
          rivalName: RIVAL_NAME,
          you,
          rival,
          youTrail,
          rivalTrail,
          secondsLeft: endTime - t,
          active: turn.active,
          callout: callout(beat, turn),
        })
      }
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
  }, [player, song, chart, settings, duel, round, onFinish, runId])

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
