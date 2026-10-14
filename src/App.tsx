import { useCallback, useState } from 'react'
import type { Stats } from './engine/judge'
import { rivalSetList } from './engine/battle'
import type { DuelResult } from './engine/duel'
import { MELODIES } from './melodies'
import { useT } from './i18n'
import { loadSettings, saveBest, saveSettings, type Settings } from './settings'
import type { Chart, Song } from './songs/types'
import { Backdrop } from './ui/Backdrop'
import { Battle } from './ui/Battle'
import { Calibration } from './ui/Calibration'
import { Editor } from './ui/Editor'
import { Game } from './ui/Game'
import { LangSwitch } from './ui/LangSwitch'
import { Menu } from './ui/Menu'
import { Results } from './ui/Results'
import { codeFromUrl, withCode } from './net/code'
import { OnlineBattle } from './ui/OnlineBattle'
import { PreGame } from './ui/PreGame'
import type { OnlineMatch } from './ui/useLobby'

type Screen =
  | { name: 'menu' }
  | { name: 'calibrate' }
  | { name: 'play'; song: Song; chartKey: string; chart: Chart; fromEditor: boolean }
  | { name: 'results'; song: Song; chartKey: string; chart: Chart; stats: Stats; duel?: DuelResult; newBest: boolean; fromEditor: boolean }
  | { name: 'editor'; song: Song; chartKey: string; chart: Chart }
  | { name: 'pregame'; joinCode?: string | null }
  | { name: 'online'; match: OnlineMatch; youName: string }
  | { name: 'online-results'; rivalName: string; stats: Stats; duel: DuelResult; forfeit: boolean }
  | { name: 'battle'; yours: string[]; rivals: string[]; youName: string; run: number }
  | { name: 'battle-results'; yours: string[]; rivals: string[]; youName: string; stats: Stats; duel: DuelResult }

export default function App() {
  const t = useT()
  // An invite link opens straight into that lobby's pre-game screen
  const [screen, setScreen] = useState<Screen>(() => {
    const joinCode = codeFromUrl(location.href)
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

  const startBattle = (yours: string[], rivals: string[], youName: string) =>
    setScreen((s) => ({ name: 'battle', yours, rivals, youName, run: s.name === 'battle' ? s.run + 1 : 0 }))
  const onBattleDone = useCallback(
    (stats: Stats, duel: DuelResult) =>
      setScreen((s) => (s.name === 'battle' ? { name: 'battle-results', yours: s.yours, rivals: s.rivals, youName: s.youName, stats, duel } : s)),
    [],
  )

  const onOnlineDone = useCallback(
    (stats: Stats, duel: DuelResult, rivalName: string, forfeit: boolean) => {
      clearLobbyFromUrl()
      setScreen({ name: 'online-results', rivalName, stats, duel, forfeit })
    },
    [],
  )

  // The battle draws its own backdrop between rounds
  const backdrop =
    screen.name !== 'play' && screen.name !== 'editor' && screen.name !== 'battle' && screen.name !== 'online'
  return (
    <>
      {backdrop && <Backdrop />}
      {backdrop && <LangSwitch />}
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
            key={screen.joinCode ?? 'new'}
            volume={settings.volume}
            joinCode={screen.joinCode}
            onBack={() => setScreen({ name: 'menu' })}
            onOnlineStart={(match, _picks, youName) => setScreen({ name: 'online', match, youName })}
            onStart={(yours, youName) =>
              startBattle(
                yours,
                rivalSetList(
                  MELODIES.map((m) => m.id),
                  yours,
                  Date.now(),
                ),
                youName,
              )
            }
          />
        )
      case 'online':
        return (
          <OnlineBattle
            match={screen.match}
            youName={screen.youName}
            settings={settings}
            onDone={onOnlineDone}
            onQuit={() => {
              clearLobbyFromUrl()
              setScreen({ name: 'pregame' })
            }}
          />
        )
      case 'online-results':
        return (
          <Results
            subtitle={
              screen.forfeit ? t.forfeited(screen.rivalName) : t.onlineVs(screen.rivalName)
            }
            stats={screen.stats}
            duel={screen.duel}
            newBest={false}
            onRetry={() => setScreen({ name: 'pregame' })}
            onMenu={() => setScreen({ name: 'menu' })}
          />
        )
      case 'battle':
        return (
          <Battle
            key={screen.run}
            yours={screen.yours}
            rivals={screen.rivals}
            youName={screen.youName}
            settings={settings}
            onDone={onBattleDone}
            onQuit={() => setScreen({ name: 'menu' })}
          />
        )
      case 'battle-results':
        return (
          <Results
            subtitle={t.battleVs(screen.yours.length, screen.rivals.length)}
            stats={screen.stats}
            duel={screen.duel}
            newBest={false}
            onRetry={() => startBattle(screen.yours, screen.rivals, screen.youName)}
            onMenu={() => setScreen({ name: 'pregame' })}
          />
        )
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

function clearLobbyFromUrl() {
  try {
    history.replaceState(history.state, '', withCode(location.href, null))
  } catch {
    // the address bar stays as it was
  }
}
