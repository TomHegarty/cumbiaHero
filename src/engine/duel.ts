import type { Chart } from '../songs/types'
import { GOOD_WINDOW, PERFECT_WINDOW, type Grade, type JudgeEvent, type NoteState, type TimedNote } from './judge'

/**
 * Turn-based keyboard battles: the chart is cut into phrases of a few bars and
 * the duelists take them in turn. Any number of duelists works, each either a
 * human at the keyboard or an AI, so the same split can drive local or online
 * multiplayer later.
 */

export interface Duelist {
  name: string
  controller: 'human' | 'ai'
  /** AI only: rough chance of landing each note, 0..1. */
  skill?: number
}

/** Bars each duelist plays before handing over. */
export const BARS_PER_TURN = 4

/** Final health of each side when the song ends. */
export interface DuelResult {
  rivalName: string
  you: number
  rival: number
}

/** Beat the first turn starts on: the bar holding the first note, so an empty intro isn't anyone's turn. */
export function turnOrigin(chart: Chart, beatsPerBar: number): number {
  if (!chart.notes.length) return 0
  const first = Math.min(...chart.notes.map((n) => n.b))
  return Math.floor(first / beatsPerBar) * beatsPerBar
}

/** Index of the turn covering `beat`, counted from `origin`; negative before the first turn. */
export function turnIndex(beat: number, beatsPerBar: number, origin = 0, barsPerTurn = BARS_PER_TURN): number {
  return Math.floor((beat - origin) / (beatsPerBar * barsPerTurn))
}

/** Index of the duelist whose turn covers `beat`. */
export function turnOwner(
  beat: number,
  beatsPerBar: number,
  duelists: number,
  barsPerTurn = BARS_PER_TURN,
  origin = 0,
): number {
  return Math.max(0, turnIndex(beat, beatsPerBar, origin, barsPerTurn)) % duelists
}

/** One chart per duelist holding only the notes that start in their turns. */
export function splitChart(chart: Chart, beatsPerBar: number, duelists: number, barsPerTurn = BARS_PER_TURN): Chart[] {
  const origin = turnOrigin(chart, beatsPerBar)
  const parts: Chart[] = Array.from({ length: duelists }, () => ({ ...chart, notes: [] }))
  for (const n of chart.notes) parts[turnOwner(n.b, beatsPerBar, duelists, barsPerTurn, origin)].notes.push(n)
  return parts
}

/** Damage dealt by one judged note, so a flawless set of turns empties the opponent's bar. */
export function damageFor(grade: Grade): number {
  return grade === 'perfect' ? 1 : grade === 'good' ? 0.6 : 0
}

/**
 * Plays a duelist's notes on its own. Outcomes are decided up front from a
 * seed so a run is repeatable; states follow the same lifecycle as the Judge's
 * so the highway can draw them the same way.
 */
export class AiPlayer {
  readonly notes: TimedNote[]
  readonly states: NoteState[]
  private readonly outcomes: Grade[]
  private cursor = 0
  private readonly listeners: ((e: JudgeEvent) => void)[] = []

  constructor(notes: TimedNote[], skill = 0.85, seed = 1) {
    this.notes = [...notes].sort((a, b) => a.time - b.time || a.lane - b.lane)
    this.states = this.notes.map(() => 'pending')
    let s = seed >>> 0
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 2 ** 32
    }
    this.outcomes = this.notes.map(() => {
      const r = rand()
      if (r < skill * 0.8) return 'perfect'
      if (r < skill) return 'good'
      return 'miss'
    })
  }

  onJudge(fn: (e: JudgeEvent) => void): void {
    this.listeners.push(fn)
  }

  update(t: number): void {
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]
      const grade = this.outcomes[i]
      if (this.states[i] === 'pending') {
        // Hits land on the note (a good one slightly off); misses are called once the window passes
        const at = grade === 'miss' ? n.time + GOOD_WINDOW : n.time + (grade === 'good' ? PERFECT_WINDOW : 0)
        if (t < at) break
        this.states[i] = grade === 'miss' ? 'missed' : n.end > n.time ? 'holding' : 'hit'
        for (const fn of this.listeners) fn({ grade, lane: n.lane, time: t })
      }
      if (this.states[i] === 'holding' && t >= n.end) this.states[i] = 'held'
    }
    while (this.cursor < this.notes.length && this.states[this.cursor] !== 'pending' && this.states[this.cursor] !== 'holding') {
      this.cursor++
    }
  }

  /** Lanes the AI is pressing right now, for lighting its keys. */
  pressedAt(t: number, lanes: boolean[]): void {
    lanes.fill(false)
    // Look a little behind the cursor so taps that just landed still flash
    for (let i = Math.max(0, this.cursor - 16); i < this.notes.length; i++) {
      const n = this.notes[i]
      if (n.time > t + 0.02) break
      if (this.states[i] === 'holding' || (this.states[i] === 'hit' && t - n.time < 0.1)) lanes[n.lane] = true
    }
  }
}
