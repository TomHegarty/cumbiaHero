/**
 * Firebase project for online battles. These values are public by design (every
 * web app ships them); what players may read and write is enforced by
 * database.rules.json. Any of them can be overridden with VITE_FIREBASE_* at build time.
 */
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyB5cE0ZglYsHXQUfJ67Exoh_qXd_m_wyJQ',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'cumbiahero-8a20f.firebaseapp.com',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? 'https://cumbiahero-8a20f-default-rtdb.firebaseio.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'cumbiahero-8a20f',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:1038791220059:web:1115d87e6512e998ca987e',
}

/** Online play needs a database; without one the invite button is hidden and El Rayo still works. */
export const onlineAvailable = !!(firebaseConfig.apiKey && firebaseConfig.databaseURL)

/** Players on different builds could have different charts, so lobbies only match the same build. */
export const BUILD_ID: string = env.VITE_BUILD_ID ?? 'dev'

/** The invite code in the page URL, if this visit came from an invite link. */
export function lobbyCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('lobby')
  return code ? code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null
}

/** The game's URL with an invite code, or without one. */
export function lobbyUrl(code: string | null): string {
  const url = new URL(window.location.href)
  url.hash = ''
  if (code) url.searchParams.set('lobby', code)
  else url.searchParams.delete('lobby')
  return url.toString()
}
