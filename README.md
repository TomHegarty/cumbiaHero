# Cumbia Hero

A Guitar Hero–style rhythm game for modern cumbia — you're the keyboard
player. Built with React, TypeScript and Vite; deployed to GitHub Pages from
`main`.

**Play:** https://tomhegarty.github.io/cumbiaHero/

## How to play

| Keys | |
| --- | --- |
| `A S D F` · `J K L ;` | the 8 lanes (left hand / right hand) |
| `Space` | unleash **Sabor** (×2 multiplier) once the meter is half full |
| `Esc` | pause |

Hit notes as they cross the line: **Perfecto** (±50 ms), **Bien** (±100 ms).
Every 10-note combo raises the multiplier up to ×4. Run **Calibrar** once to
compensate for your audio/keyboard latency.

## Melody battles

**¡Batalla de melodías!** on the menu: pick 3 melody highlights from the
library of 10 cumbia villera songs, then take turns with the AI keyboardist
El Rayo, who brings 3 of his own. Each turn is one whole melody played over
that song's backing track; the lead synth drops out when you miss. Every
melody you nail takes up to a third of El Rayo's bar.

The library is [`src/melodies/library.json`](src/melodies/library.json).
Songs not yet processed play a synthesized demo riff; to use the real
recordings, see [`tools/melodies`](tools/melodies/README.md).

## Songs

| Song | Chart |
| --- | --- |
| La Resaka — Supermerk2 | Normal, auto-charted from the recording |

Charts follow the band's keyboard player: lead riffs between vocal lines,
and the off-beat "chucu" chord stabs under the vocals (left hand holds the
chord, the right hand marks chord changes).

### Adding a song

1. Put the audio in `public/songs/<id>/audio.mp3`.
2. Generate a chart with [`tools/chartgen`](tools/chartgen/README.md) (stem
   separation → onset/pitch analysis → lanes), or chart it by hand in the
   in-game **Editor**.
3. Create `src/songs/<id>/index.ts` (title, BPM/tempo map, offset, groove,
   charts) and add it to `src/songs/index.ts`.

Charts store notes in **beats** (`{ b, l, d? }`), so tempo, offset and
groove can be tweaked without re-charting. `groove` shifts each 16th position
to match the feel — cumbia pushes its off-beats early.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/cumbiaHero/
npm test           # vitest
npm run lint
npm run build
```

## Layout

```
src/engine/   timing (tempo map + groove), scoring/judging, audio clock, input
src/render/   canvas highway
src/ui/       React screens: menu, game, results, calibration, editor
src/songs/    song registry + per-song charts
src/melodies/ battle melody library, demo riffs, processed clips
tools/chartgen/  Python auto-charter
tools/melodies/  recording → backing + lead synth clip + chart
```

The game clock is the Web Audio hardware clock, not frame time, so notes stay
in sync with the music.

## Audio

The song audio is committed for the hosted build. It is copyrighted by its
owners and included only so the game can be played; remove it if asked.
