import { useEffect, useRef, useState } from 'react'
import { loadSongTracks, SongPlayer } from '../engine/audio'
import { SET_SIZE } from '../engine/battle'
import { SongTiming } from '../engine/chart'
import { MELODIES, type Melody } from '../melodies'

interface Props {
  volume: number
  picks: string[]
  onPicks: (picks: string[]) => void
  /** No changes while you're marked ready. */
  locked?: boolean
}

const PREVIEW_SECONDS = 8

/** Pick the melodies you'll bring to the battle, in the order you'll play them. */
export function MelodyPicker({ volume, picks, onPicks, locked = false }: Props) {
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

  const toggle = (id: string) => {
    if (locked) return
    onPicks(picks.includes(id) ? picks.filter((x) => x !== id) : picks.length < SET_SIZE ? [...picks, id] : picks)
  }

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
    <>
      <ul className={locked ? 'melodies locked' : 'melodies'}>
        {MELODIES.map((m) => {
          const n = picks.indexOf(m.id)
          return (
            <li key={m.id} className={n >= 0 ? 'picked' : full || locked ? 'dim' : undefined}>
              <button className="pick" onClick={() => toggle(m.id)} aria-pressed={n >= 0} disabled={locked}>
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
    </>
  )
}
