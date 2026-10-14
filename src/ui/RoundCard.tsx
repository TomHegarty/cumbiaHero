import { partName, useT } from '../i18n'
import type { Melody } from '../melodies'

interface Props {
  index: number
  total: number
  yours: boolean
  rivalName: string
  melody: Melody
  /** A line that keeps the card up, e.g. a countdown or "waiting for the result". */
  status?: string | null
}

/**
 * The round's billing, slapped over the stage as each melody comes up, so the
 * battle runs straight from one player and song into the next. It shows for a
 * few seconds, or for as long as there's a status to report.
 */
export function RoundCard({ index, total, yours, rivalName, melody, status }: Props) {
  const t = useT()
  return (
    <div className={`round-card${status ? ' sticky' : ''}${yours ? ' yours' : ''}`} role="status">
      <span className="round-no">{t.round(index + 1, total)}</span>
      <strong>{yours ? t.yourTurn : t.turnOf(rivalName)}</strong>
      <span className="melody">
        <b>{melody.title}</b> — {melody.artist} · {partName(t, melody.part)}
        {melody.demo && ' · demo'}
      </span>
      {status && <span className="round-status">{status}</span>}
    </div>
  )
}
