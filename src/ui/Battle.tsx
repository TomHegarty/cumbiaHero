import { useCallback, useMemo, useState } from 'react'
import { battleOver, battleRounds, sumStats, type Health } from '../engine/battle'
import type { DuelResult } from '../engine/duel'
import type { Stats } from '../engine/judge'
import { melodyById } from '../melodies'
import type { Settings } from '../settings'
import { Backdrop } from './Backdrop'
import { Game, type RoundSpec } from './Game'

interface Props {
  yours: string[]
  rivals: string[]
  youName: string
  settings: Settings
  onDone: (stats: Stats, duel: DuelResult) => void
  onQuit: () => void
}

const RIVAL_NAME = 'EL RAYO'

/** A set-list battle: you and El Rayo alternate, one whole melody per turn. */
export function Battle({ yours, rivals, youName, settings, onDone, onQuit }: Props) {
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
        onDone(sumStats(nextStats), { youName, rivalName: RIVAL_NAME, you: nextHp.you, rival: nextHp.rival })
      } else {
        setIndex(index + 1)
      }
    },
    [rounds, index, hp, stats, youName, onDone],
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
        youName={youName}
        onFinish={onFinish}
        onQuit={onQuit}
      />
    )
  }

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
        <h2 className={yourTurn ? 'gold' : 'chrome'}>{yourTurn ? '¡Tu turno!' : `Turno de ${RIVAL_NAME}`}</h2>
        <p className="now-playing">
          <b>{melody.title}</b> — {melody.artist}
          <br />
          <span>
            {melody.part}
            {melody.demo && ' · demo'}
          </span>
        </p>
        <div className="sets">
          {setColumn(youName, yours, 'you')}
          <div className="vs">VS</div>
          {setColumn(RIVAL_NAME, rivals, 'rival')}
        </div>
        <div className="row center">
          <button onClick={onQuit}>Abandonar</button>
          <button className="hot" autoFocus onClick={() => setSpec({ owner: round.owner, hp })}>
            {yourTurn ? '¡Dale!' : 'Escuchar a El Rayo'}
          </button>
        </div>
      </div>
    </>
  )
}
