/**
 * Invite codes: six characters from an alphabet without look-alikes (no 0/O,
 * 1/I/L), so a code read aloud or typed by hand still works.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function makeCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  return code
}

/** A valid code, normalised to upper case, or null. */
export function cleanCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase()
  if (code.length !== CODE_LENGTH) return null
  for (const c of code) if (!CODE_ALPHABET.includes(c)) return null
  return code
}

/** The lobby code in a page URL's `?lobby=` parameter, if any. */
export function codeFromUrl(href: string): string | null {
  return cleanCode(new URL(href).searchParams.get('lobby'))
}

/** The page URL with `?lobby=` set, or removed when `code` is null. */
export function withCode(href: string, code: string | null): string {
  const url = new URL(href)
  if (code) url.searchParams.set('lobby', code)
  else url.searchParams.delete('lobby')
  url.hash = ''
  return url.toString()
}
