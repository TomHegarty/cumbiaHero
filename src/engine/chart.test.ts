import { describe, expect, it } from 'vitest'
import { SONGS } from '../songs'
import type { Song } from '../songs/types'
import { LANE_COUNT } from './keys'
import { grooveOffset, SongTiming, timeChart } from './chart'

const song: Song = {
  id: 't',
  title: 't',
  artist: 't',
  audio: '',
  offset: 1,
  tempo: [{ beat: 0, bpm: 60 }],
  groove: [0, 0, -0.1, -0.05],
  beatsPerBar: 4,
  charts: {},
}

describe('groove', () => {
  it('shifts only exact 16th positions', () => {
    expect(grooveOffset(song.groove, 2)).toBe(0)
    expect(grooveOffset(song.groove, 2.5)).toBe(-0.1)
    expect(grooveOffset(song.groove, 2.75)).toBe(-0.05)
    expect(grooveOffset(song.groove, 2.6)).toBe(0)
    expect(grooveOffset(song.groove, -0.5)).toBe(-0.1)
  })

  it('times notes and snaps back to the grid', () => {
    const t = new SongTiming(song)
    expect(t.noteTime(3.5)).toBeCloseTo(4.4)
    expect(t.snap(4.42, 4)).toBe(3.5)
    expect(t.snap(4.0, 2)).toBe(3)
    const timed = timeChart({ name: 'x', source: 'generated', notes: [{ b: 1.5, l: 2, d: 1 }] }, t)
    expect(timed[0].time).toBeCloseTo(2.4)
    expect(timed[0].end).toBeCloseTo(3.4)
  })
})

describe('bundled charts', () => {
  for (const s of SONGS) {
    for (const [key, chart] of Object.entries(s.charts)) {
      it(`${s.id}/${key} is well-formed`, () => {
        expect(chart.notes.length).toBeGreaterThan(0)
        const seen = new Set<string>()
        let prev = -Infinity
        for (const n of chart.notes) {
          expect(n.l).toBeGreaterThanOrEqual(0)
          expect(n.l).toBeLessThan(LANE_COUNT)
          expect(n.b).toBeGreaterThanOrEqual(prev)
          prev = n.b
          const k = `${n.b}/${n.l}`
          expect(seen.has(k)).toBe(false)
          seen.add(k)
        }
      })
    }
  }
})
