import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  set,
  update,
  type Database,
} from 'firebase/database'
import type { Grade, Stats } from '../engine/judge'
import { BUILD_ID, firebaseConfig } from './config'

/**
 * Online battles over Firebase Realtime Database. Loaded on demand, so
 * players who only face El Rayo never download Firebase.
 *
 * lobbies/{code}
 *   hostUid, guestUid, createdAt, expiresAt, version, status
 *   players/{uid}  {name, role, setList, ready, connected, left}
 *   battle         {round, startAt}  (host only)
 *   rounds/{n}/{uid}/hits/{push}  {i, g}  and  rounds/{n}/{uid}/result
 */

export type LobbyStatus = 'waiting' | 'playing' | 'done'

export interface LobbyPlayer {
  name: string
  role: 'host' | 'guest'
  setList: string[]
  ready: boolean
  connected: boolean
  left?: boolean
}

export interface LobbyState {
  code: string
  hostUid: string
  guestUid?: string
  expiresAt: number
  version: string
  status: LobbyStatus
  players: Record<string, LobbyPlayer>
  battle?: { round: number; startAt: number }
}

/** What a player's round came to, written by that player when it ends. */
export interface RoundResult {
  dealt: number
  notes: number
  stats: Pick<Stats, 'score' | 'maxCombo' | 'perfect' | 'good' | 'miss' | 'total'>
}

export type JoinError = 'missing' | 'full' | 'expired' | 'version'

const LOBBY_HOURS = 2
/** Time from the host starting a round to its first beat, covering the round card and loading. */
export const ROUND_GAP_MS = 6000
// No 0/O or 1/I, so a code read aloud or retyped survives
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const GRADE_CODE: Record<Grade, string> = { perfect: 'p', good: 'g', miss: 'm' }
const CODE_GRADE: Record<string, Grade> = { p: 'perfect', g: 'good', m: 'miss' }

interface Net {
  db: Database
  uid: string
  serverNow: () => number
  offset: () => number
}

let netPromise: Promise<Net> | null = null

/** Signs in anonymously (once per browser) and starts tracking the server clock. */
export function connect(): Promise<Net> {
  netPromise ??= (async () => {
    const app: FirebaseApp = initializeApp(firebaseConfig)
    const auth = getAuth(app)
    const db = getDatabase(app)
    // Local testing against the Firebase emulators (VITE_FIREBASE_EMULATOR=127.0.0.1)
    const emulator = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined
    if (emulator) {
      connectAuthEmulator(auth, `http://${emulator}:9099`, { disableWarnings: true })
      connectDatabaseEmulator(db, emulator, 9000)
    }
    const user = await new Promise<User>((resolve, reject) => {
      const stop = onAuthStateChanged(
        auth,
        (u) => {
          if (u) {
            stop()
            resolve(u)
          }
        },
        reject,
      )
      if (!auth.currentUser) signInAnonymously(auth).catch(reject)
    })
    let offset = 0
    onValue(ref(db, '.info/serverTimeOffset'), (s) => {
      offset = Number(s.val()) || 0
    })
    return { db, uid: user.uid, serverNow: () => Date.now() + offset, offset: () => offset }
  })()
  netPromise.catch(() => {
    netPromise = null
  })
  return netPromise
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

function toState(code: string, v: Record<string, unknown> | null): LobbyState | null {
  if (!v) return null
  const players: Record<string, LobbyPlayer> = {}
  for (const [uid, p] of Object.entries((v.players ?? {}) as Record<string, Partial<LobbyPlayer>>)) {
    players[uid] = {
      name: p.name ?? '',
      role: p.role ?? 'guest',
      setList: Object.values(p.setList ?? []),
      ready: !!p.ready,
      connected: !!p.connected,
      left: !!p.left,
    }
  }
  return {
    code,
    hostUid: String(v.hostUid),
    guestUid: v.guestUid ? String(v.guestUid) : undefined,
    expiresAt: Number(v.expiresAt),
    version: String(v.version ?? ''),
    status: (v.status as LobbyStatus) ?? 'waiting',
    players,
    battle: v.battle as LobbyState['battle'],
  }
}

/** One player's seat in a lobby. */
export class Lobby {
  readonly code: string
  readonly uid: string
  readonly isHost: boolean
  private readonly net: Net
  private readonly path: string
  private readonly stops: (() => void)[] = []

  constructor(net: Net, code: string, isHost: boolean) {
    this.net = net
    this.code = code
    this.uid = net.uid
    this.isHost = isHost
    this.path = `lobbies/${code}`
    // Presence: marked connected while the socket is up, and disconnected by the server when it drops
    const me = ref(net.db, `${this.path}/players/${this.uid}/connected`)
    this.stops.push(
      onValue(ref(net.db, '.info/connected'), (s) => {
        if (s.val() !== true) return
        void onDisconnect(me)
          .set(false)
          .then(() => set(me, true))
          .catch(() => {})
      }),
    )
  }

  serverNow(): number {
    return this.net.serverNow()
  }

  /** Server time minus this screen's clock, in ms. */
  clockOffset(): number {
    return this.net.offset()
  }

  private ref(sub = '') {
    return ref(this.net.db, sub ? `${this.path}/${sub}` : this.path)
  }

  watch(fn: (s: LobbyState | null) => void): () => void {
    return onValue(this.ref(), (s) => fn(toState(this.code, s.val() as Record<string, unknown> | null)))
  }

  setPlayer(patch: Partial<Pick<LobbyPlayer, 'name' | 'setList' | 'ready'>>): Promise<void> {
    return update(this.ref(`players/${this.uid}`), patch)
  }

  /** Host: both are ready, start the first round. */
  start(): Promise<void> {
    return update(this.ref(), { status: 'playing', battle: { round: 0, startAt: this.serverNow() + ROUND_GAP_MS } })
  }

  /** Host: the last round's result is in, start the next one. */
  nextRound(round: number): Promise<void> {
    return set(this.ref('battle'), { round, startAt: this.serverNow() + ROUND_GAP_MS })
  }

  /** Host: the battle is over. */
  finish(): Promise<void> {
    return set(this.ref('status'), 'done')
  }

  /** Host: back to the pre-game screen with the same opponent, for a rematch. */
  reset(): Promise<void> {
    return update(this.ref(), { status: 'waiting', battle: null, rounds: null })
  }

  sendHit(round: number, index: number, grade: Grade): void {
    void push(this.ref(`rounds/${round}/${this.uid}/hits`), { i: index, g: GRADE_CODE[grade] }).catch(() => {})
  }

  sendResult(round: number, result: RoundResult): Promise<void> {
    return set(this.ref(`rounds/${round}/${this.uid}/result`), result)
  }

  /** The opponent's note results for a round, including ones already sent. */
  watchHits(round: number, uid: string, fn: (index: number, grade: Grade) => void): () => void {
    return onChildAdded(this.ref(`rounds/${round}/${uid}/hits`), (s) => {
      const v = s.val() as { i?: number; g?: string } | null
      const grade = CODE_GRADE[v?.g ?? '']
      if (v && typeof v.i === 'number' && grade) fn(v.i, grade)
    })
  }

  watchResult(round: number, uid: string, fn: (r: RoundResult) => void): () => void {
    return onValue(this.ref(`rounds/${round}/${uid}/result`), (s) => {
      const v = s.val() as RoundResult | null
      if (v) fn(v)
    })
  }

  /** Leave for good: the other player sees you go at once rather than after a timeout. */
  leave(): void {
    for (const stop of this.stops.splice(0)) stop()
    const me = this.ref(`players/${this.uid}`)
    void onDisconnect(ref(this.net.db, `${this.path}/players/${this.uid}/connected`)).cancel()
    void update(me, { left: true, connected: false, ready: false }).catch(() => {})
  }
}

/** Opens a new lobby with you as the host. */
export async function createLobby(name: string, setList: string[]): Promise<Lobby> {
  const net = await connect()
  for (let attempt = 0; ; attempt++) {
    const code = newCode()
    const now = net.serverNow()
    try {
      // The rules only allow creating a lobby whose code is free, so a clash fails and we roll again
      await set(ref(net.db, `lobbies/${code}`), {
        hostUid: net.uid,
        createdAt: now,
        expiresAt: now + LOBBY_HOURS * 3600_000,
        version: BUILD_ID,
        status: 'waiting',
        players: { [net.uid]: { name, role: 'host', setList, ready: false, connected: true, left: false } },
      })
      return new Lobby(net, code, true)
    } catch (e) {
      if (attempt >= 3) throw e
    }
  }
}

/** Takes the guest seat in a lobby, or your own seat back if you were already in it. */
export async function joinLobby(code: string, name: string): Promise<Lobby | JoinError> {
  const net = await connect()
  const snap = await get(ref(net.db, `lobbies/${code}`))
  const lobby = toState(code, snap.val() as Record<string, unknown> | null)
  if (!lobby) return 'missing'
  if (lobby.expiresAt < net.serverNow()) return 'expired'
  if (lobby.version !== BUILD_ID) return 'version'
  const mine = lobby.hostUid === net.uid || lobby.guestUid === net.uid
  if (mine && lobby.status === 'playing') {
    // Back from a reload mid-battle: the battle can't be resumed, so count it as leaving
    await update(ref(net.db, `lobbies/${code}/players/${net.uid}`), { left: true, connected: false })
    return 'expired'
  }
  if (lobby.hostUid === net.uid) {
    await update(ref(net.db, `lobbies/${code}/players/${net.uid}`), { left: false })
    return new Lobby(net, code, true)
  }
  if (lobby.guestUid && lobby.guestUid !== net.uid) return 'full'
  if (!lobby.guestUid) {
    if (lobby.status !== 'waiting') return 'full'
    try {
      await set(ref(net.db, `lobbies/${code}/guestUid`), net.uid)
    } catch {
      // Someone else took the seat first, unless it was this browser a moment ago (a double join)
      const seat = await get(ref(net.db, `lobbies/${code}/guestUid`))
      if (seat.val() !== net.uid) return 'full'
    }
  }
  const seat = lobby.players[net.uid]
  await set(ref(net.db, `lobbies/${code}/players/${net.uid}`), {
    name: name || seat?.name || '',
    role: 'guest',
    setList: seat?.setList ?? [],
    ready: false,
    connected: true,
    left: false,
  })
  return new Lobby(net, code, false)
}
