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
  'CD PIRATA PERO ORIGINAL · 3 × $10',
  '¡LLEVALO, LLEVALO, LLEVALO!',
  'QUE SE VAYAN TODOS, QUE SE QUEDE LA CUMBIA',
  'TOCÁ EL TECLADO',
  'EL DÓLAR SUBE, LA CUMBIA TAMBIÉN',
  '¡QUE NO PARE LA FIESTA!',
  '100% BAILABLE',
]

/**
 * A street wall in a 2000s Latin American city: sunburst, Flash-era vector
 * swooshes, photocopy grunge and halftone, stencil graffiti, a pasted-up
 * chicha bailable poster and a vendor's ticker.
 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="sunburst" />
      <svg className="swooshes" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="swoosh-a" x1="0" x2="1">
            <stop offset="0" stopColor="#ffe600" stopOpacity="0" />
            <stop offset="0.45" stopColor="#ffe600" />
            <stop offset="1" stopColor="#ff7a00" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="swoosh-b" x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-50 760 C 300 560, 700 980, 1650 640 L 1650 700 C 760 1010, 300 640, -50 820 Z" fill="url(#swoosh-a)" />
        <path d="M-50 820 C 380 690, 820 1000, 1650 760 L 1650 772 C 820 1020, 380 712, -50 836 Z" fill="url(#swoosh-b)" />
        <path d="M-50 180 C 420 40, 900 320, 1650 90 L 1650 118 C 900 360, 420 80, -50 214 Z" fill="url(#swoosh-a)" opacity="0.7" />
        <circle cx="1460" cy="200" r="70" fill="none" stroke="#ffe600" strokeWidth="6" strokeDasharray="4 14" />
        <circle cx="160" cy="880" r="46" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="2 10" />
      </svg>
      <div className="halftone" />

      <div className="stencil s1">QUE SE VAYAN TODOS</div>
      <div className="stencil s2">LA CUMBIA ES DEL PUEBLO</div>

      <div className="poster">
        <div className="poster-top">¡GRAN BAILE!</div>
        <div className="poster-big">SÁBADO</div>
        <div className="poster-mid">SONIDERO · CUMBIA · VILLERA</div>
        <div className="poster-foot">ENTRADA LIBRE · DAMAS GRATIS</div>
      </div>
      <div className="peso">
        <span>$1</span>
        <small>UN PESO = UNA CUMBIA</small>
      </div>

      {SPARKLES.map((s, i) => (
        <div key={i} className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
      ))}
      <div className="grunge" />
      <div className="marquee">
        <span>{TICKER.map((t) => `★ ${t} `).join('')}★</span>
      </div>
    </div>
  )
}
