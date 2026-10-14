import { describe, expect, it } from 'vitest'
import { DEMO_RIFFS, rankLanes } from './demo'
import { MELODIES } from '.'

describe('melody library', () => {
  it('has ten melodies, each with a playable chart', () => {
    expect(MELODIES).toHaveLength(10)
    expect(new Set(MELODIES.map((m) => m.id)).size).toBe(10)
    for (const m of MELODIES) {
      expect(m.chart.notes.length, m.id).toBeGreaterThan(10)
      for (const n of m.chart.notes) {
        expect(n.l).toBeGreaterThanOrEqual(0)
        expect(n.l).toBeLessThan(8)
      }
    }
  })

  it('has a demo riff for every melody', () => {
    for (const m of MELODIES) expect(DEMO_RIFFS[m.id], m.id).toBeDefined()
  })
})

describe('rankLanes', () => {
  it('spreads distinct pitches from left to right', () => {
    expect(rankLanes([60, 62, 64, 60])).toEqual([0, 4, 7, 0])
    expect(rankLanes([60, 60])).toEqual([4, 4])
  })
})
