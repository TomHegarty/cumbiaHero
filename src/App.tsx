import { useCallback, useState } from 'react'
import type { Stats } from './engine/judge'
import type { DuelResult } from './engine/duel'
import { loadSettings, saveBest, saveSettings, type Settings } from './settings'
import type { Chart, Song } from './songs/types'
import { Backdrop } from './ui/Backdrop'
import { Calibration } from './ui/Calibration'
import { Editor } from './ui/Editor'
import { Game } from './ui/Game'
import { Menu } from './ui/Menu'
import { Results } from './ui/Results'

type Screen =
  | { name: 'menu' }
  | { name: 'calibrate' }
  | { name: 'play'; song: Song; chartKey: string; chart: Chart; fromEditor: boolean }
  | { name: 'results'; song: Song; chartKey: string; chart: Chart; stats: Stats; duel?: DuelResult; newBest: boolean; fromEditor: boolean }
  | { name: 'editor'; song: Song; chartKey: string; chart: Chart }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' })
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

  const backdrop = screen.name !== 'play' && screen.name !== 'editor'
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
            song={screen.song}
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
