import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { afterRound, battleOver, sumStats, type Health, type Side } from '../engine/battle'
import { damageFor, type DuelResult } from '../engine/duel'
import type { Grade, JudgeEvent, Stats, TimedNote } from '../engine/judge'
import { RemotePlayer } from '../engine/remote'
import { melodyById } from '../melodies'
import { FORFEIT_MS, ROUND_INTRO_MS, type Lobby, type RoundResult, type Seat, type WireHit } from '../net/types'
import type { Settings } from '../settings'
import { Backdrop } from './Backdrop'
import { Game, type RoundSpec } from './Game'
import type { OnlineMatch } from './useLobby'

interface Props {
  match: OnlineMatch
  youName: string
  settings: Settings
  onDone: (stats: Stats, duel: DuelResult, rivalName: string, forfeit: boolean) => void
  onQuit: () => void
}

/** How early the game mounts before its lead-in, so the audio is ready on the beat. */
const MOUNT_EARLY_MS = 1500
const HIT_FLUSH_MS = 100

const toWire: Record<Grade, WireHit['g']> = { perfect: 'p', good: 'g', miss: 'm' }
const fromWire: Record<WireHit['g'], Grade> = { p: 'perfect', g: 'good', m: 'miss' }

const statsOf = (r: RoundResult): Stats => ({
  score: r.score,
  combo: 0,
  maxCombo: r.maxCombo,
  perfect: r.perfect,
  good: r.good,
  miss: r.miss,
  total: r.notes,
  sabor: 0,
  saborActive: false,
})

/**
 * A set-list battle against a player in another browser. Both play the same
 * round on a shared clock: the round's player judges their own notes and
 * streams them, the other watches them land. Health comes from each round's
 * reported result, so both screens agree on it.
 */
export function OnlineBattle({ match, youName, settings, onDone, onQuit }: Props) {
  const { handle } = match
  const [lobby, setLobby] = useState<Lobby>(match.lobby)
  const [now, setNow] = useState(() => match.serverNow())
  // The last round this browser has finished playing or watching
  const [finished, setFinished] = useState(-1)
  const doneRef = useRef(false)

  useEffect(() => handle.watch((l) => l && setLobby(l)), [handle])
  useEffect(() => {
    const id = window.setInterval(() => setNow(match.serverNow()), 200)
    return () => clearInterval(id)
  }, [match])
  // Leaving the screen gives up the seat; the other side sees that as a forfeit.
  // Deferred a tick, so React's development double-mount doesn't leave for real.
  const leaving = useRef(0)
  useEffect(() => {
    clearTimeout(leaving.current)
    return () => {
      leaving.current = window.setTimeout(() => void handle.leave(), 0)
    }
  }, [handle])

  const order = useMemo(() => lobby.battle?.order ?? [], [lobby.battle?.order])
  const index = lobby.battle?.round ?? 0
  const startAt = lobby.battle?.startAt ?? 0
  const rivalSeat: Seat | undefined = lobby.players?.[handle.seat === 'host' ? 'guest' : 'host']
  const rivalName = rivalSeat?.name ?? 'RIVAL'
  const sideOf = useCallback((n: number): Side => (order[n]?.uid === handle.uid ? 'you' : 'rival'), [order, handle.uid])
  const resultOf = (n: number): RoundResult | undefined => lobby.rounds?.[n]?.result

  // Health after every round with a result so far
  const hpBefore = (n: number): Health => {
    let hp: Health = { you: 1, rival: 1 }
    for (let i = 0; i < n; i++) {
      const r = resultOf(i)
      if (r) hp = afterRound(hp, sideOf(i), r.dealt, r.notes)
    }
    return hp
  }
  const hp = hpBefore(index)
  const result = resultOf(index)
  const hpAfter = result ? afterRound(hp, sideOf(index), result.dealt, result.notes) : hp
  const over = !!result && finished >= index && battleOver(hpAfter, index + 1, order.length)

  const end = (final: Health, forfeit = false) => {
    if (doneRef.current) return
    doneRef.current = true
    const mine = order.flatMap((o, i) => {
      const r = resultOf(i)
      return o.uid === handle.uid && r ? [statsOf(r)] : []
    })
    onDone(sumStats(mine), { youName, rivalName, you: final.you, rival: final.rival }, rivalName, forfeit)
  }

  // Once this round is settled on both counts, finish or (host) move to the next
  useEffect(() => {
    if (!result || finished < index) return
    if (over) {
      if (handle.seat === 'host') void handle.finish().catch(() => {})
      end(hpAfter)
      return
    }
    if (handle.seat === 'host' && lobby.battle?.round === index) {
      void handle.nextRound(index + 1, match.serverNow() + ROUND_INTRO_MS).catch(() => {})
    }
    // end/hpAfter derive from the same lobby snapshot as result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, finished, index, over])

  // A rival who drops out (or walks away) for long enough forfeits
  const rivalGone = !rivalSeat || rivalSeat.connected === false || lobby.status === 'closed'
  useEffect(() => {
    if (!rivalGone) return
    const id = window.setTimeout(() => end({ ...hpBefore(index), rival: 0 }, true), FORFEIT_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivalGone])

  // Your notes go out in small batches while you play
  const outbox = useRef<WireHit[]>([])
  const flush = useCallback(
    (round: number) => {
      const hits = outbox.current.splice(0)
      if (hits.length) void handle.sendHits(round, hits).catch(() => {})
    },
    [handle],
  )
  const yours = sideOf(index) === 'you'
  useEffect(() => {
    if (!yours) return
    outbox.current = []
    const id = window.setInterval(() => flush(index), HIT_FLUSH_MS)
    return () => {
      clearInterval(id)
      flush(index)
    }
  }, [yours, index, flush])
  const onJudgeEvent = useCallback((e: JudgeEvent) => {
    outbox.current.push({ i: e.index, g: toWire[e.grade] })
  }, [])

  // Their notes arrive here; the highway's RemotePlayer is built once the game has the chart
  const remote = useRef<{ round: number; player: RemotePlayer | null; queue: WireHit[] }>({ round: -1, player: null, queue: [] })
  useEffect(() => {
    if (yours) return
    remote.current = { round: index, player: null, queue: [] }
    return handle.watchHits(index, (h) => {
      const r = remote.current
      if (r.round !== index) return
      if (r.player) r.player.receive(h.i, fromWire[h.g])
      else r.queue.push(h)
    })
  }, [yours, index, handle])
  const rivalFactory = useCallback((notes: TimedNote[]) => {
    const r = remote.current
    const player = new RemotePlayer(notes)
    for (const h of r.queue.splice(0)) player.receive(h.i, fromWire[h.g])
    r.player = player
    return player
  }, [])

  const onFinish = useCallback(
    (s: Stats) => {
      if (yours) {
        flush(index)
        const dealt = s.perfect * damageFor('perfect') + s.good * damageFor('good')
        void handle
          .sendResult(index, {
            dealt,
            notes: s.total,
            score: Math.round(s.score),
            perfect: s.perfect,
            good: s.good,
            miss: s.miss,
            maxCombo: s.maxCombo,
          })
          .catch(() => {})
      }
      setFinished(index)
    },
    [yours, index, flush, handle],
  )

  const spec = useMemo<RoundSpec>(
    () => ({ owner: yours ? 'you' : 'rival', hp: { you: hp.you, rival: hp.rival } }),
    [yours, hp.you, hp.rival],
  )
  // Local time of the shared start, so both songs line up. Fixed per round: the game restarts if it changes.
  const localStart = useMemo(() => startAt - (match.serverNow() - Date.now()), [startAt, match])
  const melody = melodyById(order[index]?.melodyId ?? '')
  if (!melody || doneRef.current) return null

  const playing = finished < index && now >= startAt - MOUNT_EARLY_MS

  if (playing) {
    return (
      <Game
        key={index}
        song={melody.song}
        chart={melody.chart}
        settings={settings}
        duel
        round={spec}
        youName={youName}
        rivalName={rivalName}
        rival={yours ? undefined : rivalFactory}
        onJudgeEvent={yours ? onJudgeEvent : undefined}
        startAt={localStart}
        onFinish={onFinish}
        onQuit={onQuit}
      />
    )
  }

  const pct = (v: number) => `${Math.round(Math.max(0, v) * 100)}%`
  const waiting = finished >= index
  const secs = Math.max(0, Math.ceil((startAt - MOUNT_EARLY_MS - now) / 1000))
  const setColumn = (name: string, side: Side) => (
    <div className={`side ${side}`}>
      <div className="who">
        {name} <span>{pct(hp[side])}</span>
      </div>
      <ol>
        {order.flatMap((o, i) =>
          sideOf(i) === side ? (
            <li key={i} className={i === index ? 'now' : i < index ? 'done' : undefined}>
              {melodyById(o.melodyId)?.title}
            </li>
          ) : [],
        )}
      </ol>
    </div>
  )

  return (
    <>
      <Backdrop />
      <div className="panel round-intro">
        <p className="subtitle">
          Ronda {index + 1} de {order.length} · online
        </p>
        <h2 className={yours ? 'gold' : 'chrome'}>{yours ? '¡Tu turno!' : `Turno de ${rivalName}`}</h2>
        <p className="now-playing">
          <b>{melody.title}</b> — {melody.artist}
          <br />
          <span>
            {melody.part}
            {melody.demo && ' · demo'}
          </span>
        </p>
        <div className="sets">
          {setColumn(youName, 'you')}
          <div className="vs">VS</div>
          {setColumn(rivalName, 'rival')}
        </div>
        <p className="round-clock" role="status">
          {waiting ? 'Esperando el resultado…' : rivalGone ? `${rivalName} se desconectó…` : secs > 0 ? `Arranca en ${secs}` : '¡Ya!'}
        </p>
        <div className="row center">
          <button onClick={onQuit}>Abandonar</button>
        </div>
      </div>
    </>
  )
}
