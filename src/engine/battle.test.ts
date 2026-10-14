import { describe, expect, it } from 'vitest'
import { afterRound, battleOver, battleRounds, dealtBy, rivalSetList, SET_SIZE, sumStats } from './battle'
import type { Stats } from './judge'

describe('battleRounds', () => {
  it('alternates your picks with the rival, you first', () => {
    expect(battleRounds(['a', 'b', 'c'], ['x', 'y', 'z']).map((r) => `${r.owner}:${r.melodyId}`)).toEqual([
      'you:a',
      'rival:x',
      'you:b',
      'rival:y',
      'you:c',
      'rival:z',
    ])
  })

  it('lets the rival open, for the guest of an online battle', () => {
    expect(battleRounds(['a', 'b'], ['x', 'y'], false).map((r) => `${r.owner}:${r.melodyId}`)).toEqual([
      'rival:x',
      'you:a',
      'rival:y',
      'you:b',
    ])
  })
})

describe('dealtBy', () => {
  it('counts a perfect as a full hit and a good as part of one', () => {
    expect(dealtBy({ perfect: 10, good: 5 })).toBeCloseTo(13)
  })
})

describe('rivalSetList', () => {
  const lib = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

  it('avoids your picks and has no repeats', () => {
    const picks = rivalSetList(lib, ['a', 'b', 'c'], 42)
    expect(picks).toHaveLength(SET_SIZE)
    expect(new Set(picks).size).toBe(SET_SIZE)
    for (const p of picks) expect(['a', 'b', 'c']).not.toContain(p)
  })

  it('is repeatable for a seed', () => {
    expect(rivalSetList(lib, ['a'], 7)).toEqual(rivalSetList(lib, ['a'], 7))
  })

  it('fills from the whole library when too few are left', () => {
    expect(rivalSetList(['a', 'b', 'c'], ['a', 'b'], 3)).toHaveLength(SET_SIZE)
  })
})

describe('afterRound', () => {
  it('a flawless set list empties the other bar', () => {
    let hp = { you: 1, rival: 1 }
    for (let i = 0; i < SET_SIZE; i++) hp = afterRound(hp, 'you', 20, 20)
    expect(hp.rival).toBeCloseTo(0)
    expect(hp.you).toBe(1)
    expect(battleOver(hp, 1, 6)).toBe(true)
  })

  it('only the owner deals damage', () => {
    expect(afterRound({ you: 1, rival: 1 }, 'rival', 5, 10)).toEqual({ you: 1 - 0.5 / SET_SIZE, rival: 1 })
  })
})

describe('sumStats', () => {
  it('adds counts and keeps the best combo', () => {
    const s = (score: number, maxCombo: number): Stats => ({
      score,
      combo: 0,
      maxCombo,
      perfect: 1,
      good: 2,
      miss: 3,
      total: 6,
      sabor: 0,
      saborActive: false,
    })
    const t = sumStats([s(100, 4), s(50, 9)])
    expect(t).toMatchObject({ score: 150, maxCombo: 9, perfect: 2, good: 4, miss: 6, total: 12 })
  })
})
