import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, CODE_LENGTH, cleanCode, codeFromUrl, makeCode, withCode } from './code'

describe('invite codes', () => {
  it('makes codes from the look-alike-free alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect(cleanCode(code)).toBe(code)
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/)
  })
  it('covers the whole alphabet, including its last letter', () => {
    expect(makeCode(() => 0)).toBe('AAAAAA')
    expect(makeCode(() => 0.9999)).toBe('999999')
  })
  it('accepts lower case and rejects anything else', () => {
    expect(cleanCode(' k7q2xm ')).toBe('K7Q2XM')
    expect(cleanCode('K7Q2X')).toBeNull()
    expect(cleanCode('K7Q2X0')).toBeNull()
    expect(cleanCode(null)).toBeNull()
  })
  it('reads and writes the lobby parameter', () => {
    const base = 'https://tomhegarty.github.io/cumbiaHero/'
    const link = withCode(base, 'K7Q2XM')
    expect(link).toBe('https://tomhegarty.github.io/cumbiaHero/?lobby=K7Q2XM')
    expect(codeFromUrl(link)).toBe('K7Q2XM')
    expect(withCode(link, null)).toBe(base)
    expect(codeFromUrl(base)).toBeNull()
  })
})
