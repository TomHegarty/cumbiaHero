# melodies — battle clips from full recordings

Battles use short highlight sections ("melodías") of cumbia villera songs,
listed in [`src/melodies/library.json`](../../src/melodies/library.json). Each
melody plays over its song's own backing (drums, bass, guitar, the shouts),
while the lead synth sits on a separate track that drops out when you miss.

Until a song is processed it plays a synthesized demo riff (tagged *demo* in
the set-list screen).

## 1. Put the recordings in `songs-in/`

One file per song, named by its library id (`songs-in/` is git-ignored):

| File | Song |
| --- | --- |
| `songs-in/se-te-ve-la-tanga.mp3` | Damas Gratis — Se te ve la tanga |
| `songs-in/no-te-creas-tan-importante.mp3` | Damas Gratis — No te creas tan importante |
| `songs-in/sos-boton.mp3` | Flor de Piedra — Sos botón |
| `songs-in/cumbia-de-los-trapos.mp3` | Yerba Brava — La cumbia de los trapos |
| `songs-in/llegamos-los-pibes-chorros.mp3` | Pibes Chorros — Llegamos los Pibes Chorros |
| `songs-in/para-la-gilada.mp3` | Meta Guacha — Para la gilada |
| `songs-in/ritmo-sustancia.mp3` | Mala Fama — Ritmo sustancia |
| `songs-in/bailan-rochas-y-chetas.mp3` | Nene Malo — Bailan rochas y chetas |
| `songs-in/tirate-un-paso.mp3` | Los Wachiturros — Tirate un paso |
| `songs-in/la-resaka.mp3` | Supermerk2 — La Resaka (already built from the committed audio) |

`.m4a`, `.wav`, `.flac`, `.ogg` and `.webm` work too.

## 2. Install the tools once

```sh
python3 -m venv .venv-melodies
.venv-melodies/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
.venv-melodies/bin/pip install demucs librosa soundfile numpy
```

ffmpeg must be on the PATH (for the MP3s).

## 3. Build

```sh
.venv-melodies/bin/python tools/melodies/build_melody.py --all
```

or one song at a time, picking the section:

```sh
# where does the synth riff play? (needs the stems, so it separates first)
.venv-melodies/bin/python tools/melodies/build_melody.py se-te-ve-la-tanga --find
# build that section; the times are saved back to library.json
.venv-melodies/bin/python tools/melodies/build_melody.py se-te-ve-la-tanga --start 12.5 --end 29
```

The section times in `library.json` start as a guess (the intro riff, first
16 s, marked `"approx": true`). Check them by ear or with `--find`.

Per song the script writes:

- `public/melodies/<id>/backing.mp3` and `lead.mp3`, the clip from one bar
  before the section to a second after it
- `src/melodies/clips/<id>.json`, the clip's tempo, beat 1, groove and chart

### When something's off

- **Notes early or late everywhere:** the tempo or beat 1 was misread. Pass
  them yourself: `--bpm 86 --offset 0.48` (offset = time of a beat 1 in the
  full song, in seconds).
- **Notes on the singing, or the riff missing:** demucs put the synth in a
  different stem. Default is `other`; stacked synth chords often land in
  `vocals`. Try `--lead-stems other vocals` (or `piano`), and save the choice
  in the song's `leadStems` in `library.json`.
- **Too easy / too hard:** `--min-gap 1` charts every 16th; the default `2`
  is 8ths.

Fine-tune any chart in the in-game editor afterwards if needed.
