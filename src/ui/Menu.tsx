import { LANE_COLORS, LANE_LABELS } from '../engine/keys'
import { useT } from '../i18n'
import { loadBest } from '../settings'
import { SONGS } from '../songs'
import type { Song } from '../songs/types'

interface Props {
  onPlay: (song: Song, chartKey: string) => void
  onCalibrate: () => void
  onBattle: () => void
  onEditor: (song: Song, chartKey: string) => void
  offsetMs: number
}

export function Menu({ onPlay, onCalibrate, onBattle, onEditor, offsetMs }: Props) {
  const t = useT()
  return (
    <div className="panel menu">
      <h1 className="logo" data-tag={t.tag}>
        <span className="word">Cumbia</span>
        <span className="word gold">Hero</span>
      </h1>
      <div className="ribbon">{t.ribbon}</div>

      <div className="keys">
        {LANE_LABELS.map((k, i) => (
          <kbd key={k} style={{ background: LANE_COLORS[i] }}>
            {k}
          </kbd>
        ))}
      </div>
      <p className="hint">
        {t.hintHit} · {t.hintHold} · <kbd>{t.space}</kbd> {t.hintSabor} · <kbd>Esc</kbd> {t.hintPause}
      </p>

      <button className="hot battle-cta" onClick={onBattle}>
        {t.battle}
        <small>{t.battleSub}</small>
      </button>

      <h3 className="section">{t.practice}</h3>
      <p className="hint">{t.practiceHint}</p>
      <ul className="songs">
        {SONGS.map((song, i) =>
          Object.entries(song.charts).map(([key, chart]) => (
            <li key={`${song.id}/${key}`}>
              <div className="cd" />
              <div className="info">
                <div className="title">{song.title}</div>
                <div className="artist">{song.artist}</div>
                <div className="meta">
                  {chart.name} · {song.tempo[0].bpm} BPM · {t.notes(chart.notes.length)}
                  {chart.source === 'generated' && ` · ${t.autoCharted}`} · {t.best}{' '}
                  {Math.round(loadBest(song.id, key)).toLocaleString()}
                </div>
              </div>
              <div className="row">
                <button className="hot" onClick={() => onPlay(song, key)} disabled={chart.notes.length === 0}>
                  {t.play}
                </button>
                <button className="secondary" onClick={() => onEditor(song, key)}>
                  {t.editor}
                </button>
              </div>
              {i === 0 && (
                <div className="sticker">
                  {t.hitSticker[0]}
                  <br />
                  {t.hitSticker[1]}
                </div>
              )}
            </li>
          )),
        )}
      </ul>

      <div className="settings">
        <button className="secondary" onClick={onCalibrate}>
          {t.calibrate(offsetMs)}
        </button>
      </div>
    </div>
  )
}
