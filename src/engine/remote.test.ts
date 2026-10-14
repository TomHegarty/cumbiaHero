import { describe, expect, it } from 'vitest'
import type { JudgeEvent } from './judge'
import { RemotePlayer } from './remote'

const notes = [
  { time: 2, end: 2, lane: 1 },
  { time: 1, end: 1, lane: 0 },
  { time: 3, end: 4, lane: 2 },
]

describe('RemotePlayer', () => {
  it('orders notes the way the Judge does, so indexes match', () => {
    const r = new RemotePlayer(notes)
    expect(r.notes.map((n) => n.time)).toEqual([1, 2, 3])
  })

  it('applies streamed results on the next update, once each', () => {
    const r = new RemotePlayer(notes)
    const seen: JudgeEvent[] = []
    r.onJudge((e) => seen.push(e))
    r.receive(0, 'perfect')
    r.receive(1, 'miss')
    r.receive(0, 'good')
    r.receive(7, 'perfect')
    expect(r.states).toEqual(['pending', 'pending', 'pending'])
    r.update(2.2)
    expect(r.states).toEqual(['hit', 'missed', 'pending'])
    expect(seen.map((e) => [e.index, e.grade])).toEqual([
      [0, 'perfect'],
      [1, 'miss'],
    ])
  })

  it('holds long notes until their end', () => {
    const r = new RemotePlayer(notes)
    r.receive(2, 'good')
    r.update(3.2)
    expect(r.states[2]).toBe('holding')
    const lanes = [false, false, false, false, false]
    r.pressedAt(3.5, lanes)
    expect(lanes[2]).toBe(true)
    r.update(4.1)
    expect(r.states[2]).toBe('held')
  })
})
