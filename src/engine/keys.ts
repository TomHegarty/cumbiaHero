/** Home-row lanes, left to right. Uses KeyboardEvent.code so any layout works. */
export const LANE_CODES = [
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
] as const

export const LANE_LABELS = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'] as const

export const LANE_COUNT = LANE_CODES.length

/** Neon sonidero palette, one per lane. */
export const LANE_COLORS = [
  '#ff3d7f',
  '#ff8a00',
  '#ffd400',
  '#3dff8a',
  '#00e0ff',
  '#3d7fff',
  '#b04dff',
  '#ff4df0',
] as const

export function laneForCode(code: string): number {
  return (LANE_CODES as readonly string[]).indexOf(code)
}
