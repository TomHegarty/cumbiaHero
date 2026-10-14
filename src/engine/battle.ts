import { damageFor } from './duel'
import type { Stats } from './judge'

/**
 * Set-list battles, as in the keyboard-battle clips: each side picks a few
 * melody highlights and the two take turns playing them, one whole melody per
 * turn. Health carries across the battle, and each melody can take at most
 * 1/SET_SIZE of the opponent's bar, so a flawless set list empties it.
 */

export const SET_SIZE = 3

export type Side = 'you' | 'rival'

export interface Health {
  you: number
  rival: number
}

export interface BattleRound {
  owner: Side
  melodyId: string
}

/** Your picks and the rival's, alternating, you first unless `youFirst` is false. */
export function battleRounds(yours: string[], rivals: string[], youFirst = true): BattleRound[] {
  const rounds: BattleRound[] = []
  const [first, second]: [Side, Side] = youFirst ? ['you', 'rival'] : ['rival', 'you']
  const sets = { you: yours, rival: rivals }
  for (let i = 0; i < Math.max(yours.length, rivals.length); i++) {
    if (sets[first][i]) rounds.push({ owner: first, melodyId: sets[first][i] })
    if (sets[second][i]) rounds.push({ owner: second, melodyId: sets[second][i] })
  }
  return rounds
}

/** Damage a round's stats add up to, the same sum the game keeps note by note. */
export function dealtBy(s: Pick<Stats, 'perfect' | 'good'>): number {
  return s.perfect * damageFor('perfect') + s.good * damageFor('good')
}

/**
 * The rival's set list: melodies you didn't pick, chosen with a seeded shuffle
 * so a seed always gives the same set. Falls back to repeats if the library is small.
 */
export function rivalSetList(library: string[], yours: string[], seed: number, size = SET_SIZE): string[] {
  let s = seed >>> 0 || 1
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
  const shuffle = (xs: string[]) => {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const picks = shuffle(library.filter((id) => !yours.includes(id))).slice(0, size)
  if (picks.length < size) picks.push(...shuffle(library).slice(0, size - picks.length))
  return picks
}

/** Health after a round where `owner` dealt `dealt` damage over `notes` notes. */
export function afterRound(hp: Health, owner: Side, dealt: number, notes: number, setSize = SET_SIZE): Health {
  const hit = Math.min(1, dealt / Math.max(1, notes)) / setSize
  // Snap rounding dust to empty, so three flawless thirds really do finish the bar
  const left = (v: number) => (v - hit < 1e-9 ? 0 : v - hit)
  return owner === 'you' ? { ...hp, rival: left(hp.rival) } : { ...hp, you: left(hp.you) }
}

/** The battle is over once either bar is empty or every round is played. */
export function battleOver(hp: Health, round: number, rounds: number): boolean {
  return hp.you <= 0 || hp.rival <= 0 || round >= rounds
}

/** Your stats across all your rounds, for the results screen. */
export function sumStats(all: Stats[]): Stats {
  const zero: Stats = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, total: 0, sabor: 0, saborActive: false }
  return all.reduce(
    (acc, s) => ({
      ...acc,
      score: acc.score + s.score,
      maxCombo: Math.max(acc.maxCombo, s.maxCombo),
      perfect: acc.perfect + s.perfect,
      good: acc.good + s.good,
      miss: acc.miss + s.miss,
      total: acc.total + s.total,
    }),
    zero,
  )
}
