import { describe, expect, it } from 'vitest'
import { TempoMap } from './tempo'

describe('TempoMap', () => {
  it('converts at a constant tempo with an offset', () => {
    const m = new TempoMap([{ beat: 0, bpm: 120 }], 0.5)
    expect(m.beatToTime(0)).toBeCloseTo(0.5)
    expect(m.beatToTime(4)).toBeCloseTo(2.5)
    expect(m.timeToBeat(2.5)).toBeCloseTo(4)
    expect(m.timeToBeat(0)).toBeCloseTo(-1)
  })

  it('handles tempo changes', () => {
    const m = new TempoMap(
      [
        { beat: 0, bpm: 60 },
        { beat: 4, bpm: 120 },
      ],
      0,
    )
    expect(m.beatToTime(4)).toBeCloseTo(4)
    expect(m.beatToTime(6)).toBeCloseTo(5)
    expect(m.timeToBeat(5)).toBeCloseTo(6)
    expect(m.timeToBeat(2)).toBeCloseTo(2)
  })

  it('requires a beat-0 entry', () => {
    expect(() => new TempoMap([{ beat: 1, bpm: 90 }], 0)).toThrow()
  })
})
