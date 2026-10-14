/**
 * Online lobbies on Firebase Realtime Database. This module pulls in the
 * Firebase SDK, so it is only ever loaded with a dynamic import: someone who
 * just plays El Rayo never downloads it.
 *
 * A lobby has two seats, host and guest. Each player writes only their own
 * seat; the host alone moves the lobby along (database.rules.json).
 */
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
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
import { makeCode } from './code'
import {
  FIREBASE_CONFIG,
  LOBBY_TTL_MS,
  PROTOCOL,
  type Battle,
  type Lobby,
  type LobbyErrorKind,
  type RoundResult,
  type Seat,
  type SeatName,
  type WireHit,
} from './types'

export class LobbyError extends Error {
  readonly kind: LobbyErrorKind
  constructor(kind: LobbyErrorKind) {
    super(kind)
    this.kind = kind
  }
}

interface Session {
  db: Database
  uid: string
}

let session: Promise<Session> | null = null
let serverOffset = 0

/** Sign in anonymously (once per browser; the id persists) and open the database. */
function connect(): Promise<Session> {
  session ??= (async () => {
    const app = initializeApp(FIREBASE_CONFIG)
    const auth = getAuth(app)
    const db = getDatabase(app)
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      connectDatabaseEmulator(db, '127.0.0.1', 9000)
    }
    const { user } = await signInAnonymously(auth)
    onValue(ref(db, '.info/serverTimeOffset'), (s) => {
      serverOffset = (s.val() as number | null) ?? 0
    })
    return { db, uid: user.uid }
  })().catch((e: unknown) => {
    session = null
    console.warn('Firebase connection failed', e)
    throw new LobbyError('offline')
  })
  return session
}

/** The database's clock, so both players count down to the same moment. */
export function serverNow(): number {
  return Date.now() + serverOffset
}

/** A seat you hold in a lobby, with everything you can do from it. */
export interface LobbyHandle {
  code: string
  seat: SeatName
  uid: string
  /** Calls back with the lobby now and on every change; returns an unsubscribe. */
  watch(cb: (lobby: Lobby | null) => void): () => void
  /** Change your own name, set list or ready state. */
  updateMe(patch: Partial<Pick<Seat, 'name' | 'setList' | 'ready'>>): Promise<void>
  /** Host only: lock the lobby, fix the running order and count both players in. */
  startCountdown(battle: Required<Battle>): Promise<void>
  /** Host only: move on to the next round. */
  nextRound(round: number, startAt: number): Promise<void>
  /** Host only: the battle is over. */
  finish(): Promise<void>
  /** Stream your judged notes for a round you're playing. */
  sendHits(round: number, hits: WireHit[]): Promise<void>
  /** Calls back with each note the rival judges in a round; returns an unsubscribe. */
  watchHits(round: number, cb: (hit: WireHit) => void): () => void
  sendResult(round: number, result: RoundResult): Promise<void>
  /** Give up your seat. The host leaving closes the lobby. */
  leave(): Promise<void>
}

export async function createLobby(name: string, setList: string[]): Promise<LobbyHandle> {
  const { db, uid } = await connect()
  // The rules refuse a code that's taken, so on a clash just roll another
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode()
    const now = serverNow()
    const lobby = {
      hostUid: uid,
      createdAt: now,
      expiresAt: now + LOBBY_TTL_MS,
      protocol: PROTOCOL,
      status: 'waiting',
      players: { host: { uid, name, setList, ready: false, connected: true } },
    }
    try {
      await set(ref(db, `lobbies/${code}`), lobby)
    } catch {
      continue
    }
    return seated(db, uid, code, 'host')
  }
  throw new LobbyError('offline')
}

/** Take the guest seat, or your old seat back if this browser already holds one. */
export async function joinLobby(code: string, name: string): Promise<LobbyHandle> {
  const { db, uid } = await connect()
  const snap = await get(ref(db, `lobbies/${code}`)).catch(() => {
    throw new LobbyError('offline')
  })
  const lobby = snap.val() as Lobby | null
  if (!lobby) throw new LobbyError('gone')
  if (lobby.protocol !== PROTOCOL) throw new LobbyError('version')
  if (lobby.expiresAt < serverNow() || lobby.status === 'closed' || lobby.status === 'done') {
    throw new LobbyError('gone')
  }
  const mine = (['host', 'guest'] as const).find((s) => lobby.players?.[s]?.uid === uid)
  if (mine) return seated(db, uid, code, mine)
  if (lobby.players?.guest) throw new LobbyError('full')
  if (lobby.status !== 'waiting') throw new LobbyError('gone')
  try {
    await set(ref(db, `lobbies/${code}/players/guest`), { uid, name, ready: false, connected: true })
  } catch {
    // Someone else sat down first
    throw new LobbyError('full')
  }
  return seated(db, uid, code, 'guest')
}

function seated(db: Database, uid: string, code: string, seat: SeatName): LobbyHandle {
  const lobbyRef = ref(db, `lobbies/${code}`)
  const meRef = ref(db, `lobbies/${code}/players/${seat}`)
  const connectedRef = ref(db, `lobbies/${code}/players/${seat}/connected`)

  // Presence: mark the seat connected whenever the socket is up, and let the
  // server mark it disconnected if this tab vanishes.
  let left = false
  const stopPresence = onValue(ref(db, '.info/connected'), (s) => {
    if (left || s.val() !== true) return
    void onDisconnect(connectedRef)
      .set(false)
      .then(() => set(connectedRef, true))
      .catch(() => {})
  })

  return {
    code,
    seat,
    uid,
    watch(cb) {
      return onValue(
        lobbyRef,
        (s) => cb(s.val() as Lobby | null),
        () => cb(null),
      )
    },
    async updateMe(patch) {
      // Firebase drops empty arrays, so an empty set list is written as no set list
      const write: Record<string, unknown> = { ...patch }
      if (patch.setList && patch.setList.length === 0) write.setList = null
      await update(meRef, write)
    },
    async startCountdown(battle) {
      await update(lobbyRef, { status: 'countdown', battle })
    },
    async nextRound(round, startAt) {
      await update(ref(db, `lobbies/${code}/battle`), { round, startAt })
    },
    async finish() {
      await set(ref(db, `lobbies/${code}/status`), 'done')
    },
    async sendHits(round, hits) {
      const hitsRef = ref(db, `lobbies/${code}/rounds/${round}/hits`)
      const batch: Record<string, WireHit> = {}
      for (const h of hits) batch[push(hitsRef).key!] = h
      await update(hitsRef, batch)
    },
    watchHits(round, cb) {
      return onChildAdded(ref(db, `lobbies/${code}/rounds/${round}/hits`), (s) => cb(s.val() as WireHit))
    },
    async sendResult(round, result) {
      await set(ref(db, `lobbies/${code}/rounds/${round}/result`), result)
    },
    async leave() {
      if (left) return
      left = true
      stopPresence()
      await onDisconnect(connectedRef)
        .cancel()
        .catch(() => {})
      if (seat === 'host') await set(ref(db, `lobbies/${code}/status`), 'closed').catch(() => {})
      else await set(meRef, null).catch(() => {})
    },
  }
}
