import { describe, expect, it } from 'vitest'
import { cleanName, NAME_MAX } from './settings'

describe('cleanName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanName('  Sofi   la  \n reina ')).toBe('Sofi la reina')
  })
  it('caps the length without leaving a trailing space', () => {
    expect(cleanName('a'.repeat(30))).toHaveLength(NAME_MAX)
    expect(cleanName('abcdefghijklm nopq')).toBe('abcdefghijklm')
  })
})
