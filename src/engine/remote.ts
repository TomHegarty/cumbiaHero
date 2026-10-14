import type { Grade, JudgeEvent, NoteState, TimedNote } from './judge'

/** The rival's side of the highway: El Rayo, or a player on the other end of the line. */
export interface RivalPlayer {
  readonly notes: TimedNote[]
  readonly states: NoteState[]
  onJudge(fn: (e: JudgeEvent) => void): void
  update(t: number): void
  pressedAt(t: number, lanes: boolean[]): void
}

/**
 * An online opponent. Their own browser judges their notes and streams the
 * grades; this replays them on your highway as they arrive, the way AiPlayer
 * replays its rolls. Notes sort the same way as Judge's, so indices match.
 */
export class RemotePlayer implements RivalPlayer {
  readonly notes: TimedNote[]
  readonly states: NoteState[]
  private readonly inbox: { index: number; grade: Grade }[] = []
  private readonly listeners: ((e: JudgeEvent) => void)[] = []
  private readonly hitAt: number[]

  constructor(notes: TimedNote[]) {
    this.notes = [...notes].sort((a, b) => a.time - b.time || a.lane - b.lane)
    this.states = this.notes.map(() => 'pending')
    this.hitAt = this.notes.map(() => -Infinity)
  }

  /** A grade from the wire. Duplicates and unknown notes are ignored. */
  receive(index: number, grade: Grade): void {
    this.inbox.push({ index, grade })
  }

  onJudge(fn: (e: JudgeEvent) => void): void {
    this.listeners.push(fn)
  }

  update(t: number): void {
    for (const { index, grade } of this.inbox.splice(0)) {
      const n = this.notes[index]
      if (!n || this.states[index] !== 'pending') continue
      this.states[index] = grade === 'miss' ? 'missed' : n.end > n.time && t < n.end ? 'holding' : 'hit'
      this.hitAt[index] = t
      for (const fn of this.listeners) fn({ grade, lane: n.lane, time: t, index })
    }
    for (let i = 0; i < this.notes.length; i++) {
      if (this.states[i] === 'holding' && t >= this.notes[i].end) this.states[i] = 'held'
    }
  }

  /** Lights a key briefly as each grade lands, and for the length of a held note. */
  pressedAt(t: number, lanes: boolean[]): void {
    lanes.fill(false)
    for (let i = 0; i < this.notes.length; i++) {
      if (this.states[i] === 'holding' || (this.states[i] === 'hit' && t - this.hitAt[i] < 0.1)) {
        lanes[this.notes[i].lane] = true
      }
    }
  }
}
