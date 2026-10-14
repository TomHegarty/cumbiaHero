import { useCallback, useState } from 'react'
import type { Stats } from './engine/judge'
import { rivalSetList } from './engine/battle'
import type { DuelResult } from './engine/duel'
import { MELODIES } from './melodies'
import { loadSettings, saveBest, saveSettings, type Settings } from './settings'
import type { Chart, Song } from './songs/types'
import { Backdrop } from './ui/Backdrop'
import { Battle, type OnlineLink } from './ui/Battle'
import { Calibration } from './ui/Calibration'
import { Editor } from './ui/Editor'
import { Game } from './ui/Game'
import { Menu } from './ui/Menu'
import { Results } from './ui/Results'
import { PreGame, type OnlineStart } from './ui/PreGame'
import { lobbyCodeFromUrl, lobbyUrl } from './net/config'
import type { Lobby } from './net/online'

type Screen =
  | { name: 'menu' }
  | { name: 'calibrate' }
  | { name: 'play'; song: Song; chartKey: string; chart: Chart; fromEditor: boolean }
  | { name: 'results'; song: Song; chartKey: string; chart: Chart; stats: Stats; duel?: DuelResult; newBest: boolean; fromEditor: boolean }
  | { name: 'editor'; song: Song; chartKey: string; chart: Chart }
  | { name: 'pregame'; joinCode?: string; lobby?: Lobby }
  | { name: 'battle'; yours: string[]; rivals: string[]; names: Names; online?: OnlineLink; run: number }
  | { name: 'battle-results'; yours: string[]; rivals: string[]; names: Names; online?: OnlineLink; stats: Stats; duel: DuelResult }

type Names = { you: string; rival: string }
const AI_RIVAL = 'EL RAYO'

export default function App() {
  // An invite link opens straight into that lobby's pre-game screen
  const [screen, setScreen] = useState<Screen>(() => {
    const joinCode = lobbyCodeFromUrl()
    return joinCode ? { name: 'pregame', joinCode } : { name: 'menu' }
  })
  const [settings, setSettings] = useState<Settings>(loadSettings)
  // Unsaved editor work survives test plays and trips to the menu.
  const [drafts, setDrafts] = useState<Record<string, Chart>>({})

  const play = (song: Song, chartKey: string, chart: Chart, fromEditor = false) =>
    setScreen({ name: 'play', song, chartKey, chart, fromEditor })

  const onFinish = useCallback(
    (stats: Stats, duel?: DuelResult) =>
      setScreen((s) => {
        if (s.name !== 'play') return s
        const newBest = !s.fromEditor && saveBest(s.song.id, s.chartKey, stats.score)
        return { ...s, name: 'results', stats, duel, newBest }
      }),
    [],
  )

  const toEditor = (song: Song, chartKey: string, chart: Chart) =>
    setScreen({ name: 'editor', song, chartKey, chart })

  const startBattle = (yours: string[], rivals: string[], names: Names, online?: OnlineLink) =>
    setScreen((s) => ({ name: 'battle', yours, rivals, names, online, run: s.name === 'battle-results' ? Date.now() : 0 }))
  const onStartOnline = useCallback(
    ({ lobby, yours, rivals, names, rivalUid, youFirst }: OnlineStart) =>
      setScreen({ name: 'battle', yours, rivals, names, online: { lobby, rivalUid, youFirst }, run: Date.now() }),
    [],
  )
  const onBattleDone = useCallback(
    (stats: Stats, duel: DuelResult) =>
      setScreen((s) => (s.name === 'battle' ? { ...s, name: 'battle-results', stats, duel } : s)),
    [],
  )
  /** Leaves any online lobby and drops its code from the address bar. */
  const leaveOnline = (online?: OnlineLink) => {
    online?.lobby.leave()
    window.history.replaceState(null, '', lobbyUrl(null))
  }

  // The battle draws its own backdrop between rounds
  const backdrop = screen.name !== 'play' && screen.name !== 'editor' && screen.name !== 'battle'
  return (
    <>
      {backdrop && <Backdrop />}
      {renderScreen()}
    </>
  )

  function renderScreen() {
    switch (screen.name) {
      case 'menu':
        return (
          <Menu
            offsetMs={settings.offsetMs}
          volume={settings.volume}
          onVolume={(volume) => {
            const next = { ...settings, volume }
            saveSettings(next)
            setSettings(next)
          }}
            onPlay={(song, key) => play(song, key, song.charts[key])}
            onCalibrate={() => setScreen({ name: 'calibrate' })}
            onBattle={() => setScreen({ name: 'pregame' })}
            onEditor={(song, key) => toEditor(song, key, drafts[`${song.id}/${key}`] ?? song.charts[key])}
          />
        )
      case 'calibrate':
        return (
          <Calibration
            initialMs={settings.offsetMs}
            onBack={() => setScreen({ name: 'menu' })}
            onSave={(offsetMs) => {
              const next = { ...settings, offsetMs }
              saveSettings(next)
              setSettings(next)
              setScreen({ name: 'menu' })
            }}
          />
        )
      case 'play':
        return (
          <Game
            song={screen.song}
            chart={screen.chart}
            settings={settings}
            duel={!screen.fromEditor}
            onFinish={onFinish}
            onQuit={() =>
              screen.fromEditor
                ? toEditor(screen.song, screen.chartKey, screen.chart)
                : setScreen({ name: 'menu' })
            }
          />
        )
      case 'results':
        return (
          <Results
            subtitle={`${screen.song.title} — ${screen.song.artist}`}
            stats={screen.stats}
            duel={screen.duel}
            newBest={screen.newBest}
            onRetry={() => play(screen.song, screen.chartKey, screen.chart, screen.fromEditor)}
            onMenu={() =>
              screen.fromEditor
                ? toEditor(screen.song, screen.chartKey, screen.chart)
                : setScreen({ name: 'menu' })
            }
          />
        )
      case 'pregame':
        return (
          <PreGame
            key={screen.lobby?.code ?? screen.joinCode ?? 'new'}
            volume={settings.volume}
            joinCode={screen.joinCode}
            lobby={screen.lobby}
            onBack={() => setScreen({ name: 'menu' })}
            onStartAi={(yours, you) =>
              startBattle(
                yours,
                rivalSetList(
                  MELODIES.map((m) => m.id),
                  yours,
                  Date.now(),
                ),
                { you, rival: AI_RIVAL },
              )
            }
            onStartOnline={onStartOnline}
          />
        )
      case 'battle':
        return (
          <Battle
            key={screen.run}
            yours={screen.yours}
            rivals={screen.rivals}
            names={screen.names}
            online={screen.online}
            settings={settings}
            onDone={onBattleDone}
            onQuit={() => {
              leaveOnline(screen.online)
              setScreen({ name: 'menu' })
            }}
          />
        )
      case 'battle-results': {
        const { online } = screen
        const leftEarly = !!screen.duel.forfeit
        return (
          <Results
            subtitle={`Batalla de melodías · ${screen.names.you} contra ${screen.names.rival}`}
            stats={screen.stats}
            duel={screen.duel}
            newBest={false}
            retryLabel={online ? (leftEarly ? 'Nueva batalla' : 'Revancha') : 'Otra vez'}
            onRetry={() => {
              if (!online) startBattle(screen.yours, screen.rivals, screen.names)
              else if (leftEarly) {
                leaveOnline(online)
                setScreen({ name: 'pregame' })
              } else setScreen({ name: 'pregame', lobby: online.lobby })
            }}
            onMenu={() => {
              leaveOnline(online)
              setScreen({ name: 'menu' })
            }}
          />
        )
      }
      case 'editor': {
        const key = `${screen.song.id}/${screen.chartKey}`
        return (
          <Editor
            key={key}
            song={screen.song}
            chart={screen.chart}
            onTest={(chart) => {
              setDrafts((d) => ({ ...d, [key]: chart }))
              play(screen.song, screen.chartKey, chart, true)
            }}
            onBack={(chart) => {
              setDrafts((d) => ({ ...d, [key]: chart }))
              setScreen({ name: 'menu' })
            }}
          />
        )
      }
    }
  }
}
