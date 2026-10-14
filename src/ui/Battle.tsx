import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadSongTracks } from '../engine/audio'
import { afterRound, battleOver, battleRounds, dealtBy, sumStats, type BattleRound, type Health } from '../engine/battle'
import type { DuelResult } from '../engine/duel'
import type { Stats } from '../engine/judge'
import { melodyById } from '../melodies'
import type { Lobby, LobbyState, RoundResult } from '../net/online'
import type { Settings } from '../settings'
import { Backdrop } from './Backdrop'
import { Game, type OnlineRound, type RoundSpec } from './Game'

/** The other player in an online battle, and the lobby linking you. */
export interface OnlineLink {
  lobby: Lobby
  rivalUid: string
  /** The host plays the first melody. */
  youFirst: boolean
}

interface Props {
  yours: string[]
  rivals: string[]
  names: { you: string; rival: string }
  settings: Settings
  online?: OnlineLink
  onDone: (stats: Stats, duel: DuelResult) => void
  onQuit: () => void
}

/** Seconds of song lead-in the game plays before beat 0, so the round card hands over just before it. */
const HANDOVER_MS = 2500
/** How long an opponent can be gone mid-battle before you win by forfeit. */
const FORFEIT_MS = 10_000

/** A set-list battle: you and El Rayo (or a friend online) alternate, one whole melody per turn. */
export function Battle(props: Props) {
  return props.online ? <OnlineBattle {...props} online={props.online} /> : <AiBattle {...props} />
}

function AiBattle({ yours, rivals, names, settings, onDone, onQuit }: Props) {
  const rounds = useMemo(() => battleRounds(yours, rivals), [yours, rivals])
  const [index, setIndex] = useState(0)
  const [hp, setHp] = useState<Health>({ you: 1, rival: 1 })
  const [stats, setStats] = useState<Stats[]>([])
  // Each round gets its own spec object so the game only restarts when the round changes
  const [spec, setSpec] = useState<RoundSpec | null>(null)

  const round = rounds[index]
  const melody = melodyById(round.melodyId)

  const onFinish = useCallback(
    (s: Stats, duel?: DuelResult) => {
      const owner = rounds[index].owner
      const nextHp = duel ? { you: duel.you, rival: duel.rival } : hp
      const nextStats = owner === 'you' ? [...stats, s] : stats
      setHp(nextHp)
      setStats(nextStats)
      setSpec(null)
      if (battleOver(nextHp, index + 1, rounds.length)) {
        onDone(sumStats(nextStats), { rivalName: names.rival, youName: names.you, you: nextHp.you, rival: nextHp.rival })
      } else {
        setIndex(index + 1)
      }
    },
    [rounds, index, hp, stats, names, onDone],
  )

  if (!melody) return null

  if (spec) {
    return (
      <Game
        key={index}
        song={melody.song}
        chart={melody.chart}
        settings={settings}
        duel
        round={spec}
        names={names}
        onFinish={onFinish}
        onQuit={onQuit}
      />
    )
  }

  const yourTurn = round.owner === 'you'
  return (
    <RoundCard rounds={rounds} index={index} hp={hp} yours={yours} rivals={rivals} names={names}>
      <div className="row center">
        <button onClick={onQuit}>Abandonar</button>
        <button className="hot" autoFocus onClick={() => setSpec({ owner: round.owner, hp })}>
          {yourTurn ? '¡Dale!' : `Escuchar a ${names.rival}`}
        </button>
      </div>
    </RoundCard>
  )
}

/**
 * An online battle. The host starts each round at a server time both screens
 * count down to; each player judges their own notes and streams them, and the
 * round's player writes its result, which both sides fold into the health bars.
 */
function OnlineBattle({ yours, rivals, names, settings, online, onDone, onQuit }: Props & { online: OnlineLink }) {
  const { lobby, rivalUid, youFirst } = online
  const rounds = useMemo(() => battleRounds(yours, rivals, youFirst), [yours, rivals, youFirst])
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  // The round being played on this screen, fixed when its countdown hands over to the game
  const [live, setLive] = useState<{ index: number; spec: RoundSpec; online: OnlineRound } | null>(null)
  const [finishedRound, setFinishedRound] = useState(-1)
  const [now, setNow] = useState(() => Date.now())
  const ended = useRef(false)

  useEffect(() => lobby.watch(setLobbyState), [lobby])

  // Health after each round with a result, in order
  const hpAfter = useMemo(() => {
    const out: Health[] = []
    let hp: Health = { you: 1, rival: 1 }
    for (let i = 0; i < rounds.length && results[i]; i++) {
      hp = afterRound(hp, rounds[i].owner, results[i].dealt, results[i].notes)
      out.push(hp)
    }
    return out
  }, [rounds, results])

  // Follow the host from round to round, but only once the last round's result is in here too,
  // so every round starts from the same health on both screens
  const battle = lobbyState?.battle
  const index = Math.min(battle?.round ?? 0, hpAfter.length, rounds.length - 1)
  const hp = useMemo(() => hpAfter[index - 1] ?? { you: 1, rival: 1 }, [hpAfter, index])
  const round = rounds[index]
  const melody = melodyById(round.melodyId)
  // The round's start on the host's server clock, converted to this screen's clock
  const serverStart = battle && battle.round === index ? battle.startAt : null
  const startAt = serverStart === null ? null : serverStart - lobby.clockOffset()

  const finish = useCallback(
    (final: Health, forfeit = false) => {
      if (ended.current) return
      ended.current = true
      const mine = rounds
        .map((r, i) => (r.owner === 'you' ? results[i] : undefined))
        .filter((r): r is RoundResult => !!r)
        .map((r) => ({ ...r.stats, combo: 0, sabor: 0, saborActive: false }))
      if (lobby.isHost) void lobby.finish().catch(() => {})
      onDone(sumStats(mine), {
        rivalName: names.rival,
        youName: names.you,
        you: final.you,
        rival: forfeit ? 0 : final.rival,
        forfeit,
      })
    },
    [rounds, results, lobby, names, onDone],
  )

  // The current round's result, from whoever played it
  useEffect(() => {
    const owner = round.owner === 'you' ? lobby.uid : rivalUid
    return lobby.watchResult(index, owner, (r) =>
      setResults((all) => {
        const next = [...all]
        next[index] = r
        return next
      }),
    )
  }, [lobby, rivalUid, round, index])

  // Once the result is in: the battle ends, or the host starts the next round
  const battleRound = battle?.round
  useEffect(() => {
    const after = hpAfter[index]
    if (!after) return
    if (battleOver(after, index + 1, rounds.length)) finish(after)
    else if (lobby.isHost && battleRound === index) void lobby.nextRound(index + 1).catch(() => {})
  }, [hpAfter, index, rounds.length, lobby, battleRound, finish])

  // Count down to the round, and hand over to the game just before its first beat
  const playing = live?.index === index
  useEffect(() => {
    if (playing) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (startAt === null || t < startAt - HANDOVER_MS || finishedRound === index) return
      setLive({
        index,
        spec: { owner: round.owner, hp },
        online: {
          startAt,
          onHit: (i, g) => {
            if (round.owner === 'you') lobby.sendHit(index, i, g)
          },
          watchHits: (fn) => lobby.watchHits(index, rivalUid, fn),
        },
      })
    }
    const t = window.setInterval(tick, 100)
    return () => clearInterval(t)
  }, [playing, startAt, finishedRound, index, round, hp, lobby, rivalUid])

  // Load the round's audio during the countdown so it's ready on the beat
  useEffect(() => {
    if (melody) void loadSongTracks(melody.song).catch(() => {})
  }, [melody])

  // The opponent leaving, or vanishing for long enough, ends the battle in your favour
  const rival = lobbyState?.players[rivalUid]
  const rivalLeft = !!rival?.left
  const gone = !!rival && (rivalLeft || !rival.connected)
  useEffect(() => {
    if (!gone) return
    const t = window.setTimeout(() => finish(hp, true), rivalLeft ? 0 : FORFEIT_MS)
    return () => clearTimeout(t)
  }, [gone, rivalLeft, hp, finish])

  const quit = () => {
    lobby.leave()
    onQuit()
  }

  const onFinish = useCallback(
    (s: Stats) => {
      if (!live) return
      if (live.spec.owner === 'you') {
        const stats = { score: s.score, maxCombo: s.maxCombo, perfect: s.perfect, good: s.good, miss: s.miss, total: s.total }
        void lobby.sendResult(live.index, { dealt: dealtBy(s), notes: s.total, stats }).catch(() => {})
      }
      setFinishedRound(live.index)
      setLive(null)
    },
    [live, lobby],
  )

  if (!melody) return null

  if (live && playing) {
    return (
      <Game
        key={index}
        song={melody.song}
        chart={melody.chart}
        settings={settings}
        duel
        round={live.spec}
        online={live.online}
        names={names}
        onFinish={onFinish}
        onQuit={quit}
      />
    )
  }

  const left = startAt === null ? null : Math.max(0, Math.ceil((startAt - HANDOVER_MS - now) / 1000))
  return (
    <RoundCard rounds={rounds} index={index} hp={hp} yours={yours} rivals={rivals} names={names}>
      <p className="countdown">
        {gone
          ? `${names.rival} se desconectó…`
          : finishedRound === index
            ? 'Esperando el resultado…'
            : left === null
              ? 'Preparando la ronda…'
              : left > 0
                ? left
                : '¡Ya!'}
      </p>
      <div className="row center">
        <button onClick={quit}>Abandonar</button>
      </div>
    </RoundCard>
  )
}

interface CardProps {
  rounds: BattleRound[]
  index: number
  hp: Health
  yours: string[]
  rivals: string[]
  names: { you: string; rival: string }
  children: React.ReactNode
}

/** Between melodies: whose turn it is, what they'll play, and both set lists. */
function RoundCard({ rounds, index, hp, yours, rivals, names, children }: CardProps) {
  const round = rounds[index]
  const melody = melodyById(round.melodyId)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const yourTurn = round.owner === 'you'
  const setColumn = (name: string, ids: string[], side: 'you' | 'rival') => (
    <div className={`side ${side}`}>
      <div className="who">
        {name} <span>{pct(hp[side])}</span>
      </div>
      <ol>
        {ids.map((id) => {
          const at = rounds.findIndex((r) => r.owner === side && r.melodyId === id)
          return (
            <li key={id} className={at === index ? 'now' : at < index ? 'done' : undefined}>
              {melodyById(id)?.title}
            </li>
          )
        })}
      </ol>
    </div>
  )

  return (
    <>
      <Backdrop />
      <div className="panel round-intro">
        <p className="subtitle">
          Ronda {index + 1} de {rounds.length}
        </p>
        <h2 className={yourTurn ? 'gold' : 'chrome'}>{yourTurn ? '¡Tu turno!' : `Turno de ${names.rival}`}</h2>
        {melody && (
          <p className="now-playing">
            <b>{melody.title}</b> — {melody.artist}
            <br />
            <span>
              {melody.part}
              {melody.demo && ' · demo'}
            </span>
          </p>
        )}
        <div className="sets">
          {setColumn(names.you, yours, 'you')}
          <div className="vs">VS</div>
          {setColumn(names.rival, rivals, 'rival')}
        </div>
        {children}
      </div>
    </>
  )
}
