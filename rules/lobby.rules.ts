/**
 * Database security rules, checked against the Firebase emulator:
 *   npm run test:rules
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, remove, set, update } from 'firebase/database'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const CODE = 'K7Q2XM'
const lobby = (path = '') => `lobbies/${CODE}${path}`

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database()

function newLobby(host = 'host', overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    hostUid: host,
    createdAt: now,
    expiresAt: now + 2 * 3600_000,
    protocol: 1,
    status: 'waiting',
    players: { host: { uid: host, name: 'Sofi', ready: false } },
    ...overrides,
  }
}

/** Seed a lobby with the rules off. */
async function seed(data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), lobby()), data)
  })
}

const guest = { uid: 'guest', name: 'Rayo2', ready: false }
const threeSongs = ['se-te-ve-la-tanga', 'sos-boton', 'la-resaka']

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cumbiahero',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearDatabase())

describe('creating a lobby', () => {
  it('lets a signed-in player create one as its host', async () => {
    await assertSucceeds(set(ref(db('host'), lobby()), newLobby()))
  })
  it('refuses signed-out players', async () => {
    await assertFails(set(ref(db(null), lobby()), newLobby()))
  })
  it('refuses a lobby hosted by someone else', async () => {
    await assertFails(set(ref(db('mallory'), lobby()), newLobby()))
  })
  it('refuses to overwrite a code that is taken', async () => {
    await seed(newLobby())
    await assertFails(set(ref(db('mallory'), lobby()), newLobby('mallory')))
  })
  it('refuses codes outside the invite alphabet', async () => {
    await assertFails(set(ref(db('host'), 'lobbies/K7Q2X0'), newLobby()))
  })
  it('refuses a lobby that lives longer than two hours', async () => {
    await assertFails(set(ref(db('host'), lobby()), newLobby('host', { expiresAt: Date.now() + 3 * 3600_000 })))
  })
  it('refuses stray fields', async () => {
    await assertFails(set(ref(db('host'), lobby()), newLobby('host', { admin: true })))
  })
})

describe('joining', () => {
  beforeEach(() => seed(newLobby()))

  it('lets anyone signed in read a lobby, but not the list of lobbies', async () => {
    await assertSucceeds(get(ref(db('guest'), lobby())))
    await assertFails(get(ref(db('guest'), 'lobbies')))
    await assertFails(get(ref(db(null), lobby())))
  })
  it('lets a guest take the empty seat', async () => {
    await assertSucceeds(set(ref(db('guest'), lobby('/players/guest')), guest))
  })
  it('refuses a third player', async () => {
    await seed({ ...newLobby(), players: { host: newLobby().players.host, guest } })
    await assertFails(set(ref(db('third'), lobby('/players/guest')), { ...guest, uid: 'third' }))
    await assertFails(set(ref(db('third'), lobby('/players/third')), { ...guest, uid: 'third' }))
  })
  it('refuses a guest taking the host seat or posing as someone else', async () => {
    await assertFails(set(ref(db('guest'), lobby('/players/host')), guest))
    await assertFails(set(ref(db('guest'), lobby('/players/guest')), { ...guest, uid: 'host' }))
  })
  it('refuses the host taking the guest seat too', async () => {
    await assertFails(set(ref(db('host'), lobby('/players/guest')), { ...guest, uid: 'host' }))
  })
  it('lets the host rejoin their own seat', async () => {
    await assertSucceeds(update(ref(db('host'), lobby('/players/host')), { connected: true }))
  })
  it("refuses writing another player's seat", async () => {
    await assertFails(set(ref(db('guest'), lobby('/players/host/name')), 'pwned'))
    await assertFails(remove(ref(db('guest'), lobby('/players/host'))))
  })
  it('refuses joining an expired lobby', async () => {
    await seed(newLobby('host', { createdAt: Date.now() - 3 * 3600_000, expiresAt: Date.now() - 3600_000 }))
    await assertFails(set(ref(db('guest'), lobby('/players/guest')), guest))
  })
  it('refuses joining once the battle has started', async () => {
    await seed(newLobby('host', { status: 'countdown' }))
    await assertFails(set(ref(db('guest'), lobby('/players/guest')), guest))
  })
  it('refuses names that are empty or too long', async () => {
    await assertFails(set(ref(db('guest'), lobby('/players/guest')), { ...guest, name: '' }))
    await assertFails(set(ref(db('guest'), lobby('/players/guest')), { ...guest, name: 'x'.repeat(15) }))
  })
})

describe('getting ready', () => {
  beforeEach(() => seed({ ...newLobby(), players: { host: newLobby().players.host, guest } }))

  it('lets players edit their own seat after the lobby was created long ago', async () => {
    // createdAt is only checked when the lobby is made, not on every later write
    await seed({ ...newLobby('host', { createdAt: Date.now() - 3600_000 }), players: { host: newLobby().players.host, guest } })
    await assertSucceeds(update(ref(db('guest'), lobby('/players/guest')), { name: 'Rayito', setList: threeSongs }))
  })
  it('only allows ready with a full set list', async () => {
    await assertFails(update(ref(db('guest'), lobby('/players/guest')), { ready: true, setList: threeSongs.slice(0, 2) }))
    await assertSucceeds(update(ref(db('guest'), lobby('/players/guest')), { ready: true, setList: threeSongs }))
  })
  it('refuses set lists longer than three', async () => {
    await assertFails(update(ref(db('guest'), lobby('/players/guest')), { setList: [...threeSongs, 'extra'] }))
  })
  it('tracks presence on your own seat', async () => {
    await assertSucceeds(set(ref(db('guest'), lobby('/players/guest/connected')), false))
  })
  it('lets you leave', async () => {
    await assertSucceeds(remove(ref(db('guest'), lobby('/players/guest'))))
  })
  it('lets only the host change the status and battle', async () => {
    await assertFails(set(ref(db('guest'), lobby('/status')), 'countdown'))
    await assertSucceeds(set(ref(db('host'), lobby('/status')), 'countdown'))
    await assertFails(set(ref(db('host'), lobby('/status')), 'hacked'))
    await assertFails(set(ref(db('guest'), lobby('/battle/startAt')), 1))
    await assertSucceeds(set(ref(db('host'), lobby('/battle/startAt')), 1))
  })
  it('never lets anyone rewrite who hosts', async () => {
    await assertFails(set(ref(db('host'), lobby('/hostUid')), 'guest'))
    await assertFails(set(ref(db('guest'), lobby('/hostUid')), 'guest'))
  })
})

describe('rounds', () => {
  beforeEach(() =>
    seed({
      ...newLobby('host', { status: 'playing' }),
      players: { host: newLobby().players.host, guest },
      battle: { order: [{ uid: 'host', melodyId: 'a' }, { uid: 'guest', melodyId: 'b' }], round: 0, startAt: 1 },
    }),
  )

  it("lets only a round's player write its hits and result", async () => {
    await assertSucceeds(set(ref(db('host'), lobby('/rounds/0/hits/x')), { i: 0, g: 'p' }))
    await assertFails(set(ref(db('guest'), lobby('/rounds/0/hits/x')), { i: 0, g: 'p' }))
    await assertSucceeds(set(ref(db('guest'), lobby('/rounds/1/result')), { dealt: 3, notes: 4 }))
    await assertFails(set(ref(db('host'), lobby('/rounds/1/result')), { dealt: 3, notes: 4 }))
  })
})
