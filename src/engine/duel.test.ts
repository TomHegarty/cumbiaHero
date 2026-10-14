import { describe, expect, it } from 'vitest'
import type { Chart } from '../songs/types'
import { AiPlayer, splitChart, turnOwner } from './duel'

const chart = (beats: number[]): Chart => ({
  name: 'Test',
  source: 'hand-charted',
  notes: beats.map((b) => ({ b, l: 0 })),
})

describe('turns', () => {
  it('hands over every four bars and wraps around the duelists', () => {
    expect(turnOwner(0, 4, 2)).toBe(0)
    expect(turnOwner(15.9, 4, 2)).toBe(0)
    expect(turnOwner(16, 4, 2)).toBe(1)
    expect(turnOwner(32, 4, 2)).toBe(0)
    expect(turnOwner(32, 4, 3)).toBe(2)
  })

  it('splits notes by the turn they start in', () => {
    const [a, b] = splitChart(chart([0, 8, 16, 20, 33]), 4, 2)
    expect(a.notes.map((n) => n.b)).toEqual([0, 8, 33])
    expect(b.notes.map((n) => n.b)).toEqual([16, 20])
  })

  it('starts the first turn on the bar of the first note', () => {
    const [a, b] = splitChart(chart([9, 12, 24, 25, 41]), 4, 2)
    expect(a.notes.map((n) => n.b)).toEqual([9, 12, 41])
    expect(b.notes.map((n) => n.b)).toEqual([24, 25])
  })
})

describe('AiPlayer', () => {
  const tap = (time: number) => ({ time, end: time, lane: 1 })

  it('plays every note at full skill', () => {
    const ai = new AiPlayer([tap(1), tap(2), { time: 3, end: 4, lane: 2 }], 1)
    const grades: string[] = []
    ai.onJudge((e) => grades.push(e.grade))
    ai.update(0.5)
    expect(grades).toEqual([])
    ai.update(3.5)
    expect(grades).toHaveLength(3)
    expect(grades).not.toContain('miss')
    expect(ai.states).toEqual(['hit', 'hit', 'holding'])
    ai.update(4.1)
    expect(ai.states[2]).toBe('held')
  })

  it('misses everything at zero skill', () => {
    const ai = new AiPlayer([tap(1), tap(2)], 0)
    ai.update(5)
    expect(ai.states).toEqual(['missed', 'missed'])
  })

  it('is repeatable for a seed', () => {
    const notes = Array.from({ length: 50 }, (_, i) => tap(i))
    const a = new AiPlayer(notes, 0.7, 42)
    const b = new AiPlayer(notes, 0.7, 42)
    a.update(100)
    b.update(100)
    expect(a.states).toEqual(b.states)
  })
})
