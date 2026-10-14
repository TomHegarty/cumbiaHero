import { describe, expect, it } from 'vitest'
import type { JudgeEvent, TimedNote } from './judge'
import { RemotePlayer } from './remote'

const note = (time: number, lane: number, end = time): TimedNote => ({ time, lane, end })

describe('RemotePlayer', () => {
  it('replays streamed grades in the same note order as the Judge', () => {
    const rp = new RemotePlayer([note(2, 1), note(1, 3), note(1, 0)])
    const seen: JudgeEvent[] = []
    rp.onJudge((e) => seen.push(e))
    rp.receive(0, 'perfect') // t=1 lane 0 sorts first
    rp.receive(2, 'miss')
    rp.update(1.2)
    expect(seen.map((e) => [e.lane, e.grade])).toEqual([
      [0, 'perfect'],
      [1, 'miss'],
    ])
    expect(rp.states).toEqual(['hit', 'pending', 'missed'])
  })
  it('ignores duplicates and indices it does not know', () => {
    const rp = new RemotePlayer([note(1, 0)])
    let n = 0
    rp.onJudge(() => n++)
    rp.receive(0, 'good')
    rp.receive(0, 'perfect')
    rp.receive(9, 'perfect')
    rp.update(1)
    expect(n).toBe(1)
  })
  it('holds long notes until they end', () => {
    const rp = new RemotePlayer([note(1, 2, 3)])
    rp.receive(0, 'perfect')
    rp.update(1.1)
    expect(rp.states[0]).toBe('holding')
    const lanes = [false, false, false, false]
    rp.pressedAt(2, lanes)
    expect(lanes[2]).toBe(true)
    rp.update(3)
    expect(rp.states[0]).toBe('held')
  })
})
