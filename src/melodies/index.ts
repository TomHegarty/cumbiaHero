import type { Chart, Song } from '../songs/types'
import { DEMO_RIFFS, demoChart } from './demo'
import library from './library.json'

/**
 * The battle library: highlight sections ("melodías") from cumbia villera
 * songs, each played over that song's own backing track.
 *
 * library.json lists the songs and which section of each to play. A melody
 * becomes real once tools/melodies/build_melody.py has cut and charted the
 * recording: it writes clips/<id>.json here and the backing and lead audio to
 * public/melodies/<id>/. Until then the melody plays a synthesized demo riff.
 */

export interface LibraryEntry {
  id: string
  title: string
  artist: string
  /** Which part of the song the melody is, e.g. "Riff de intro". */
  part: string
  /** Where the section sits in the full recording, in seconds. */
  start: number
  end: number
  /** True while start/end are an estimate not yet checked against the recording. */
  approx: boolean
  /** demucs stems that carry the lead synth in this section. */
  leadStems: string[]
}

/** What build_melody.py writes for a processed clip. */
export interface ClipInfo {
  bpm: number
  /** Seconds into the clip where beat 0 falls. */
  offset: number
  groove: [number, number, number, number]
  beatsPerBar: number
  chart: Chart
}

export interface Melody extends LibraryEntry {
  /** Synthesized stand-in rather than the real recording. */
  demo: boolean
  song: Song
  chart: Chart
}

const clips = import.meta.glob<ClipInfo>('./clips/*.json', { eager: true, import: 'default' })

function clipFor(id: string): ClipInfo | undefined {
  return clips[`./clips/${id}.json`]
}

function buildMelody(entry: LibraryEntry): Melody {
  const clip = clipFor(entry.id)
  if (clip) {
    const song: Song = {
      id: `melody-${entry.id}`,
      title: entry.title,
      artist: entry.artist,
      audio: `melodies/${entry.id}/backing.mp3`,
      lead: `melodies/${entry.id}/lead.mp3`,
      offset: clip.offset,
      tempo: [{ beat: 0, bpm: clip.bpm }],
      groove: clip.groove,
      beatsPerBar: clip.beatsPerBar,
      charts: { normal: clip.chart },
    }
    return { ...entry, demo: false, song, chart: clip.chart }
  }
  const riff = DEMO_RIFFS[entry.id]
  const chart = demoChart(riff)
  const song: Song = {
    id: `melody-${entry.id}`,
    title: entry.title,
    artist: entry.artist,
    audio: '',
    offset: (60 / riff.bpm) * 4 + 0.25,
    tempo: [{ beat: 0, bpm: riff.bpm }],
    groove: [0, -0.02, -0.05, -0.03],
    beatsPerBar: 4,
    charts: { normal: chart },
  }
  let tracks: ReturnType<NonNullable<Song['synth']>> | undefined
  song.synth = () => (tracks ??= import('./synth').then(({ renderDemo }) => renderDemo(song, riff)))
  return { ...entry, demo: true, song, chart }
}

export const MELODIES: Melody[] = (library as LibraryEntry[]).map(buildMelody)

export function melodyById(id: string): Melody | undefined {
  return MELODIES.find((m) => m.id === id)
}
