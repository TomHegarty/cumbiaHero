import type { Grade, JudgeEvent, NoteState, TimedNote } from './judge'

/** The other side of a battle as the game sees it: El Rayo, or a player on another screen. */
export interface Opponent {
  readonly notes: TimedNote[]
  readonly states: NoteState[]
  onJudge(fn: (e: JudgeEvent) => void): void
  update(t: number): void
  /** Lanes the opponent is pressing right now, for lighting its keys. */
  pressedAt(t: number, lanes: boolean[]): void
}

/**
 * An opponent playing on another screen. Their browser judges their own notes
 * and streams each result here by note index; results land on the highway as
 * they arrive, a moment after the note crosses the line.
 */
export class RemotePlayer implements Opponent {
  readonly notes: TimedNote[]
  readonly states: NoteState[]
  private readonly grades: (Grade | undefined)[]
  private readonly queue: number[] = []
  private readonly listeners: ((e: JudgeEvent) => void)[] = []

  constructor(notes: TimedNote[]) {
    // Sorted exactly as the Judge sorts them, so note indexes match on both screens
    this.notes = [...notes].sort((a, b) => a.time - b.time || a.lane - b.lane)
    this.states = this.notes.map(() => 'pending')
    this.grades = this.notes.map(() => undefined)
  }

  onJudge(fn: (e: JudgeEvent) => void): void {
    this.listeners.push(fn)
  }

  /** A result from the stream; repeats and unknown notes are ignored. */
  receive(index: number, grade: Grade): void {
    if (!(index >= 0 && index < this.notes.length) || this.grades[index]) return
    this.grades[index] = grade
    this.queue.push(index)
  }

  update(t: number): void {
    for (const i of this.queue) {
      const n = this.notes[i]
      const grade = this.grades[i] as Grade
      this.states[i] = grade === 'miss' ? 'missed' : n.end > n.time && t < n.end ? 'holding' : n.end > n.time ? 'held' : 'hit'
      for (const fn of this.listeners) fn({ grade, index: i, lane: n.lane, time: t })
    }
    this.queue.length = 0
    for (let i = 0; i < this.notes.length; i++) {
      if (this.states[i] === 'holding' && t >= this.notes[i].end) this.states[i] = 'held'
    }
  }

  pressedAt(t: number, lanes: boolean[]): void {
    lanes.fill(false)
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i]
      if (n.time > t + 0.02) break
      // Results arrive late, so a hit flashes for a little longer than El Rayo's
      if (this.states[i] === 'holding' || (this.states[i] === 'hit' && t - n.time < 0.35)) lanes[n.lane] = true
    }
  }
}
