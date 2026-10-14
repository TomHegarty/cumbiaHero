import type { DuelResult } from '../engine/duel'
import { accuracy, letterGrade, type Stats } from '../engine/judge'
import { useT } from '../i18n'

interface Props {
  /** Line above the verdict, e.g. "La Resaka — Supermerk2". */
  subtitle: string
  stats: Stats
  duel?: DuelResult
  newBest: boolean
  onRetry: () => void
  onMenu: () => void
}

export function Results({ subtitle, stats, duel, newBest, onRetry, onMenu }: Props) {
  const t = useT()
  const acc = accuracy(stats)
  return (
    <div className="panel results">
      <p className="subtitle">{subtitle}</p>
      {duel && <DuelVerdict duel={duel} />}
      <div className="grade gold">{letterGrade(acc)}</div>
      <div className="score">{Math.round(stats.score).toLocaleString()}</div>
      {newBest && <p className="new-best">{t.newBest}</p>}
      <table>
        <tbody>
          <tr>
            <td>{t.accuracy}</td>
            <td>{(acc * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>{t.perfect}</td>
            <td>{stats.perfect}</td>
          </tr>
          <tr>
            <td>{t.good}</td>
            <td>{stats.good}</td>
          </tr>
          <tr>
            <td>{t.miss}</td>
            <td>{stats.miss}</td>
          </tr>
          <tr>
            <td>{t.maxCombo}</td>
            <td>{stats.maxCombo}</td>
          </tr>
        </tbody>
      </table>
      <div className="stack">
        <button className="hot" autoFocus onClick={onRetry}>
          {t.again}
        </button>
        <button onClick={onMenu}>{t.menu}</button>
      </div>
    </div>
  )
}

function DuelVerdict({ duel }: { duel: DuelResult }) {
  const t = useT()
  const pct = (v: number) => `${Math.round(Math.max(0, v) * 100)}%`
  const won = duel.you > duel.rival
  const tie = Math.abs(duel.you - duel.rival) < 0.005
  return (
    <div className={`duel-verdict ${tie ? 'tie' : won ? 'won' : 'lost'}`}>
      <strong>{tie ? t.tie : won ? t.youWon(duel.rivalName) : t.youLost(duel.rivalName)}</strong>
      <span>
        {duel.youName} {pct(duel.you)} · {duel.rivalName} {pct(duel.rival)}
      </span>
    </div>
  )
}
