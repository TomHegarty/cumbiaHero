import { useEffect, useRef, useState } from 'react'
import { audioContext, click } from '../engine/audio'
import { useT } from '../i18n'

interface Props {
  initialMs: number
  onSave: (ms: number) => void
  onBack: () => void
}

const BPM = 100
const CLICKS = 32
const WARMUP = 4

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Plays a click track and measures how late the player taps relative to it. */
export function Calibration({ initialMs, onSave, onBack }: Props) {
  const t = useT()
  const [running, setRunning] = useState(false)
  const [offsets, setOffsets] = useState<number[]>([])
  const [manual, setManual] = useState(initialMs)
  const startRef = useRef(0)

  useEffect(() => {
    if (!running) return
    const ctx = audioContext()
    void ctx.resume()
    const spb = 60 / BPM
    const start = ctx.currentTime + 0.5
    startRef.current = start
    for (let i = 0; i < CLICKS; i++) click(ctx, start + i * spb, i % 4 === 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      const heard = ctx.currentTime - (ctx.outputLatency || 0)
      const beat = Math.round((heard - start) / spb)
      if (beat < WARMUP || beat >= CLICKS) return
      const delta = heard - (start + beat * spb)
      setOffsets((o) => [...o, delta * 1000])
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => setRunning(false), (0.5 + CLICKS * spb + 0.3) * 1000)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [running])

  const measured = offsets.length >= 4 ? Math.round(median(offsets)) : null

  return (
    <div className="panel">
      <h2 className="chrome">{t.calibration}</h2>
      <p>{t.calIntro(WARMUP)}</p>
      <div className="stack">
        <button
          disabled={running}
          onClick={() => {
            setOffsets([])
            setRunning(true)
          }}
        >
          {running ? t.listening : t.start}
        </button>
      </div>
      <p>
        {t.taps(offsets.length)}
        {measured !== null && (
          <>
            {' '}
            · {t.measured} <strong>{measured} ms</strong>{' '}
            <button onClick={() => setManual(measured)}>{t.useIt}</button>
          </>
        )}
      </p>
      <label className="row">
        {t.offset}
        <input
          type="number"
          value={manual}
          step={5}
          onChange={(e) => setManual(Number(e.target.value) || 0)}
        />
      </label>
      <p className="hint">{t.offsetHint}</p>
      <div className="stack">
        <button onClick={() => onSave(manual)}>{t.save}</button>
        <button onClick={onBack}>{t.back}</button>
      </div>
    </div>
  )
}
