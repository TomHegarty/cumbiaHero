import { accuracy, letterGrade, type Stats } from '../engine/judge'
import type { Song } from '../songs/types'

interface Props {
  song: Song
  stats: Stats
  newBest: boolean
  onRetry: () => void
  onMenu: () => void
}

export function Results({ song, stats, newBest, onRetry, onMenu }: Props) {
  const acc = accuracy(stats)
  return (
    <div className="panel results">
      <p className="subtitle">
        {song.title} — {song.artist}
      </p>
      <div className="grade">{letterGrade(acc)}</div>
      <h2>{Math.round(stats.score).toLocaleString()}</h2>
      {newBest && <p className="new-best">¡Nuevo récord!</p>}
      <table>
        <tbody>
          <tr>
            <td>Accuracy</td>
            <td>{(acc * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Perfecto</td>
            <td>{stats.perfect}</td>
          </tr>
          <tr>
            <td>Bien</td>
            <td>{stats.good}</td>
          </tr>
          <tr>
            <td>Fallo</td>
            <td>{stats.miss}</td>
          </tr>
          <tr>
            <td>Max combo</td>
            <td>{stats.maxCombo}</td>
          </tr>
        </tbody>
      </table>
      <div className="stack">
        <button autoFocus onClick={onRetry}>
          Otra vez
        </button>
        <button onClick={onMenu}>Menú</button>
      </div>
    </div>
  )
}
