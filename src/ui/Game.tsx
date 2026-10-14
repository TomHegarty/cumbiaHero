import { useEffect, useRef, useState } from 'react'
import { audioContext, loadSongTracks, SongPlayer } from '../engine/audio'
import { afterRound, SET_SIZE, type Health, type Side } from '../engine/battle'
import { CrowdFx } from '../engine/crowdfx'
import { SongTiming, timeChart } from '../engine/chart'
import { AiPlayer, BARS_PER_TURN, damageFor, splitChart, turnIndex, turnOrigin, type DuelResult } from '../engine/duel'
import { Judge, type JudgeEvent, type Stats, type TimedNote } from '../engine/judge'
import { LANE_COUNT, laneForCode } from '../engine/keys'
import { strings, useT } from '../i18n'
import type { RivalPlayer } from '../engine/remote'
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
  /** Your name on the versus banner. */
  youName?: string
  rivalName?: string
  /** Who plays the rival's notes; El Rayo unless given. Read once per run. */
  rival?: (notes: TimedNote[]) => RivalPlayer
  /** Each of your notes as it's judged, for streaming to an online rival. */
  onJudgeEvent?: (e: JudgeEvent) => void
  /**
   * Online: the moment (local clock, ms) the lead-in starts, shared with the
   * other player. Arriving late skips ahead to where the song should be. There
   * is no pausing online, since the other player's song keeps going.
   */
  startAt?: number
  onFinish: (stats: Stats, duel?: DuelResult) => void
  onQuit: () => void
}

const LEAD_IN = 2
const RIVAL_NAME = 'EL RAYO'
const RIVAL_SKILL = 0.85

export function Game({
  song,
  chart,
  settings,
  duel,
  round,
  youName = strings().you,
  rivalName = RIVAL_NAME,
  rival,
  onJudgeEvent,
  startAt,
  onFinish,
  onQuit,
}: Props) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crowdRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<CrowdScene | null>(null)
  const size = useCanvasSize(canvasRef)
  const [player, setPlayer] = useState<SongPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [runId, setRunId] = useState(0)
  const [quitAsk, setQuitAsk] = useState(false)
  const online = startAt !== undefined
  // Callbacks the run reads without restarting when they change identity
  const live = useRef({ rival, onJudgeEvent })
  useEffect(() => {
    live.current = { rival, onJudgeEvent }
  }, [rival, onJudgeEvent])

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
    const rivalNotes = timeChart(rivalPart, timing)
    const ai: RivalPlayer = live.current.rival?.(rivalNotes) ?? new AiPlayer(rivalNotes, RIVAL_SKILL)
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
      live.current.onJudgeEvent?.(e)
      leadFollows(e.grade)
      if (e.grade === 'miss') missAt = heardTime()
      youDealt += damageFor(e.grade)
      popup(e.grade, e.lane)
    })
    let aiCombo = 0
    ai.onJudge((e) => {
      aiCombo = e.grade === 'miss' ? 0 : aiCombo + 1
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

    // The crowd: a big cheer as each player starts their turn, then claps on the beat while the room is hot
    const fx = versus ? new CrowdFx(actx, player.output) : null
    const cheerBeats: number[] = []
    if (versus) {
      if (round) cheerBeats.push(origin)
      else for (let b = origin; b <= lastBeat; b += turnBeats) cheerBeats.push(b)
    }
    let cheerCursor = 0
    let nextClap = -Infinity
    let hypeAt = -Infinity
    /** Schedules crowd sounds due in the next moment, on the audio clock so they land in time. */
    const scheduleCrowd = (t: number, turn: ReturnType<typeof turnAt>) => {
      if (!fx) return
      const ahead = t + 0.15
      while (cheerCursor < cheerBeats.length && timing.tempo.beatToTime(cheerBeats[cheerCursor]) <= ahead) {
        const at = timing.tempo.beatToTime(cheerBeats[cheerCursor++])
        // Skip cheers already behind us (after a resume)
        if (at < t - 0.1) continue
        fx.cheer(player.contextTime(at))
        hypeAt = at
      }
      const combo = turn.active === 'rival' ? aiCombo : judge.stats.combo
      const beatNow = timing.tempo.timeToBeat(t)
      nextClap = Math.max(nextClap, Math.ceil(beatNow))
      while (timing.tempo.beatToTime(nextClap) <= ahead) {
        const at = timing.tempo.beatToTime(nextClap)
        const hot = combo >= 8 || at - hypeAt < (60 / song.tempo[0].bpm) * bpb * 2
        if (turn.active && hot) fx.clap(player.contextTime(at), Math.min(1, 0.45 + combo / 30))
        nextClap++
      }
    }

    /** Announce each turn as it starts, and warn you a bar before yours. */
    const callout = (beat: number, turn: ReturnType<typeof turnAt>) => {
      const t = heardTime()
      const warnBeat = turn.start + turnBeats - bpb
      if (turn.youNext && turn.active !== 'you' && beat >= warnBeat) {
        return { text: strings().calloutReady, age: t - timing.tempo.beatToTime(warnBeat), hot: true }
      }
      if (!turn.active) return undefined
      const age = t - timing.tempo.beatToTime(turn.start)
      return turn.active === 'you'
        ? { text: strings().calloutYou, age, hot: true }
        : { text: strings().calloutRival(rivalName), age, hot: false }
    }

    const finish = () => {
      if (done) return
      done = true
      player.pause()
      onFinish({ ...judge.stats }, versus ? { youName, rivalName, you: youHp(), rival: rivalHp() } : undefined)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        if (online) {
          setQuitAsk((q) => !q)
          return
        }
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
      if (!online && player.playing) {
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
      if (player.playing) scheduleCrowd(t, turn)
      const dpr = window.devicePixelRatio || 1
      const scene = sceneRef.current
      if (scene) {
        const w = canvas.width / dpr
        const h = canvas.height / dpr
        scene.resize(w, h)
        scene.render({
          time: t,
          beat,
          combo: turn.active === 'rival' ? aiCombo : judge.stats.combo,
          saborActive: judge.stats.saborActive,
          missAt,
          rivalMissAt,
          turn: versus ? (turn.active ?? undefined) : undefined,
          hypeAt,
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
          youName,
          rivalName,
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
    let startTimer = 0
    if (startAt === undefined) player.play(-LEAD_IN)
    else {
      const wait = startAt - Date.now()
      if (wait > 0) startTimer = window.setTimeout(() => player.play(-LEAD_IN), wait)
      else player.play(-LEAD_IN - (wait / 1000) * player.playbackRate)
    }

    return () => {
      clearTimeout(startTimer)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      player.setOnEnded(null)
      player.pause()
      fx?.dispose()
    }
  }, [player, song, chart, settings, duel, round, youName, rivalName, startAt, online, onFinish, runId])

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
      {!player && !error && <div className="overlay">{t.loading}</div>}
      {error && (
        <div className="overlay">
          <p>{t.audioError(error)}</p>
          <button onClick={onQuit}>{t.back}</button>
        </div>
      )}
      {quitAsk && (
        <div className="overlay quit-ask">
          <h2 className="chrome">{t.quitAsk}</h2>
          <p className="hint">{t.quitHint}</p>
          <div className="stack">
            <button className="hot" autoFocus onClick={() => setQuitAsk(false)}>
              {t.keepPlaying}
            </button>
            <button onClick={onQuit}>{t.forfeit}</button>
          </div>
        </div>
      )}
      {paused && (
        <div className="overlay">
          <h2 className="chrome">{t.pause}</h2>
          <div className="stack">
            <button className="hot" autoFocus onClick={resume}>
              {t.resume}
            </button>
            <button onClick={() => setRunId((r) => r + 1)}>{t.restart}</button>
            <button onClick={onQuit}>{t.quit}</button>
          </div>
        </div>
      )}
    </div>
  )
}
