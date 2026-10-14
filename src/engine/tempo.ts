import type { TempoPoint } from '../songs/types'

interface Segment {
  beat: number
  time: number
  spb: number
}

/** Converts between beats and seconds for a (possibly changing) tempo map. */
export class TempoMap {
  private readonly segments: Segment[]

  constructor(points: TempoPoint[], offset: number) {
    if (points.length === 0 || points[0].beat !== 0) {
      throw new Error('Tempo map must start at beat 0')
    }
    const sorted = [...points].sort((a, b) => a.beat - b.beat)
    this.segments = []
    let time = offset
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]
      if (i > 0) {
        const prev = this.segments[i - 1]
        time = prev.time + (p.beat - prev.beat) * prev.spb
      }
      this.segments.push({ beat: p.beat, time, spb: 60 / p.bpm })
    }
  }

  beatToTime(beat: number): number {
    let seg = this.segments[0]
    for (const s of this.segments) {
      if (s.beat <= beat) seg = s
      else break
    }
    return seg.time + (beat - seg.beat) * seg.spb
  }

  timeToBeat(time: number): number {
    let seg = this.segments[0]
    for (const s of this.segments) {
      if (s.time <= time) seg = s
      else break
    }
    return seg.beat + (time - seg.time) / seg.spb
  }
}
