import type { Song } from './types'
import resaka from './resaka'

/** All playable songs. To add one, create a folder like ./resaka and list it here. */
export const SONGS: Song[] = [resaka]

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id)
}
