/** Lobby shapes and settings shared by the UI and the Firebase code, without importing Firebase. */

/**
 * The Firebase web app config. These values are public by design: what keeps
 * lobbies safe is database.rules.json, not this key.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB5cE0ZglYsHXQUfJ67Exoh_qXd_m_wyJQ',
  authDomain: 'cumbiahero-8a20f.firebaseapp.com',
  databaseURL: 'https://cumbiahero-8a20f-default-rtdb.firebaseio.com',
  projectId: 'cumbiahero-8a20f',
  appId: '1:1038791220059:web:1115d87e6512e998ca987e',
}

/** Bumped whenever the lobby format changes, so old and new builds don't meet mid-battle. */
export const PROTOCOL = 1

export const LOBBY_TTL_MS = 2 * 3600_000

/** The pre-game countdown once both players are ready. */
export const COUNTDOWN_MS = 4000
/** The round card before each melody, which counts down on its own. */
export const ROUND_INTRO_MS = 5000
/** How long a vanished rival has to come back before you win by forfeit. */
export const FORFEIT_MS = 10_000

export type SeatName = 'host' | 'guest'

export interface Seat {
  uid: string
  name: string
  /** Absent until the player picks something (Firebase drops empty arrays). */
  setList?: string[]
  ready: boolean
  connected?: boolean
}

export type LobbyStatus = 'waiting' | 'countdown' | 'playing' | 'done' | 'closed'

export interface Lobby {
  hostUid: string
  createdAt: number
  expiresAt: number
  protocol: number
  status: LobbyStatus
  players?: Partial<Record<SeatName, Seat>>
  battle?: Battle
  rounds?: Record<string, { result?: RoundResult } | undefined>
}

export interface Battle {
  /** Who plays what, in turn: host first. */
  order?: { uid: string; melodyId: string }[]
  /** The round being played. */
  round?: number
  /** Server time the current round's lead-in starts (the end of its intro card). */
  startAt?: number
}

/** What a round's player reports when their melody ends; both sides work out health from it. */
export interface RoundResult {
  dealt: number
  notes: number
  score: number
  perfect: number
  good: number
  miss: number
  maxCombo: number
}

/** One judged note on the wire: note index and grade (perfect, good, miss). */
export interface WireHit {
  i: number
  g: 'p' | 'g' | 'm'
}

/** Why a lobby couldn't be joined or created. */
export type LobbyErrorKind = 'gone' | 'full' | 'version' | 'offline'
