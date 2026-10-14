import { LANE_COLORS, LANE_LABELS } from '../engine/keys'
import { loadBest } from '../settings'
import { SONGS } from '../songs'
import type { Song } from '../songs/types'

interface Props {
  onPlay: (song: Song, chartKey: string) => void
  onCalibrate: () => void
  onBattle: () => void
  onEditor: (song: Song, chartKey: string) => void
  offsetMs: number
  volume: number
  onVolume: (volume: number) => void
}

export function Menu({ onPlay, onCalibrate, onBattle, onEditor, offsetMs, volume, onVolume }: Props) {
  return (
    <div className="panel menu">
      <h1 className="logo">
        <span className="word">Cumbia</span>
        <span className="word gold">Hero</span>
      </h1>
      <div className="ribbon">¡Tocá el teclado, seguí la cumbia!</div>

      <div className="keys">
        {LANE_LABELS.map((k, i) => (
          <kbd key={k} style={{ background: LANE_COLORS[i] }}>
            {k}
          </kbd>
        ))}
      </div>
      <p className="hint">
        Hit notes as they cross the line · hold long notes · <kbd>Space</kbd> unleashes Sabor ·{' '}
        <kbd>Esc</kbd> pauses
      </p>

      <button className="hot battle-cta" onClick={onBattle}>
        ¡A batallar!
        <small>Armá tu lista de 3 y elegí tu rival</small>
      </button>

      <h3 className="section">Práctica</h3>
      <p className="hint">Una canción entera, turnándote con El Rayo cada 4 compases.</p>
      <ul className="songs">
        {SONGS.map((song, i) =>
          Object.entries(song.charts).map(([key, chart]) => (
            <li key={`${song.id}/${key}`}>
              <div className="cd" />
              <div className="info">
                <div className="title">{song.title}</div>
                <div className="artist">{song.artist}</div>
                <div className="meta">
                  {chart.name} · {song.tempo[0].bpm} BPM · {chart.notes.length} notas
                  {chart.source === 'generated' && ' · auto-charted'} · récord{' '}
                  {Math.round(loadBest(song.id, key)).toLocaleString()}
                </div>
              </div>
              <div className="row">
                <button className="hot" onClick={() => onPlay(song, key)} disabled={chart.notes.length === 0}>
                  ¡Tocar!
                </button>
                <button className="secondary" onClick={() => onEditor(song, key)}>
                  Editor
                </button>
              </div>
              {i === 0 && (
                <div className="sticker">
                  ¡EL
                  <br />
                  HIT!
                </div>
              )}
            </li>
          )),
        )}
      </ul>

      <div className="settings">
        <label className="volume">
          <span>Volumen</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolume(Number(e.target.value) / 100)}
          />
          <span className="pct">{Math.round(volume * 100)}%</span>
        </label>
        <button className="secondary" onClick={onCalibrate}>
          Calibrar ({offsetMs} ms)
        </button>
      </div>
    </div>
  )
}
