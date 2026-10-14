import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadSongTracks } from '../engine/audio'
import { battleOver, battleRounds, sumStats, type Health } from '../engine/battle'
import type { DuelResult } from '../engine/duel'
import type { Stats } from '../engine/judge'
import { melodyById } from '../melodies'
import type { Settings } from '../settings'
import { Game, type RoundSpec } from './Game'
import { RoundCard } from './RoundCard'

interface Props {
  yours: string[]
  rivals: string[]
  youName: string
  settings: Settings
  onDone: (stats: Stats, duel: DuelResult) => void
  onQuit: () => void
}

const RIVAL_NAME = 'EL RAYO'

/**
 * A set-list battle: you and El Rayo alternate, one whole melody per turn, on
 * one stage that stays up from the first note to the last. Each melody hands
 * straight over to the next, with the crowd cheering the change.
 */
export function Battle({ yours, rivals, youName, settings, onDone, onQuit }: Props) {
  const rounds = useMemo(() => battleRounds(yours, rivals), [yours, rivals])
  const [index, setIndex] = useState(0)
  const [stats, setStats] = useState<Stats[]>([])
  // Each round gets its own spec object so the game only restarts when the round changes
  const [spec, setSpec] = useState<RoundSpec>(() => ({ owner: rounds[0].owner, hp: { you: 1, rival: 1 } }))

  const round = rounds[index]
  const melody = melodyById(round.melodyId)

  // Have the next melody's audio ready by the time this one ends
  const next = rounds[index + 1] && melodyById(rounds[index + 1].melodyId)
  useEffect(() => {
    if (next) void loadSongTracks(next.song).catch(() => {})
  }, [next])

  const onFinish = useCallback(
    (s: Stats, duel?: DuelResult) => {
      const hp: Health = duel ? { you: duel.you, rival: duel.rival } : spec.hp
      const nextStats = rounds[index].owner === 'you' ? [...stats, s] : stats
      if (battleOver(hp, index + 1, rounds.length)) {
        onDone(sumStats(nextStats), { youName, rivalName: RIVAL_NAME, you: hp.you, rival: hp.rival })
        return
      }
      setStats(nextStats)
      setSpec({ owner: rounds[index + 1].owner, hp })
      setIndex(index + 1)
    },
    [rounds, index, spec, stats, youName, onDone],
  )

  if (!melody) return null
  return (
    <Game
      song={melody.song}
      chart={melody.chart}
      settings={settings}
      duel
      round={spec}
      youName={youName}
      onFinish={onFinish}
      onQuit={onQuit}
    >
      <RoundCard
        key={index}
        index={index}
        total={rounds.length}
        yours={round.owner === 'you'}
        rivalName={RIVAL_NAME}
        melody={melody}
      />
    </Game>
  )
}
