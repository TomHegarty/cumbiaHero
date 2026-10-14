import { useCallback, useEffect, useRef, useState } from 'react'
import { battleRounds } from '../engine/battle'
import { strings } from '../i18n'
import { withCode } from '../net/code'
import type { LobbyHandle } from '../net/lobby'
import { COUNTDOWN_MS, ROUND_INTRO_MS, type Lobby, type LobbyErrorKind, type Seat, type SeatName } from '../net/types'

/** Loads the Firebase half of the game on first use. */
const net = () => import('../net/lobby')

export type Online =
  | { phase: 'off' }
  | { phase: 'connecting' }
  | { phase: 'in'; handle: LobbyHandle; lobby: Lobby | null }
  | { phase: 'error'; kind: LobbyErrorKind | 'closed' }

/** A lobby you're seated in, once both players are ready and the countdown has run out. */
export interface OnlineMatch {
  handle: LobbyHandle
  lobby: Lobby
  serverNow: () => number
}

/**
 * One join per code at a time: React runs effects twice in development, and two
 * racing joins for the same seat would leave one of them holding nothing.
 */
const joins = new Map<string, Promise<{ handle: LobbyHandle; serverNow: () => number }>>()
function joinOnce(code: string, name: string) {
  let join = joins.get(code)
  if (!join) {
    join = net().then(async (m) => ({ handle: await m.joinLobby(code, name), serverNow: m.serverNow }))
    joins.set(code, join)
    const forget = () => joins.delete(code)
    join.then(forget, forget)
  }
  return join
}

const other = (seat: SeatName): SeatName => (seat === 'host' ? 'guest' : 'host')

/** Points the address bar at the lobby (so a reload rejoins it), or clears it. */
function showCode(code: string | null) {
  try {
    history.replaceState(history.state, '', withCode(location.href, code))
  } catch {
    // sandboxed frames can refuse this; the lobby still works
  }
}

/**
 * Your seat in an online lobby, if any: create one, join one from a link, keep
 * your name and set list in sync, and run the countdown once both are ready.
 */
export function useLobby(opts: {
  joinCode: string | null
  name: string
  picks: string[]
  onMatch: (m: OnlineMatch) => void
}) {
  const { joinCode, name, picks, onMatch } = opts
  const [online, setOnline] = useState<Online>(joinCode ? { phase: 'connecting' } : { phase: 'off' })
  const [now, setNow] = useState(0)
  const serverNow = useRef<() => number>(() => Date.now())
  const handleRef = useRef<LobbyHandle | null>(null)
  // Set when the battle starts, so leaving the screen doesn't give up the seat
  const keep = useRef(false)
  const latest = useRef({ name, picks, onMatch })
  useEffect(() => {
    latest.current = { name, picks, onMatch }
  }, [name, picks, onMatch])

  const seatIn = useCallback((handle: LobbyHandle) => {
    handleRef.current = handle
    showCode(handle.code)
    setOnline({ phase: 'in', handle, lobby: null })
  }, [])

  const fail = useCallback((e: unknown) => {
    const kind = (e as { kind?: LobbyErrorKind }).kind ?? 'offline'
    setOnline({ phase: 'error', kind })
  }, [])

  // Opened from an invite link: take a seat straight away
  useEffect(() => {
    if (!joinCode) return
    let cancelled = false
    void joinOnce(joinCode, latest.current.name || strings().guest).then(
      ({ handle, serverNow: now }) => {
        serverNow.current = now
        if (!cancelled) seatIn(handle)
      },
      (e) => !cancelled && fail(e),
    )
    return () => {
      cancelled = true
    }
  }, [joinCode, seatIn, fail])

  // Give up the seat when the screen goes away, unless it's going to the battle
  useEffect(
    () => () => {
      if (!keep.current) void handleRef.current?.leave()
    },
    [],
  )

  const handle = online.phase === 'in' ? online.handle : null

  useEffect(() => {
    if (!handle) return
    return handle.watch((lobby) => {
      if (!lobby) return setOnline({ phase: 'error', kind: 'gone' })
      if (lobby.status === 'closed' && handle.seat === 'guest') {
        return setOnline({ phase: 'error', kind: 'closed' })
      }
      setOnline((o) => (o.phase === 'in' && o.handle === handle ? { ...o, lobby } : o))
    })
  }, [handle])

  // Keep your seat in step with the form
  const syncName = name || (handle?.seat === 'host' ? 'ANFITRIÓN' : 'INVITADO')
  useEffect(() => {
    void handle?.updateMe({ name: syncName }).catch(() => {})
  }, [handle, syncName])
  useEffect(() => {
    void handle?.updateMe({ setList: picks }).catch(() => {})
  }, [handle, picks])

  const lobby = online.phase === 'in' ? online.lobby : null
  const me: Seat | undefined = handle ? lobby?.players?.[handle.seat] : undefined
  const rival: Seat | undefined = handle ? lobby?.players?.[other(handle.seat)] : undefined

  // The host counts both players in once they're both ready and present
  const bothReady = !!me?.ready && !!rival?.ready && rival.connected !== false
  useEffect(() => {
    if (handle?.seat !== 'host' || lobby?.status !== 'waiting' || !bothReady || !me || !rival) return
    // Host first, then turn about, as against El Rayo
    const order = battleRounds(me.setList ?? [], rival.setList ?? []).map((r) => ({
      uid: r.owner === 'you' ? me.uid : rival.uid,
      melodyId: r.melodyId,
    }))
    const startAt = serverNow.current() + COUNTDOWN_MS + ROUND_INTRO_MS
    void handle.startCountdown({ order, round: 0, startAt }).catch(() => {})
    // me and rival are read when both turn ready; their other changes don't matter here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, lobby?.status, bothReady])

  // Tick the countdown on the shared clock, and start the match at zero; the
  // first round's own card then counts down to its first note
  const firstAt = lobby?.status === 'countdown' ? lobby.battle?.startAt : undefined
  const startAt = firstAt === undefined ? undefined : firstAt - ROUND_INTRO_MS
  useEffect(() => {
    if (!handle || !lobby || startAt === undefined) return
    const tick = () => {
      const t = serverNow.current()
      setNow(t)
      if (t >= startAt && !keep.current) {
        keep.current = true
        latest.current.onMatch({ handle, lobby, serverNow: serverNow.current })
      }
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => clearInterval(id)
    // lobby is read once at zero; the countdown itself only needs startAt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, startAt])

  const invite = useCallback(() => {
    setOnline({ phase: 'connecting' })
    const { name, picks } = latest.current
    void net()
      .then((m) => {
        serverNow.current = m.serverNow
        return m.createLobby(name || strings().host, picks)
      })
      .then(seatIn, fail)
  }, [seatIn, fail])

  /** Back to El Rayo: give up the seat (closing the lobby if you host it). */
  const leave = useCallback(() => {
    void handleRef.current?.leave()
    handleRef.current = null
    showCode(null)
    setOnline({ phase: 'off' })
  }, [])

  const setReady = useCallback(
    (ready: boolean) => void handle?.updateMe({ ready }).catch(() => {}),
    [handle],
  )

  return {
    online,
    lobby,
    me,
    rival,
    countdown: startAt === undefined ? null : Math.max(0, Math.ceil((startAt - now) / 1000)),
    invite,
    leave,
    setReady,
  }
}
