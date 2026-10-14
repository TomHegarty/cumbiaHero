export interface Settings {
  /** Input/audio latency compensation in milliseconds (positive = you hit late). */
  offsetMs: number
  /** Seconds a note is visible before reaching the hit line. */
  lookahead: number
  volume: number
}

const KEY = 'cumbiaHero.settings'

const DEFAULTS: Settings = { offsetMs: 0, lookahead: 1.6, volume: 0.5 }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    // storage unavailable
  }
  return { ...DEFAULTS }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable
  }
}

const BEST_KEY = 'cumbiaHero.best'

export function loadBest(songId: string, chart: string): number {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>
    return all[`${songId}/${chart}`] ?? 0
  } catch {
    return 0
  }
}

export function saveBest(songId: string, chart: string, score: number): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>
    const k = `${songId}/${chart}`
    if ((all[k] ?? 0) >= score) return false
    all[k] = score
    localStorage.setItem(BEST_KEY, JSON.stringify(all))
    return true
  } catch {
    return false
  }
}

const NAME_KEY = 'cumbiaHero.name'
export const NAME_MAX = 14

/** A player name as shown on the versus banner: trimmed, single-spaced, capped. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
}

export function loadName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) ?? '')
  } catch {
    return ''
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, cleanName(name))
  } catch {
    // storage unavailable
  }
}
