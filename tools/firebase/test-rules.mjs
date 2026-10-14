/**
 * Checks database.rules.json against the Firebase emulators:
 *
 *   npx firebase-tools emulators:exec --only auth,database "node tools/firebase/test-rules.mjs"
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth'
import { connectDatabaseEmulator, enableLogging, get, getDatabase, push, ref, set, update } from 'firebase/database'

enableLogging(false)
const cfg = { apiKey: 'x', projectId: 'cumbiahero-8a20f', databaseURL: 'https://cumbiahero-8a20f-default-rtdb.firebaseio.com', authDomain: 'x' }
async function client(name) {
  const app = initializeApp(cfg, name)
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getDatabase(app); connectDatabaseEmulator(db, '127.0.0.1', 9000)
  const { user } = await signInAnonymously(auth)
  return { db, uid: user.uid }
}
let failed = 0
const ok = async (label, p, expect = true) => {
  let r
  try {
    await p
    r = true
  } catch {
    r = false
  }
  if (r !== expect) failed++
  console.log(r === expect ? 'PASS' : 'FAIL', label, r ? 'allowed' : 'denied')
}
const [h, g, x] = await Promise.all([client('h'), client('g'), client('x')])
// Each run gets fresh codes, so it can be repeated against a running emulator
const rnd = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
const code = rnd(), now = Date.now(), L = `lobbies/${code}`
const lobby = { hostUid: h.uid, createdAt: now, expiresAt: now + 7200e3, version: 'dev', status: 'waiting', players: { [h.uid]: { name: 'Tom', role: 'host', setList: ['a','b','c'], ready: false, connected: true, left: false } } }
await ok('host creates lobby', set(ref(h.db, L), lobby))
await ok('someone else overwrites lobby', set(ref(x.db, L), { ...lobby, hostUid: x.uid }), false)
await ok('bad code rejected', set(ref(h.db, 'lobbies/abc'), lobby), false)
await ok('create as someone else', set(ref(x.db, `lobbies/${rnd()}`), lobby), false)
await ok('guest player before seat', set(ref(g.db, `${L}/players/${g.uid}`), { name: 'S', role: 'guest', ready: false, connected: true, left: false }), false)
await ok('guest takes seat', set(ref(g.db, `${L}/guestUid`), g.uid))
await ok('third takes seat', set(ref(x.db, `${L}/guestUid`), x.uid), false)
await ok('guest writes player', set(ref(g.db, `${L}/players/${g.uid}`), { name: '', role: 'guest', setList: [], ready: false, connected: true, left: false }))
await ok('guest updates name+setList', update(ref(g.db, `${L}/players/${g.uid}`), { name: 'Sofi', setList: ['d','e','f'] }))
await ok('third writes player', set(ref(x.db, `${L}/players/${x.uid}`), { name: 'X' }), false)
await ok('guest edits host player', update(ref(g.db, `${L}/players/${h.uid}`), { ready: true }), false)
await ok('guest junk field', update(ref(g.db, `${L}/players/${g.uid}`), { hax: 1 }), false)
await ok('guest sets status', set(ref(g.db, `${L}/status`), 'playing'), false)
await ok('host starts', update(ref(h.db, L), { status: 'playing', battle: { round: 0, startAt: now + 6000 } }))
await ok('guest writes battle', set(ref(g.db, `${L}/battle`), { round: 3, startAt: 1 }), false)
await ok('guest pushes own hit', push(ref(g.db, `${L}/rounds/1/${g.uid}/hits`), { i: 0, g: 'p' }))
await ok('guest pushes bad hit', push(ref(g.db, `${L}/rounds/1/${g.uid}/hits`), { i: 0, g: 'z' }), false)
await ok('guest pushes host hit', push(ref(g.db, `${L}/rounds/0/${h.uid}/hits`), { i: 0, g: 'p' }), false)
await ok('guest result', set(ref(g.db, `${L}/rounds/1/${g.uid}/result`), { dealt: 3, notes: 4, stats: { score: 1 } }))
await ok('third pushes hit', push(ref(x.db, `${L}/rounds/1/${x.uid}/hits`), { i: 0, g: 'p' }), false)
await ok('anyone signed in reads', get(ref(x.db, L)))
await ok('host rematch reset', update(ref(h.db, L), { status: 'waiting', battle: null, rounds: null }))
await ok('guest clears rounds', set(ref(g.db, `${L}/rounds`), null), false)
const E = `lobbies/${rnd()}`
await ok('host creates expired-ish lobby (expires in 1s)', set(ref(h.db, E), { ...lobby, expiresAt: Date.now() + 500 }))
await new Promise((r) => setTimeout(r, 1200))
await ok('join expired lobby', set(ref(g.db, `${E}/guestUid`), g.uid), false)
await ok('long expiry rejected', set(ref(h.db, `lobbies/${rnd()}`), { ...lobby, expiresAt: Date.now() + 5 * 3600e3 }), false)
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
