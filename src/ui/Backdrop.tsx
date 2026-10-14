import { SONGS } from '../songs'

const SPARKLES = [
  { left: '8%', top: '14%', delay: '0s' },
  { left: '86%', top: '10%', delay: '0.6s' },
  { left: '18%', top: '72%', delay: '1.2s' },
  { left: '78%', top: '64%', delay: '1.8s' },
  { left: '50%', top: '6%', delay: '0.9s' },
  { left: '93%', top: '40%', delay: '1.5s' },
  { left: '4%', top: '44%', delay: '0.3s' },
]

const TICKER = [
  '¡¡ LA MEJOR CUMBIA DEL MOMENTO !!',
  ...SONGS.map((s) => `${s.artist.toUpperCase()} — ${s.title.toUpperCase()}`),
  'TOCÁ EL TECLADO',
  '¡QUE NO PARE LA FIESTA!',
  '100% BAILABLE',
]

/** Sunburst, sparkles and a scrolling ticker, à la a 2000s cumbia compilation. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="sunburst" />
      {SPARKLES.map((s, i) => (
        <div key={i} className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
      ))}
      <div className="marquee">
        <span>{TICKER.map((t) => `★ ${t} `).join('')}★</span>
      </div>
    </div>
  )
}
