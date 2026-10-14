import { useEffect, useRef, useState } from 'react'
import { loadSongTracks, SongPlayer } from '../engine/audio'
import { SET_SIZE } from '../engine/battle'
import { SongTiming } from '../engine/chart'
import { MELODIES, type Melody } from '../melodies'
import { cleanName, loadName, NAME_MAX, saveName } from '../settings'

interface Props {
  volume: number
  onStart: (picks: string[], name: string) => void
  onBack: () => void
}

/** What the versus banner calls you when you leave the name blank. */
export const DEFAULT_NAME = 'VOS'

const PREVIEW_SECONDS = 8

/**
 * Everything before a battle: your name, your opponent and the melodies you'll
 * bring, in the order you'll play them.
 */
export function PreGame({ volume, onStart, onBack }: Props) {
  const [name, setName] = useState(loadName)
  const [picks, setPicks] = useState<string[]>([])
  const [previewing, setPreviewing] = useState<string | null>(null)
  const preview = useRef<{ player: SongPlayer; timer: number } | null>(null)
  // Bumped on every start/stop so a preview that finishes loading late doesn't play
  const request = useRef(0)

  const stopPreview = () => {
    request.current++
    if (preview.current) {
      clearTimeout(preview.current.timer)
      preview.current.player.dispose()
      preview.current = null
    }
    setPreviewing(null)
  }
  useEffect(() => stopPreview, [])

  const toggle = (id: string) =>
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < SET_SIZE ? [...p, id] : p))

  const listen = (m: Melody) => {
    const again = previewing === m.id
    stopPreview()
    if (again) return
    setPreviewing(m.id)
    const id = request.current
    void loadSongTracks(m.song).then(({ main, lead }) => {
      if (request.current !== id) return
      const player = new SongPlayer(main, undefined, lead)
      player.setVolume(volume)
      // Start a beat before the first note
      const first = Math.min(...m.chart.notes.map((n) => n.b))
      player.play(Math.max(0, new SongTiming(m.song).noteTime(first - 1)))
      const timer = window.setTimeout(stopPreview, PREVIEW_SECONDS * 1000)
      preview.current = { player, timer }
    })
  }

  const full = picks.length === SET_SIZE
  return (
    <div className="panel setlist pregame">
      <h2 className="chrome">Antes de la batalla</h2>

      <div className="lineup">
        <label className="player-card you">
          <span className="tag">Vos</span>
          <input
            className="name"
            value={name}
            maxLength={NAME_MAX}
            placeholder={DEFAULT_NAME}
            aria-label="Tu nombre"
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
          <span className="status">{picks.length} de {SET_SIZE} melodías</span>
        </label>
        <div className="vs">VS</div>
        <div className="player-card rival">
          <span className="tag">Rival</span>
          <span className="name">EL RAYO</span>
          <span className="status">La máquina · trae su propia lista</span>
        </div>
      </div>

      <h3 className="section">Armá tu lista</h3>
      <p className="hint">Elegí {SET_SIZE} melodías. Las tocás en este orden, turnándote con tu rival.</p>

      <ul className="melodies">
        {MELODIES.map((m) => {
          const n = picks.indexOf(m.id)
          return (
            <li key={m.id} className={n >= 0 ? 'picked' : full ? 'dim' : undefined}>
              <button className="pick" onClick={() => toggle(m.id)} aria-pressed={n >= 0}>
                <span className="num">{n >= 0 ? n + 1 : '+'}</span>
                <span className="info">
                  <span className="title">{m.title}</span>
                  <span className="artist">{m.artist}</span>
                  <span className="meta">
                    {m.part} · {Math.round(m.song.tempo[0].bpm)} BPM · {m.chart.notes.length} notas
                  </span>
                </span>
                {m.demo && (
                  <span className="demo" title="Riff de muestra hasta que se procese la grabación">
                    demo
                  </span>
                )}
              </button>
              <button
                className="secondary listen"
                onClick={() => listen(m)}
                aria-label={`Escuchar ${m.title}`}
              >
                {previewing === m.id ? '■' : '▶'}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="tray">
        {Array.from({ length: SET_SIZE }, (_, i) => {
          const m = MELODIES.find((x) => x.id === picks[i])
          return (
            <span key={i} className={m ? 'slot filled' : 'slot'}>
              <b>{i + 1}</b> {m ? m.title : '—'}
            </span>
          )
        })}
      </div>
      <div className="row center">
        <button
          onClick={() => {
            stopPreview()
            onBack()
          }}
        >
          Volver
        </button>
        <button
          className="hot"
          disabled={!full}
          onClick={() => {
            stopPreview()
            const clean = cleanName(name)
            saveName(clean)
            onStart(picks, clean || DEFAULT_NAME)
          }}
        >
          ¡Listo!
        </button>
      </div>
    </div>
  )
}
