/** A single chart note. Times are in beats so charts survive tempo/offset tweaks. */
export interface ChartNote {
  /** Beat position from beat 0 of the song's tempo map. */
  b: number
  /** Lane index, 0-7 (A S D F J K L ;). */
  l: number
  /** Hold length in beats. Omitted or 0 for a tap. */
  d?: number
}

export interface Chart {
  /** Free-form label, e.g. "Normal". */
  name: string
  /** How the chart was made, shown in song select. */
  source: 'generated' | 'hand-charted'
  notes: ChartNote[]
}

/** A tempo change taking effect at `beat`. The first entry must be at beat 0. */
export interface TempoPoint {
  beat: number
  bpm: number
}

export interface Song {
  id: string
  title: string
  artist: string
  /** Audio URL relative to the site base (public/ folder). */
  audio: string
  /** Seconds into the audio file where beat 0 falls. */
  offset: number
  tempo: TempoPoint[]
  /**
   * Swing/feel: offsets in beats for each 16th of the beat (1, e, &, a).
   * Charts stay on a clean grid; hit times shift to match the recording.
   */
  groove?: [number, number, number, number]
  /** Beats per bar, used for drawing bar lines. */
  beatsPerBar: number
  charts: Record<string, Chart>
}
