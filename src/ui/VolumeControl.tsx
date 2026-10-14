import { useRef, type CSSProperties } from 'react'
import { useT } from '../i18n'

interface Props {
  volume: number
  onVolume: (volume: number) => void
}

/** The one volume knob, pinned to a corner of every screen. The speaker mutes and unmutes. */
export function VolumeControl({ volume, onVolume }: Props) {
  const t = useT()
  // What the speaker restores after a mute
  const before = useRef(0.5)
  const pct = Math.round(volume * 100)
  const level = volume === 0 ? 0 : volume < 0.34 ? 1 : volume < 0.67 ? 2 : 3
  return (
    <div className="volume-control">
      <button
        className="speaker"
        aria-label={volume === 0 ? t.unmute : t.mute}
        title={volume === 0 ? t.unmute : t.mute}
        onClick={(e) => {
          if (volume > 0) before.current = volume
          onVolume(volume === 0 ? before.current : 0)
          // keep Space and the lane keys for the game, not this button
          e.currentTarget.blur()
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
          {level === 0 && <path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
          {level >= 1 && <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
          {level >= 2 && <path d="M18 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
          {level >= 3 && <path d="M20.5 4.5a10.5 10.5 0 0 1 0 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        aria-label={t.volume}
        style={{ '--fill': `${pct}%` } as CSSProperties}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        // a finished drag hands the keyboard back to the game
        onPointerUp={(e) => e.currentTarget.blur()}
      />
      <span className="pct">{pct}%</span>
    </div>
  )
}
