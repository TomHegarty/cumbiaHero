import { LANE_COLORS, LANE_LABELS } from '../engine/keys'
import { loadBest } from '../settings'
import { SONGS } from '../songs'
import type { Song } from '../songs/types'

interface Props {
  onPlay: (song: Song, chartKey: string) => void
  onCalibrate: () => void
  onEditor: (song: Song, chartKey: string) => void
  offsetMs: number
}

export function Menu({ onPlay, onCalibrate, onEditor, offsetMs }: Props) {
  return (
    <div className="panel menu">
      <h1 className="logo">
        Cumbia <span>Hero</span>
      </h1>
      <p className="subtitle">Toca el teclado. Sigue la cumbia.</p>

      <div className="keys">
        {LANE_LABELS.map((k, i) => (
          <kbd key={k} style={{ borderColor: LANE_COLORS[i], color: LANE_COLORS[i] }}>
            {k}
          </kbd>
        ))}
      </div>
      <p className="hint">
        Hit notes as they cross the line · hold long notes · <kbd>Space</kbd> unleashes Sabor ·{' '}
        <kbd>Esc</kbd> pauses
      </p>

      <ul className="songs">
        {SONGS.map((song) =>
          Object.entries(song.charts).map(([key, chart]) => (
            <li key={`${song.id}/${key}`}>
              <div>
                <strong>{song.title}</strong> — {song.artist}
                <div className="meta">
                  {chart.name} · {song.tempo[0].bpm} BPM · {chart.notes.length} notas
                  {chart.source === 'generated' && ' · auto-charted'} · récord{' '}
                  {Math.round(loadBest(song.id, key)).toLocaleString()}
                </div>
              </div>
              <div className="row">
                <button onClick={() => onPlay(song, key)} disabled={chart.notes.length === 0}>
                  ¡Tocar!
                </button>
                <button className="secondary" onClick={() => onEditor(song, key)}>
                  Editor
                </button>
              </div>
            </li>
          )),
        )}
      </ul>

      <button className="secondary" onClick={onCalibrate}>
        Calibrar ({offsetMs} ms)
      </button>
    </div>
  )
}
