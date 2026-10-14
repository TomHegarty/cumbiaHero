# chartgen — auto-chart a song's keyboard part

Turns an audio file into a Cumbia Hero chart in three steps. Everything runs
locally; nothing here runs in CI.

## 1. Separate stems (demucs, 6-stem model)

```sh
python3 -m venv .venv-demucs && .venv-demucs/bin/pip install demucs torch torchaudio
.venv-demucs/bin/python -m demucs -n htdemucs_6s -o stems song.mp3
```

If `dl.fbaipublicfiles.com` is blocked, fetch the weights from GitHub and
point demucs at them:

```sh
mkdir models && cd models
curl -LO https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/5c90dfd2-34c22ccb.th
echo "models: ['5c90dfd2']" > htdemucs_6s.yaml && cd ..
.venv-demucs/bin/python -m demucs -n htdemucs_6s --repo models -o stems song.mp3
```

In modern cumbia demucs files the keyboard lead riffs under `other.wav` and
the off-beat keyboard comping under `guitar.wav`; check by ear or with a
spectrogram and pass `--lead-stem` / `--comp-stem` if a song differs.

## 2. (Optional) transcribe the lead stem for hold lengths

```sh
python3.11 -m venv .venv-bp && .venv-bp/bin/pip install "basic-pitch[onnx]" "setuptools<70"
.venv-bp/bin/basic-pitch --save-note-events bp stems/htdemucs_6s/song/other.wav
```

## 3. Generate the chart

```sh
python3 -m venv .venv && .venv/bin/pip install -r tools/chartgen/requirements.txt
.venv/bin/python tools/chartgen/chartgen.py stems/htdemucs_6s/song src/songs/<id>/chart.normal.json \
  --bpm 86 --offset 0.48 --groove 0 -0.03 -0.07 -0.05 --hold-beats 0.75 \
  --lead-notes bp/other_basic_pitch.csv
```

- `--bpm` / `--offset`: tempo and the time (s) of beat 1. Find the offset from
  where kick and bass onsets land; the bass stem is the most reliable.
- `--groove`: how far (in beats) each 16th position (1, e, &, a) is pushed
  from a straight grid. Measure by histogramming stem onset phases.
- `--min-gap 1` charts every 16th of the riffs (harder); default `2` is 8ths.

Use the same `offset`/`groove` values in the song's `index.ts`, then refine
anything that feels off in the in-game editor.

### Charting only the lead synth (synthchart.py)

`chartgen.py` mixes the lead riffs with the off-beat comping, so it charts
notes under the vocals too. `synthchart.py` charts just the heavy lead synth:
you list the sections where it plays, and which stems carry it there, in a
JSON file. demucs splits this synth across stems: riffs go to `other.wav`,
but the stacked chord stabs (Resaka's intro hook, its outro chord) land in
`vocals.wav`. That stem also carries the singing, so the sung verses are
kept out of the chart by leaving them off the list.

```sh
.venv/bin/python tools/chartgen/synthchart.py stems/htdemucs_6s/song \
  tools/chartgen/resaka.sections.json src/songs/resaka/chart.normal.json \
  --bpm 86 --offset 0.48 --groove 0 -0.03 -0.07 -0.05
```

A new note starts on a fresh attack or when the synth's spectrum changes;
otherwise the note keeps ringing, and anything ringing for a beat or more
becomes a hold. A hold may carry on under notes for the other hand.

### Resaka settings

Measured from the remastered 2023 audio: 86.0 BPM, steady through the whole
track (no drift), beat 1 at 0.48 s, groove `[0, -0.03, -0.07, -0.05]`. 93% of
the generated notes sit within 50 ms of a real keyboard attack in the stems
(median 11 ms).
