import { useSyncExternalStore } from 'react'
import type { LobbyErrorKind } from './net/types'

export type Lang = 'es' | 'en'
export const LANGS: Lang[] = ['es', 'en']

const es = {
  langLabel: 'Idioma',
  tag: '¡de culto!',
  ribbon: '¡Tocá el teclado, seguí la cumbia!',
  hintHit: 'Pegale a las notas cuando cruzan la línea',
  hintHold: 'mantené las largas',
  hintSabor: 'desata el Sabor',
  hintPause: 'pausa',
  space: 'Espacio',
  battle: '¡A batallar!',
  battleSub: 'Armá tu lista de 3 y elegí tu rival',
  practice: 'Práctica',
  practiceHint: 'Una canción entera, turnándote con El Rayo cada 4 compases.',
  notes: (n: number) => `${n} notas`,
  autoCharted: 'auto-charteada',
  best: 'récord',
  play: '¡Tocar!',
  editor: 'Editor',
  hitSticker: ['¡EL', 'HIT!'],
  volume: 'Volumen',
  mute: 'Silenciar',
  unmute: 'Activar sonido',
  calibrate: (ms: number) => `Calibrar (${ms} ms)`,

  // Results
  newBest: '¡Nuevo récord!',
  accuracy: 'Precisión',
  perfect: 'Perfecto',
  good: 'Bien',
  miss: 'Fallo',
  maxCombo: 'Combo máx.',
  again: 'Otra vez',
  menu: 'Menú',
  tie: '¡EMPATE!',
  youWon: (rival: string) => `¡LE GANASTE A ${rival}!`,
  youLost: (rival: string) => `${rival} TE GANÓ`,
  forfeited: (rival: string) => `${rival} abandonó la batalla`,
  onlineVs: (rival: string) => `Batalla online contra ${rival}`,
  battleVs: (a: number, b: number) => `Batalla de melodías · ${a} contra ${b}`,

  // Pre-game
  you: 'VOS',
  host: 'ANFITRIÓN',
  guest: 'INVITADO',
  lobbyErrors: {
    gone: 'Esta batalla ya no está disponible.',
    closed: 'Tu rival cerró la sala.',
    full: 'Esta sala ya tiene dos jugadores.',
    version: 'Tu rival tiene otra versión del juego. Actualizá la página.',
    offline: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.',
  } as Record<LobbyErrorKind | 'closed', string>,
  shareText: '¡Batallá conmigo!',
  disconnected: 'Desconectado',
  ready: '¡Listo!',
  choosing: (n: number, of: number) => `Eligiendo · ${n} de ${of} melodías`,
  picked: (n: number, of: number) => `${n} de ${of} melodías`,
  rival: 'Rival',
  rivalOnline: 'Rival · online',
  rivalWaiting: 'Rival · esperando',
  connecting: 'Conectando…',
  playElRayo: 'Jugar contra El Rayo',
  backToElRayo: 'Volver a El Rayo',
  leaveRoom: 'Salir de la sala',
  sendLink: 'Mandale este link a quien quieras desafiar:',
  inviteLink: 'Link de invitación',
  copied: '¡Copiado!',
  copy: 'Copiar',
  share: 'Compartir',
  machine: 'La máquina · trae su propia lista',
  invite: 'Invitar a alguien',
  rivalDropped: (rival: string) => `${rival} se desconectó…`,
  waitingFor: (rival: string) => `Esperando a ${rival}…`,
  waitingRival: 'Esperando a que entre tu rival…',
  needName: 'Poné tu nombre para que tu rival sepa quién sos.',
  beforeBattle: 'Antes de la batalla',
  youTag: 'Vos',
  yourName: 'Tu nombre',
  battleStarts: '¡Arranca la batalla!',
  go: '¡Ya!',
  buildList: 'Armá tu lista',
  buildHint: (n: number) => `Elegí ${n} melodías. Las tocás en este orden, turnándote con tu rival.`,
  demoTitle: 'Riff de muestra hasta que se procese la grabación',
  listen: (title: string) => `Escuchar ${title}`,
  back: 'Volver',
  changeList: 'Cambiar lista',
  parts: {} as Record<string, string>,

  // Rounds
  round: (n: number, of: number) => `Ronda ${n} de ${of}`,
  online: 'online',
  yourTurn: '¡Tu turno!',
  turnOf: (rival: string) => `Turno de ${rival}`,
  waitingResult: 'Esperando el resultado…',
  startsIn: (s: number) => `Arranca en ${s}`,
  forfeit: 'Abandonar',
  letsGo: '¡Dale!',
  listenRayo: 'Escuchar a El Rayo',

  // Game
  loading: 'Cargando…',
  audioError: (e: string) => `No se pudo cargar el audio: ${e}`,
  quitAsk: '¿Abandonar?',
  quitHint: 'La batalla sigue sonando para tu rival.',
  keepPlaying: 'Seguir tocando',
  pause: 'Pausa',
  resume: 'Seguir',
  restart: 'Reiniciar',
  quit: 'Salir',
  calloutReady: '¡PREPARATE!',
  calloutYou: '¡TU TURNO!',
  calloutRival: (rival: string) => `TURNO DE ${rival}`,
  gradePerfect: '¡PERFECTO!',
  gradeGood: 'BIEN',
  gradeMiss: 'FALLO',
  combo: (n: number) => `¡${n} COMBO!`,
  saborOn: '¡SABOR!',
  saborReady: 'SABOR — ¡ESPACIO!',
  sabor: 'SABOR',
  duelTitle: 'DUELO DE TECLADISTAS',

  // Calibration
  calibration: 'Calibración',
  calIntro: (warmup: number) =>
    `Apretá Empezar y tocá Espacio en cada click que escuches. Los primeros ${warmup} clicks son de calentamiento.`,
  start: 'Empezar',
  listening: 'Escuchando…',
  taps: (n: number) => `Toques: ${n}`,
  measured: 'desfase medido',
  useIt: 'Usar',
  offset: 'Desfase (ms):',
  offsetHint: 'Positivo si tendés a tocar tarde. Las notas se juzgan contra el audio menos este valor.',
  save: 'Guardar',

  // Editor
  menuBack: '← Menú',
  edPause: 'Pausa',
  edPlay: 'Play',
  snap: 'Grilla',
  speed: 'Velocidad',
  zoom: 'Zoom',
  testPlay: 'Probar',
  download: 'Bajar JSON',
  copyJson: 'Copiar JSON',
  barBeat: (bar: number, beat: string) => `compás ${bar} · tiempo ${beat}`,
  edHint:
    'Scrolleá para moverte · click para agregar/borrar · arrastrá hacia arriba para una nota larga · Rec + play para grabar con la fila del medio · Ctrl+Z deshace · guardá el JSON en',
}

export type Strings = typeof es

const en: Strings = {
  langLabel: 'Language',
  tag: 'cult classic!',
  ribbon: 'Hit the keys, ride the cumbia!',
  hintHit: 'Hit notes as they cross the line',
  hintHold: 'hold long notes',
  hintSabor: 'unleashes Sabor',
  hintPause: 'pauses',
  space: 'Space',
  battle: 'Battle!',
  battleSub: 'Build a set list of 3 and pick your rival',
  practice: 'Practice',
  practiceHint: 'A whole song, trading turns with El Rayo every 4 bars.',
  notes: (n: number) => `${n} notes`,
  autoCharted: 'auto-charted',
  best: 'best',
  play: 'Play!',
  editor: 'Editor',
  hitSticker: ['THE', 'HIT!'],
  volume: 'Volume',
  mute: 'Mute',
  unmute: 'Unmute',
  calibrate: (ms: number) => `Calibrate (${ms} ms)`,

  newBest: 'New high score!',
  accuracy: 'Accuracy',
  perfect: 'Perfect',
  good: 'Good',
  miss: 'Miss',
  maxCombo: 'Max combo',
  again: 'Again',
  menu: 'Menu',
  tie: "IT'S A TIE!",
  youWon: (rival: string) => `YOU BEAT ${rival}!`,
  youLost: (rival: string) => `${rival} BEAT YOU`,
  forfeited: (rival: string) => `${rival} left the battle`,
  onlineVs: (rival: string) => `Online battle against ${rival}`,
  battleVs: (a: number, b: number) => `Melody battle · ${a} against ${b}`,

  you: 'YOU',
  host: 'HOST',
  guest: 'GUEST',
  lobbyErrors: {
    gone: 'This battle is no longer available.',
    closed: 'Your rival closed the room.',
    full: 'This room already has two players.',
    version: 'Your rival has a different version of the game. Refresh the page.',
    offline: "We couldn't connect. Check your connection and try again.",
  },
  shareText: 'Battle me!',
  disconnected: 'Disconnected',
  ready: 'Ready!',
  choosing: (n: number, of: number) => `Choosing · ${n} of ${of} melodies`,
  picked: (n: number, of: number) => `${n} of ${of} melodies`,
  rival: 'Rival',
  rivalOnline: 'Rival · online',
  rivalWaiting: 'Rival · waiting',
  connecting: 'Connecting…',
  playElRayo: 'Play against El Rayo',
  backToElRayo: 'Back to El Rayo',
  leaveRoom: 'Leave the room',
  sendLink: 'Send this link to whoever you want to challenge:',
  inviteLink: 'Invite link',
  copied: 'Copied!',
  copy: 'Copy',
  share: 'Share',
  machine: 'The machine · brings its own list',
  invite: 'Invite someone',
  rivalDropped: (rival: string) => `${rival} disconnected…`,
  waitingFor: (rival: string) => `Waiting for ${rival}…`,
  waitingRival: 'Waiting for your rival to join…',
  needName: 'Enter your name so your rival knows who you are.',
  beforeBattle: 'Before the battle',
  youTag: 'You',
  yourName: 'Your name',
  battleStarts: 'The battle is on!',
  go: 'Go!',
  buildList: 'Build your set list',
  buildHint: (n: number) => `Pick ${n} melodies. You play them in this order, trading turns with your rival.`,
  demoTitle: 'Sample riff until the recording is processed',
  listen: (title: string) => `Listen to ${title}`,
  back: 'Back',
  changeList: 'Change list',
  parts: {
    'Riff de intro': 'Intro riff',
    'Riff principal': 'Main riff',
    'Solo de teclado': 'Keyboard solo',
  },

  round: (n: number, of: number) => `Round ${n} of ${of}`,
  online: 'online',
  yourTurn: 'Your turn!',
  turnOf: (rival: string) => `${rival}'s turn`,
  waitingResult: 'Waiting for the result…',
  startsIn: (s: number) => `Starts in ${s}`,
  forfeit: 'Forfeit',
  letsGo: "Let's go!",
  listenRayo: 'Listen to El Rayo',

  loading: 'Loading…',
  audioError: (e: string) => `Couldn't load the audio: ${e}`,
  quitAsk: 'Forfeit?',
  quitHint: 'The battle keeps playing for your rival.',
  keepPlaying: 'Keep playing',
  pause: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  quit: 'Quit',
  calloutReady: 'GET READY!',
  calloutYou: 'YOUR TURN!',
  calloutRival: (rival: string) => `${rival}'S TURN`,
  gradePerfect: 'PERFECT!',
  gradeGood: 'GOOD',
  gradeMiss: 'MISS',
  combo: (n: number) => `${n} COMBO!`,
  saborOn: 'SABOR!',
  saborReady: 'SABOR — SPACE!',
  sabor: 'SABOR',
  duelTitle: 'KEYBOARD DUEL',

  calibration: 'Calibration',
  calIntro: (warmup: number) =>
    `Press Start, then tap Space on every click you hear. The first ${warmup} clicks are a warm-up.`,
  start: 'Start',
  listening: 'Listening…',
  taps: (n: number) => `Taps: ${n}`,
  measured: 'measured offset',
  useIt: 'Use it',
  offset: 'Offset (ms):',
  offsetHint: 'Positive if you tend to hit late. Notes are judged against audio time minus this.',
  save: 'Save',

  menuBack: '← Menu',
  edPause: 'Pause',
  edPlay: 'Play',
  snap: 'Snap',
  speed: 'Speed',
  zoom: 'Zoom',
  testPlay: 'Test play',
  download: 'Download JSON',
  copyJson: 'Copy JSON',
  barBeat: (bar: number, beat: string) => `bar ${bar} · beat ${beat}`,
  edHint:
    'Scroll to move · click to add/remove · drag up for a hold · Rec + play to record on the home row · Ctrl+Z undo · save the JSON to',
}

const STRINGS: Record<Lang, Strings> = { es, en }

const KEY = 'cumbiaHero.lang'

function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    // storage unavailable
  }
  return 'es'
}

let current: Lang = loadLang()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = current

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // storage unavailable
  }
  document.documentElement.lang = lang
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang)
}

/** The strings for the chosen language; re-renders when it changes. */
export function useT(): Strings {
  return STRINGS[useLang()]
}

/** The current strings, for canvas drawing outside React. */
export function strings(): Strings {
  return STRINGS[current]
}

/** A melody's part name ("Riff de intro") in the current language. */
export function partName(t: Strings, part: string): string {
  return t.parts[part] ?? part
}
