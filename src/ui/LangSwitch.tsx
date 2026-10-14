import type { CSSProperties } from 'react'
import { LANGS, setLang, useLang, useT, type Lang } from '../i18n'

const ARGENTINA = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 12' preserveAspectRatio='none'>
<rect width='18' height='12' fill='#74acdf'/><rect y='4' width='18' height='4' fill='#fff'/>
<circle cx='9' cy='6' r='1.55' fill='none' stroke='#f6b40e' stroke-width='.55' stroke-dasharray='.32 .3'/>
<circle cx='9' cy='6' r='1.05' fill='#f6b40e' stroke='#85340a' stroke-width='.12'/></svg>`

const UNION_JACK = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30' preserveAspectRatio='none'>
<clipPath id='t'><path d='M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z'/></clipPath>
<rect width='60' height='30' fill='#012169'/>
<path d='M0,0 L60,30 M60,0 L0,30' stroke='#fff' stroke-width='6'/>
<path d='M0,0 L60,30 M60,0 L0,30' clip-path='url(#t)' stroke='#c8102e' stroke-width='4'/>
<path d='M30,0 v30 M0,15 h60' stroke='#fff' stroke-width='10'/>
<path d='M30,0 v30 M0,15 h60' stroke='#c8102e' stroke-width='6'/></svg>`

const FLAGS: Record<Lang, string> = { es: ARGENTINA, en: UNION_JACK }
const CODES: Record<Lang, string> = { es: 'ES', en: 'EN' }
/** Vertical slices of cloth; each bobs a little behind the one before, so a wave rolls across. */
const STRIPS = 20

/** Two little flags on poles; the chosen one flies, the other hangs still. */
export function LangSwitch() {
  const lang = useLang()
  const t = useT()
  return (
    <div className="lang-switch" role="radiogroup" aria-label={t.langLabel}>
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={l === lang}
          aria-label={l === 'es' ? 'Español' : 'English'}
          className={l === lang ? 'on' : undefined}
          onClick={() => setLang(l)}
        >
          <span
            className="flag"
            style={{ '--flag': `url("data:image/svg+xml,${encodeURIComponent(FLAGS[l])}")` } as CSSProperties}
          >
            {Array.from({ length: STRIPS }, (_, i) => (
              <span key={i} className="strip" style={{ '--i': i } as CSSProperties} />
            ))}
          </span>
          <span className="code">{CODES[l]}</span>
        </button>
      ))}
    </div>
  )
}
