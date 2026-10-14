import { describe, expect, it } from 'vitest'
import { GOOD_WINDOW, Judge, multiplierFor } from './judge'

const tap = (time: number, lane = 0) => ({ time, end: time, lane })

describe('Judge', () => {
  it('grades perfect and good hits', () => {
    const j = new Judge([tap(1), tap(2)])
    expect(j.press(0, 1.01)).toBe('perfect')
    expect(j.press(0, 2.08)).toBe('good')
    expect(j.stats.perfect).toBe(1)
    expect(j.stats.good).toBe(1)
    expect(j.stats.combo).toBe(2)
  })

  it('ignores presses outside the window or in the wrong lane', () => {
    const j = new Judge([tap(1, 3)])
    expect(j.press(3, 1 - GOOD_WINDOW - 0.05)).toBeNull()
    expect(j.press(2, 1)).toBeNull()
    expect(j.press(3, 1)).toBe('perfect')
  })

  it('misses notes that pass and resets combo', () => {
    const j = new Judge([tap(1), tap(1.5), tap(3)])
    j.press(0, 1)
    j.update(2)
    expect(j.stats.miss).toBe(1)
    expect(j.stats.combo).toBe(0)
    expect(j.states).toEqual(['hit', 'missed', 'pending'])
  })

  it('handles chords across lanes', () => {
    const j = new Judge([tap(1, 0), tap(1, 5)])
    expect(j.press(5, 1)).toBe('perfect')
    expect(j.press(0, 1.02)).toBe('perfect')
    expect(j.finished).toBe(true)
  })

  it('scores holds and detects early release', () => {
    const j = new Judge([
      { time: 1, end: 3, lane: 2 },
      { time: 4, end: 6, lane: 2 },
    ])
    j.press(2, 1)
    j.update(2)
    j.update(3.01)
    expect(j.states[0]).toBe('held')
    j.press(2, 4)
    j.update(4.5)
    j.release(2, 4.6)
    expect(j.states[1]).toBe('dropped')
    expect(j.stats.score).toBeGreaterThan(200)
  })

  it('caps the multiplier and doubles it during sabor', () => {
    expect(multiplierFor(0, false)).toBe(1)
    expect(multiplierFor(25, false)).toBe(3)
    expect(multiplierFor(100, false)).toBe(4)
    expect(multiplierFor(100, true)).toBe(8)
  })

  it('only activates sabor once the meter is half full', () => {
    const notes = Array.from({ length: 30 }, (_, i) => tap(i))
    const j = new Judge(notes)
    expect(j.activateSabor()).toBe(false)
    for (let i = 0; i < 20; i++) j.press(0, i)
    expect(j.activateSabor()).toBe(true)
    expect(j.multiplier).toBe(6)
  })
})
