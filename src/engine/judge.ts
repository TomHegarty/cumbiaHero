/** Timing windows in seconds (±). */
export const PERFECT_WINDOW = 0.05
export const GOOD_WINDOW = 0.1
/** A hold counts as completed if released this close to its end. */
export const HOLD_RELEASE_GRACE = 0.12

const PERFECT_POINTS = 100
const GOOD_POINTS = 50
const HOLD_POINTS_PER_SECOND = 60
const SABOR_PER_PERFECT = 0.025
const SABOR_PER_GOOD = 0.01
const SABOR_DRAIN_PER_SECOND = 0.08
export const SABOR_MIN_TO_ACTIVATE = 0.5

export interface TimedNote {
  time: number
  /** Equal to `time` for taps. */
  end: number
  lane: number
}

export type NoteState = 'pending' | 'hit' | 'holding' | 'held' | 'dropped' | 'missed'

export type Grade = 'perfect' | 'good' | 'miss'

export interface JudgeEvent {
  grade: Grade
  lane: number
  time: number
  /** Which note, as an index into the player's time-sorted notes. */
  index: number
}

export interface Stats {
  score: number
  combo: number
  maxCombo: number
  perfect: number
  good: number
  miss: number
  total: number
  sabor: number
  saborActive: boolean
}

export function multiplierFor(combo: number, saborActive: boolean): number {
  const base = Math.min(4, 1 + Math.floor(combo / 10))
  return saborActive ? base * 2 : base
}

/** Pure scoring state machine: feed it presses, releases and clock ticks. */
export class Judge {
  readonly notes: TimedNote[]
  readonly states: NoteState[]
  readonly stats: Stats
  /** Index of the first note that might still need attention. */
  private cursor = 0
  private lastUpdate = -Infinity
  private readonly holding = new Map<number, number>()
  private readonly listeners: ((e: JudgeEvent) => void)[] = []

  constructor(notes: TimedNote[]) {
    this.notes = [...notes].sort((a, b) => a.time - b.time || a.lane - b.lane)
    this.states = this.notes.map(() => 'pending')
    this.stats = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      total: this.notes.length,
      sabor: 0,
      saborActive: false,
    }
  }

  onJudge(fn: (e: JudgeEvent) => void): void {
    this.listeners.push(fn)
  }

  get multiplier(): number {
    return multiplierFor(this.stats.combo, this.stats.saborActive)
  }

  get finished(): boolean {
    return this.cursor >= this.notes.length && this.holding.size === 0
  }

  isHolding(lane: number): boolean {
    return this.holding.has(lane)
  }

  press(lane: number, t: number): Grade | null {
    let best = -1
    let bestDelta = Infinity
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]
      if (n.time - t > GOOD_WINDOW) break
      if (n.lane !== lane || this.states[i] !== 'pending') continue
      const delta = Math.abs(n.time - t)
      if (delta <= GOOD_WINDOW && delta < bestDelta) {
        best = i
        bestDelta = delta
      }
    }
    if (best < 0) return null

    const grade: Grade = bestDelta <= PERFECT_WINDOW ? 'perfect' : 'good'
    const s = this.stats
    s.combo++
    s.maxCombo = Math.max(s.maxCombo, s.combo)
    if (grade === 'perfect') {
      s.perfect++
      if (!s.saborActive) s.sabor = Math.min(1, s.sabor + SABOR_PER_PERFECT)
    } else {
      s.good++
      if (!s.saborActive) s.sabor = Math.min(1, s.sabor + SABOR_PER_GOOD)
    }
    s.score += (grade === 'perfect' ? PERFECT_POINTS : GOOD_POINTS) * this.multiplier

    const n = this.notes[best]
    if (n.end > n.time) {
      this.states[best] = 'holding'
      this.holding.set(lane, best)
    } else {
      this.states[best] = 'hit'
    }
    this.emit({ grade, lane, time: t, index: best })
    this.advanceCursor()
    return grade
  }

  release(lane: number, t: number): void {
    const idx = this.holding.get(lane)
    if (idx === undefined) return
    this.holding.delete(lane)
    const n = this.notes[idx]
    this.awardHold(n, t)
    this.states[idx] = t >= n.end - HOLD_RELEASE_GRACE ? 'held' : 'dropped'
  }

  activateSabor(): boolean {
    const s = this.stats
    if (s.saborActive || s.sabor < SABOR_MIN_TO_ACTIVATE) return false
    s.saborActive = true
    return true
  }

  /** Advance the clock: misses, hold sustain points and sabor drain. */
  update(t: number): void {
    const dt = this.lastUpdate === -Infinity ? 0 : Math.max(0, t - this.lastUpdate)
    const prev = this.lastUpdate
    this.lastUpdate = t

    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]
      if (n.time + GOOD_WINDOW >= t) break
      if (this.states[i] === 'pending') {
        this.states[i] = 'missed'
        this.stats.miss++
        this.stats.combo = 0
        this.emit({ grade: 'miss', lane: n.lane, time: t, index: i })
      }
    }
    this.advanceCursor()

    for (const [lane, idx] of this.holding) {
      const n = this.notes[idx]
      const from = Math.max(prev, n.time)
      const to = Math.min(t, n.end)
      if (to > from) this.stats.score += (to - from) * HOLD_POINTS_PER_SECOND * this.multiplier
      if (t >= n.end) {
        this.states[idx] = 'held'
        this.holding.delete(lane)
      }
    }

    const s = this.stats
    if (s.saborActive) {
      s.sabor = Math.max(0, s.sabor - dt * SABOR_DRAIN_PER_SECOND)
      if (s.sabor === 0) s.saborActive = false
    }
  }

  private awardHold(n: TimedNote, t: number): void {
    const from = Math.max(this.lastUpdate, n.time)
    const to = Math.min(t, n.end)
    if (to > from) this.stats.score += (to - from) * HOLD_POINTS_PER_SECOND * this.multiplier
  }

  private advanceCursor(): void {
    while (this.cursor < this.notes.length && this.states[this.cursor] !== 'pending') {
      this.cursor++
    }
  }

  private emit(e: JudgeEvent): void {
    for (const fn of this.listeners) fn(e)
  }
}

export function accuracy(s: Stats): number {
  if (s.total === 0) return 1
  return (s.perfect + s.good * 0.5) / s.total
}

export function letterGrade(acc: number): string {
  if (acc >= 0.95) return 'S'
  if (acc >= 0.85) return 'A'
  if (acc >= 0.7) return 'B'
  if (acc >= 0.55) return 'C'
  return 'D'
}
