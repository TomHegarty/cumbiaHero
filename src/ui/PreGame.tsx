import { useEffect, useRef, useState } from 'react'
import { loadSongTracks, SongPlayer } from '../engine/audio'
import { SET_SIZE } from '../engine/battle'
import { SongTiming } from '../engine/chart'
import { MELODIES, type Melody } from '../melodies'
import { withCode } from '../net/code'
import { partName, useT } from '../i18n'
import { cleanName, loadName, NAME_MAX, saveName } from '../settings'
import { useLobby, type OnlineMatch } from './useLobby'

interface Props {
  volume: number
  /** Opened from an invite link: join this lobby. */
  joinCode?: string | null
  onStart: (picks: string[], name: string) => void
  onOnlineStart: (match: OnlineMatch, picks: string[], name: string) => void
  onBack: () => void
}

const PREVIEW_SECONDS = 8

/**
 * Everything before a battle: your name, your opponent (El Rayo, or a friend
 * you invite with a link) and the melodies you'll bring, in the order you'll
 * play them.
 */
export function PreGame({ volume, joinCode = null, onStart, onOnlineStart, onBack }: Props) {
  const t = useT()
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

  const clean = cleanName(name)
  const lobby = useLobby({
    joinCode,
    name: clean,
    picks,
    onMatch: (m) => {
      stopPreview()
      saveName(clean)
      onOnlineStart(m, picks, clean)
    },
  })
  const { online, me, rival, countdown } = lobby
  const seated = online.phase === 'in'
  const ready = !!me?.ready
  // Your list is locked while you're marked ready or the countdown runs
  const locked = ready || countdown !== null

  const toggle = (id: string) => {
    if (locked) return
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < SET_SIZE ? [...p, id] : p))
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
  const link = seated ? withCode(location.href, online.handle.code) : ''
  const share = () => {
    if (navigator.share) void navigator.share({ title: 'CumbiaHero', text: t.shareText, url: link }).catch(() => {})
    else void navigator.clipboard?.writeText(link).catch(() => {})
  }
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  const status = (s: { ready?: boolean; connected?: boolean; setList?: string[] } | undefined) =>
    !s
      ? ''
      : s.connected === false
        ? t.disconnected
        : s.ready
          ? t.ready
          : t.choosing(s.setList?.length ?? 0, SET_SIZE)

  const opponentCard = () => {
    if (online.phase === 'connecting') {
      return (
        <div className="player-card rival">
          <span className="tag">{t.rival}</span>
          <span className="name">…</span>
          <span className="status">{t.connecting}</span>
        </div>
      )
    }
    if (online.phase === 'error') {
      return (
        <div className="player-card rival">
          <span className="tag">{t.rival}</span>
          <span className="status error">{t.lobbyErrors[online.kind]}</span>
          <button className="secondary small" onClick={lobby.leave}>
            {t.playElRayo}
          </button>
        </div>
      )
    }
    if (online.phase === 'in') {
      if (rival) {
        return (
          <div className={`player-card rival${rival.connected === false ? ' away' : ''}`}>
            <span className="tag">{t.rivalOnline}</span>
            <span className="name">{rival.name}</span>
            <span className="status">{status(rival)}</span>
            {countdown === null && (
              <button className="link" onClick={lobby.leave}>
                {online.handle.seat === 'host' ? t.backToElRayo : t.leaveRoom}
              </button>
            )}
          </div>
        )
      }
      return (
        <div className="player-card rival invite">
          <span className="tag">{t.rivalWaiting}</span>
          <span className="status">{t.sendLink}</span>
          <div className="invite-link">
            <input readOnly value={link} aria-label={t.inviteLink} onFocus={(e) => e.target.select()} />
            <button className="secondary small" onClick={copy}>
              {copied ? t.copied : t.copy}
            </button>
            {'share' in navigator && (
              <button className="secondary small" onClick={share}>
                {t.share}
              </button>
            )}
          </div>
          <button className="link" onClick={lobby.leave}>
            {t.backToElRayo}
          </button>
        </div>
      )
    }
    return (
      <div className="player-card rival">
        <span className="tag">{t.rival}</span>
        <span className="name">EL RAYO</span>
        <span className="status">{t.machine}</span>
        <button className="secondary small" onClick={lobby.invite}>
          {t.invite}
        </button>
      </div>
    )
  }

  const go = () => {
    if (seated) return lobby.setReady(!ready)
    stopPreview()
    saveName(clean)
    onStart(picks, clean || t.you)
  }
  // Online, the other player needs to know who you are
  const canGo = full && (!seated || !!clean) && countdown === null
  const waitingOn =
    seated && ready && countdown === null
      ? rival
        ? rival.connected === false
          ? t.rivalDropped(rival.name)
          : t.waitingFor(rival.name)
        : t.waitingRival
      : seated && full && !clean
        ? t.needName
        : null

  return (
    <div className="panel setlist pregame">
      <h2 className="chrome">{t.beforeBattle}</h2>

      <div className="lineup">
        <label className="player-card you">
          <span className="tag">{t.youTag}</span>
          <input
            className="name"
            value={name}
            maxLength={NAME_MAX}
            placeholder={seated ? t.yourName : t.you}
            aria-label={t.yourName}
            autoComplete="nickname"
            disabled={locked}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="status">{seated && me ? status(me) : t.picked(picks.length, SET_SIZE)}</span>
        </label>
        <div className="vs">VS</div>
        {opponentCard()}
      </div>

      {countdown !== null && (
        <div className="countdown" role="status">
          <span>{t.battleStarts}</span>
          <b key={countdown}>{countdown || t.go}</b>
        </div>
      )}

      <h3 className="section">{t.buildList}</h3>
      <p className="hint">{t.buildHint(SET_SIZE)}</p>

      <ul className="melodies">
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
                    {partName(t, m.part)} · {Math.round(m.song.tempo[0].bpm)} BPM · {t.notes(m.chart.notes.length)}
                  </span>
                </span>
                {m.demo && (
                  <span className="demo" title={t.demoTitle}>
                    demo
                  </span>
                )}
              </button>
              <button
                className="secondary listen"
                onClick={() => listen(m)}
                aria-label={t.listen(m.title)}
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
      {waitingOn && <p className="waiting">{waitingOn}</p>}
      <div className="row center">
        <button
          onClick={() => {
            stopPreview()
            lobby.leave()
            onBack()
          }}
        >
          {t.back}
        </button>
        <button className={ready ? 'secondary' : 'hot'} disabled={!canGo} onClick={go}>
          {ready ? t.changeList : t.ready}
        </button>
      </div>
    </div>
  )
}
