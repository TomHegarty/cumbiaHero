import type { Chart, ChartNote } from '../songs/types'

/**
 * Stand-in riffs, one per library melody, so battles are playable before the
 * real recordings are run through tools/melodies. They are original
 * cumbia-style phrases, not transcriptions of the songs.
 *
 * Each riff is two 2-bar phrases (A, B) played A B A B. A note is
 * [16th slot within the phrase, semitones above the key, length in 16ths].
 */

type DemoNote = [slot: number, step: number, len: number]

export interface DemoRiff {
  bpm: number
  /** MIDI note of the key's root, in the lead synth's register. */
  key: number
  /** Chord root per bar of a phrase pair (4 bars), in semitones above the key. */
  chords: [number, number, number, number]
  a: DemoNote[]
  b: DemoNote[]
}

export const DEMO_RIFFS: Record<string, DemoRiff> = {
  'se-te-ve-la-tanga': {
    bpm: 96,
    key: 69,
    chords: [0, 0, 10, 7],
    a: [[0, 12, 2], [2, 10, 2], [4, 7, 2], [6, 10, 2], [8, 12, 2], [10, 15, 2], [12, 14, 4], [16, 12, 2], [18, 10, 2], [20, 7, 2], [22, 5, 2], [24, 7, 8]],
    b: [[0, 3, 2], [2, 5, 2], [4, 7, 2], [6, 8, 2], [8, 7, 2], [10, 5, 2], [12, 3, 4], [16, 2, 2], [18, 3, 2], [20, 5, 2], [22, 3, 2], [24, 0, 8]],
  },
  'no-te-creas-tan-importante': {
    bpm: 94,
    key: 67,
    chords: [0, 5, 10, 7],
    a: [[0, 7, 4], [4, 8, 2], [6, 7, 2], [8, 5, 2], [10, 3, 2], [12, 5, 4], [16, 3, 2], [18, 2, 2], [20, 0, 2], [22, 2, 2], [24, 3, 8]],
    b: [[0, 12, 4], [4, 10, 2], [6, 8, 2], [8, 7, 4], [12, 8, 2], [14, 7, 2], [16, 5, 2], [18, 7, 2], [20, 8, 2], [22, 10, 2], [24, 7, 8]],
  },
  'sos-boton': {
    bpm: 100,
    key: 64,
    chords: [0, 0, 5, 7],
    a: [[0, 0, 2], [2, 3, 2], [4, 7, 2], [6, 12, 2], [8, 10, 2], [10, 7, 2], [12, 3, 2], [14, 7, 2], [16, 5, 2], [18, 3, 2], [20, 2, 2], [22, 3, 2], [24, 0, 8]],
    b: [[0, 7, 2], [2, 7, 2], [4, 8, 2], [6, 7, 2], [8, 5, 2], [10, 3, 2], [12, 5, 4], [16, 7, 2], [18, 7, 2], [20, 10, 2], [22, 8, 2], [24, 7, 8]],
  },
  'cumbia-de-los-trapos': {
    bpm: 92,
    key: 62,
    chords: [0, 8, 3, 10],
    a: [[0, 12, 6], [6, 10, 2], [8, 12, 2], [10, 10, 2], [12, 8, 4], [16, 7, 6], [22, 8, 2], [24, 7, 2], [26, 5, 2], [28, 3, 4]],
    b: [[0, 3, 2], [2, 7, 2], [4, 10, 2], [6, 12, 2], [8, 15, 4], [12, 14, 4], [16, 12, 2], [18, 10, 2], [20, 12, 4], [24, 10, 8]],
  },
  'llegamos-los-pibes-chorros': {
    bpm: 98,
    key: 65,
    chords: [0, 10, 8, 7],
    a: [[0, 0, 2], [2, 0, 2], [4, 3, 2], [6, 5, 2], [8, 7, 4], [12, 5, 2], [14, 3, 2], [16, 5, 2], [18, 5, 2], [20, 7, 2], [22, 8, 2], [24, 7, 8]],
    b: [[0, 10, 2], [2, 10, 2], [4, 8, 2], [6, 7, 2], [8, 8, 4], [12, 7, 2], [14, 5, 2], [16, 3, 2], [18, 2, 2], [20, 3, 2], [22, 2, 2], [24, 0, 8]],
  },
  'para-la-gilada': {
    bpm: 95,
    key: 66,
    chords: [0, 3, 10, 7],
    a: [[0, 7, 2], [2, 3, 2], [4, 7, 2], [6, 3, 2], [8, 8, 2], [10, 7, 2], [12, 5, 4], [16, 5, 2], [18, 2, 2], [20, 5, 2], [22, 2, 2], [24, 7, 8]],
    b: [[0, 12, 2], [2, 7, 2], [4, 12, 2], [6, 7, 2], [8, 14, 2], [10, 12, 2], [12, 10, 4], [16, 8, 2], [18, 7, 2], [20, 5, 2], [22, 3, 2], [24, 2, 8]],
  },
  'ritmo-sustancia': {
    bpm: 102,
    key: 68,
    chords: [0, 0, 8, 7],
    a: [[0, 0, 4], [4, 12, 4], [8, 10, 2], [10, 8, 2], [12, 7, 4], [16, 0, 4], [20, 12, 4], [24, 10, 2], [26, 12, 2], [28, 15, 4]],
    b: [[0, 14, 4], [4, 12, 2], [6, 10, 2], [8, 12, 4], [12, 8, 4], [16, 7, 2], [18, 8, 2], [20, 7, 2], [22, 5, 2], [24, 7, 8]],
  },
  'bailan-rochas-y-chetas': {
    bpm: 97,
    key: 63,
    chords: [0, 5, 8, 7],
    a: [[0, 3, 2], [2, 2, 2], [4, 0, 2], [6, 2, 2], [8, 3, 2], [10, 5, 2], [12, 7, 2], [14, 8, 2], [16, 7, 2], [18, 5, 2], [20, 3, 2], [22, 5, 2], [24, 7, 8]],
    b: [[0, 8, 2], [2, 7, 2], [4, 5, 2], [6, 7, 2], [8, 8, 2], [10, 10, 2], [12, 12, 2], [14, 10, 2], [16, 8, 2], [18, 7, 2], [20, 5, 2], [22, 3, 2], [24, 2, 8]],
  },
  'tirate-un-paso': {
    bpm: 104,
    key: 70,
    chords: [0, 8, 10, 7],
    a: [[0, 0, 2], [3, 0, 1], [4, 3, 2], [6, 0, 2], [8, 5, 2], [10, 3, 2], [12, 0, 4], [16, 0, 2], [19, 0, 1], [20, 3, 2], [22, 0, 2], [24, 7, 8]],
    b: [[0, 7, 2], [3, 7, 1], [4, 10, 2], [6, 7, 2], [8, 12, 2], [10, 10, 2], [12, 7, 4], [16, 5, 2], [18, 3, 2], [20, 2, 2], [22, -2, 2], [24, 0, 8]],
  },
  'la-resaka': {
    bpm: 86,
    key: 69,
    chords: [0, 0, 5, 7],
    a: [[0, 12, 4], [4, 12, 2], [6, 10, 2], [8, 12, 4], [12, 15, 4], [16, 14, 4], [20, 12, 2], [22, 10, 2], [24, 12, 8]],
    b: [[0, 7, 4], [4, 7, 2], [6, 5, 2], [8, 7, 4], [12, 10, 4], [16, 8, 4], [20, 7, 2], [22, 5, 2], [24, 3, 8]],
  },
}

/** Bars in a demo riff (A B A B, two bars each). */
export const DEMO_BARS = 8

export interface DemoEvent {
  /** Beat from the start of the riff. */
  beat: number
  midi: number
  /** Length in beats. */
  beats: number
}

/** The riff's notes in play order. */
export function demoEvents(riff: DemoRiff): DemoEvent[] {
  const out: DemoEvent[] = []
  ;[riff.a, riff.b, riff.a, riff.b].forEach((phrase, i) => {
    for (const [slot, step, len] of phrase) out.push({ beat: i * 8 + slot / 4, midi: riff.key + step, beats: len / 4 })
  })
  return out
}

/** Lanes by pitch rank across the riff, low on the left hand and high on the right. */
export function rankLanes(pitches: number[], lanes = 8): number[] {
  const distinct = [...new Set(pitches)].sort((x, y) => x - y)
  if (distinct.length === 1) return pitches.map(() => Math.floor(lanes / 2))
  return pitches.map((p) => Math.round((distinct.indexOf(p) / (distinct.length - 1)) * (lanes - 1)))
}

/** Chart for a demo riff: one note per riff note, held when it rings two beats or more. */
export function demoChart(riff: DemoRiff): Chart {
  const events = demoEvents(riff)
  const lanes = rankLanes(events.map((e) => e.midi))
  const notes: ChartNote[] = events.map((e, i) => (e.beats >= 2 ? { b: e.beat, l: lanes[i], d: e.beats - 0.5 } : { b: e.beat, l: lanes[i] }))
  return { name: 'Demo', source: 'hand-charted', notes }
}
