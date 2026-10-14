import type { Chart, Song } from '../songs/types'
import type { TimedNote } from './judge'
import { TempoMap } from './tempo'

type Groove = NonNullable<Song['groove']>

/** Groove offset in beats for a beat position (only exact 16ths are shifted). */
export function grooveOffset(groove: Groove | undefined, beat: number): number {
  if (!groove) return 0
  const sixteenth = beat * 4
  const slot = Math.round(sixteenth)
  if (Math.abs(sixteenth - slot) > 1e-6) return 0
  return groove[((slot % 4) + 4) % 4]
}

/** Song-aware timing: tempo map plus groove. */
export class SongTiming {
  readonly tempo: TempoMap
  private readonly groove: Groove | undefined

  constructor(song: Song) {
    this.tempo = new TempoMap(song.tempo, song.offset)
    this.groove = song.groove
  }

  /** Seconds at which a chart beat should be hit. */
  noteTime(beat: number): number {
    return this.tempo.beatToTime(beat + grooveOffset(this.groove, beat))
  }

  /** Nearest grid beat (1/div) to a time, choosing by groove-adjusted hit time. */
  snap(time: number, div: number): number {
    const raw = this.tempo.timeToBeat(time)
    const base = Math.round(raw * div)
    let best = base / div
    let bestErr = Infinity
    for (let k = base - 2; k <= base + 2; k++) {
      const b = k / div
      const err = Math.abs(this.noteTime(b) - time)
      if (err < bestErr) {
        best = b
        bestErr = err
      }
    }
    return best
  }
}

/** Converts a beat-based chart into absolute note times in seconds. */
export function timeChart(chart: Chart, timing: SongTiming): TimedNote[] {
  return chart.notes
    .map((n) => {
      const time = timing.noteTime(n.b)
      const end = n.d && n.d > 0 ? timing.noteTime(n.b + n.d) : time
      return { time, end, lane: n.l }
    })
    .sort((a, b) => a.time - b.time || a.lane - b.lane)
}
