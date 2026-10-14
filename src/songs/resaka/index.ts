import type { Chart, Song } from '../types'
import normal from './chart.normal.json'

const song: Song = {
  id: 'resaka',
  title: 'La Resaka',
  artist: 'Supermerk2',
  audio: 'songs/resaka/audio.mp3',
  // Beat 0 position and tempo were measured from the audio by tools/chartgen.
  offset: 0.48,
  tempo: [{ beat: 0, bpm: 86 }],
  // The off-beat keyboard stabs and güira are pushed ahead of a straight grid.
  groove: [0, -0.03, -0.07, -0.05],
  beatsPerBar: 4,
  charts: { normal: normal as Chart },
}

export default song
