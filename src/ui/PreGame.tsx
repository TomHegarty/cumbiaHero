import { useEffect, useRef, useState } from 'react'
import { SET_SIZE } from '../engine/battle'
import { MELODIES } from '../melodies'
import { lobbyUrl, onlineAvailable } from '../net/config'
import type { JoinError, Lobby, LobbyState } from '../net/online'
import { MelodyPicker } from './MelodyPicker'

/** Everything the battle needs once both players are ready. */
export interface OnlineStart {
  lobby: Lobby
  yours: string[]
  rivals: string[]
  names: { you: string; rival: string }
  rivalUid: string
  youFirst: boolean
}

interface Props {
  volume: number
  /** Invite code from the link this visit came from. */
  joinCode?: string
  /** The lobby of the battle just played, for a rematch against the same person. */
  lobby?: Lobby
  onStartAi: (yours: string[], youName: string) => void
  onStartOnline: (start: OnlineStart) => void
  onBack: () => void
}

type Mode =
  | { kind: 'ai' }
  | { kind: 'connecting'; joining: boolean }
  | { kind: 'online'; lobby: Lobby }
  | { kind: 'error'; reason: JoinError | 'offline' }

const NAME_KEY = 'cumbiaHero.name'
const PICKS_KEY = 'cumbiaHero.setList'
const AI_NAME = 'EL RAYO'

function remembered<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function remember(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable
  }
}

/** Shown on the health bars, in the same caps as EL RAYO. */
const barName = (name: string) => (name.trim() || 'VOS').toUpperCase()

/**
 * Before a battle: your name, your set list and your opponent, El Rayo by
 * default or a friend you invite with a link. Whoever opens the link lands
 * here too, and the battle starts once both of you are ready.
 */
export function PreGame({ volume, joinCode, lobby: rematch, onStartAi, onStartOnline, onBack }: Props) {
  const [name, setName] = useState(() => remembered(NAME_KEY, ''))
  const [picks, setPicks] = useState<string[]>(() =>
    remembered<string[]>(PICKS_KEY, []).filter((id) => MELODIES.some((m) => m.id === id)),
  )
  const [mode, setMode] = useState<Mode>(() =>
    rematch ? { kind: 'online', lobby: rematch } : joinCode ? { kind: 'connecting', joining: true } : { kind: 'ai' },
  )
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null)
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  const lobby = mode.kind === 'online' ? mode.lobby : null
  const state = lobby && lobbyState?.code === lobby.code ? lobbyState : null
  const me = lobby && state ? state.players[lobby.uid] : undefined
  const rivalUid = lobby && state ? (lobby.isHost ? state.guestUid : state.hostUid) : undefined
  const rival = rivalUid ? state?.players[rivalUid] : undefined
  const ready = !!me?.ready
  const full = picks.length === SET_SIZE

  useEffect(() => remember(NAME_KEY, name), [name])
  useEffect(() => remember(PICKS_KEY, picks), [picks])

  // Arriving from an invite link: take the guest seat
  useEffect(() => {
    if (!joinCode || rematch) return
    let cancelled = false
    import('../net/online')
      .then((net) => net.joinLobby(joinCode, remembered(NAME_KEY, '')))
      .then(
        (res) => {
          if (cancelled) return
          if (typeof res === 'string') setMode({ kind: 'error', reason: res })
          else setMode({ kind: 'online', lobby: res })
        },
        () => !cancelled && setMode({ kind: 'error', reason: 'offline' }),
      )
    return () => {
      cancelled = true
    }
  }, [joinCode, rematch])

  // A rematch starts from scratch: not ready, and the host clears the last battle
  useEffect(() => {
    if (!rematch) return
    void rematch.setPlayer({ ready: false }).catch(() => {})
    if (rematch.isHost) void rematch.reset().catch(() => {})
  }, [rematch])

  useEffect(() => {
    if (!lobby) return
    return lobby.watch(setLobbyState)
  }, [lobby])

  // Keep your name and set list up to date in the lobby while you choose
  useEffect(() => {
    if (!lobby || ready) return
    const t = window.setTimeout(() => void lobby.setPlayer({ name: name.trim().slice(0, 20), setList: picks }).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [lobby, name, picks, ready])

  // Back on a lobby whose battle already ended (a reload on the results screen): open it again
  const status = state?.status
  useEffect(() => {
    if (lobby?.isHost && !rematch && status === 'done') void lobby.reset().catch(() => {})
  }, [lobby, rematch, status])

  // The host starts the battle once both are ready
  useEffect(() => {
    if (!lobby?.isHost || !state || state.status !== 'waiting' || !me || !rival) return
    const set = (p: typeof me) => p.ready && p.connected && !p.left && p.setList.length === SET_SIZE
    if (set(me) && set(rival)) void lobby.start().catch(() => {})
  }, [lobby, state, me, rival])

  // Both screens head into the battle when it starts
  useEffect(() => {
    if (!lobby || !state || !me?.ready || !rival || !rivalUid || started.current) return
    if (state.status !== 'playing' || state.battle?.round !== 0) return
    started.current = true
    onStartOnline({
      lobby,
      yours: me.setList,
      rivals: rival.setList,
      names: { you: barName(me.name), rival: barName(rival.name) },
      rivalUid,
      youFirst: lobby.isHost,
    })
  }, [lobby, state, me, rival, rivalUid, onStartOnline])

  const setUrl = (code: string | null) => window.history.replaceState(null, '', lobbyUrl(code))

  const invite = async () => {
    setMode({ kind: 'connecting', joining: false })
    try {
      const net = await import('../net/online')
      const l = await net.createLobby(name.trim().slice(0, 20), picks)
      setUrl(l.code)
      setMode({ kind: 'online', lobby: l })
    } catch (e) {
      console.warn('Could not open a lobby', e)
      setMode({ kind: 'error', reason: 'offline' })
    }
  }

  const playAi = () => {
    lobby?.leave()
    setUrl(null)
    setMode({ kind: 'ai' })
  }

  const back = () => {
    lobby?.leave()
    setUrl(null)
    onBack()
  }

  const link = lobby ? lobbyUrl(lobby.code) : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copiá el link:', link)
    }
  }
  const canShare = typeof navigator.share === 'function'
  const share = () => void navigator.share({ title: 'Cumbia Hero', text: '¡Batalla de melodías! Entrá acá:', url: link }).catch(() => {})

  const go = () => {
    if (mode.kind === 'ai') onStartAi(picks, barName(name))
    else if (lobby) void lobby.setPlayer({ ready: !ready, name: name.trim().slice(0, 20), setList: picks }).catch(() => {})
  }
  const rivalGone = !!rival?.left
  const canGo =
    mode.kind === 'ai' ? full : !!lobby && full && !!name.trim() && !!rival && !rivalGone && rival.connected

  return (
    <div className="panel setlist pregame">
      <h2 className="chrome">Antes de la batalla</h2>

      <label className="name-field">
        <span>Tu nombre</span>
        <input
          value={name}
          maxLength={20}
          placeholder={mode.kind === 'ai' ? 'VOS' : 'Escribí tu nombre'}
          onChange={(e) => setName(e.target.value)}
          disabled={ready}
        />
      </label>

      <h3>Tu lista</h3>
      <p className="hint">Elegí {SET_SIZE} melodías. Las tocás en este orden, turnándote con tu rival.</p>
      <MelodyPicker volume={volume} picks={picks} onPicks={setPicks} locked={ready} />

      <h3>Tu rival</h3>
      <div className="opponents">{renderOpponent()}</div>

      <div className="row center">
        <button onClick={back}>Volver</button>
        <button className={ready ? 'secondary' : 'hot'} disabled={!canGo && !ready} onClick={go}>
          {mode.kind === 'ai' ? '¡A batallar!' : ready ? 'Esperá… (cambiar)' : '¡Listo!'}
        </button>
      </div>
    </div>
  )

  function renderOpponent() {
    switch (mode.kind) {
      case 'ai':
        return (
          <>
            <div className="opponent selected">
              <b>{AI_NAME}</b>
              <span>El tecladista de la casa. Trae su propia lista.</span>
            </div>
            {onlineAvailable && (
              <button className="opponent invite" onClick={() => void invite()}>
                <b>Invitar a alguien</b>
                <span>Te damos un link para mandarle a quien quieras</span>
              </button>
            )}
          </>
        )
      case 'connecting':
        return <div className="opponent selected">{mode.joining ? 'Entrando a la batalla…' : 'Armando la sala…'}</div>
      case 'error':
        return (
          <div className="opponent selected error">
            <b>
              {mode.reason === 'version'
                ? 'Tu rival tiene otra versión del juego'
                : mode.reason === 'offline'
                  ? 'No se pudo conectar'
                  : 'Esta batalla ya no está disponible'}
            </b>
            <span>
              {mode.reason === 'version'
                ? 'Actualizá la página (y que tu rival también) y probá de nuevo.'
                : mode.reason === 'offline'
                  ? 'Revisá tu conexión y probá de nuevo.'
                  : mode.reason === 'full'
                    ? 'Ya hay dos jugando en esa sala.'
                    : 'El link venció o la sala se cerró.'}
            </span>
            <div className="row center">
              {mode.reason === 'version' && <button onClick={() => window.location.reload()}>Actualizar</button>}
              <button className="hot" onClick={playAi}>
                Jugar contra {AI_NAME}
              </button>
            </div>
          </div>
        )
      case 'online': {
        const host = mode.lobby.isHost
        return (
          <>
            {host && (
              <div className="opponent selected invite-link">
                <b>Mandale este link</b>
                <code>{link}</code>
                <div className="row center">
                  <button onClick={() => void copy()}>{copied ? '¡Copiado!' : 'Copiar'}</button>
                  {canShare && <button onClick={share}>Compartir</button>}
                </div>
              </div>
            )}
            <div className={`opponent selected rival ${rival?.ready ? 'ready' : ''}`}>
              {!rival ? (
                <>
                  <b>Esperando a tu rival…</b>
                  <span>Cuando entre con el link, aparece acá.</span>
                </>
              ) : (
                <>
                  <b>{rival.name.trim() || (host ? 'Alguien entró' : 'Tu anfitrión')}</b>
                  <span className="status">
                    {rivalGone
                      ? 'Se fue de la sala'
                      : !rival.connected
                        ? 'Desconectado'
                        : rival.ready
                          ? '¡Listo!'
                          : `Eligiendo… (${rival.setList.length}/${SET_SIZE})`}
                  </span>
                  {!host && !rivalGone && <span>Te invitó a batallar. Arranca primero.</span>}
                </>
              )}
            </div>
            <div className="row center">
              {host && rivalGone && <button onClick={() => void (mode.lobby.leave(), invite())}>Invitar a otra persona</button>}
              <button className="secondary" onClick={playAi}>
                {host ? `Mejor contra ${AI_NAME}` : `Jugar contra ${AI_NAME}`}
              </button>
            </div>
          </>
        )
      }
    }
  }
}
