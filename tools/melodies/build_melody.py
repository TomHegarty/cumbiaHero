#!/usr/bin/env python3
"""Turn a full song recording into a battle melody clip.

For a library entry in src/melodies/library.json, takes the song from
songs-in/<id>.mp3 and:

1. separates it into stems with demucs (htdemucs_6s), cached in stems/
2. measures tempo, beat 1 and groove from the drums and bass
3. cuts the melody section, starting one bar early as a count-in
4. splits the clip into a lead track (the stems that carry the synth, listed
   per song as `leadStems`) and a backing track (everything else: drums, bass,
   guitar, piano, shouts), written as MP3s to public/melodies/<id>/
5. charts the lead synth from its own notes (tools/melodies/melody_chart.py:
   basic-pitch transcription, top voice, a lane per pitch), lines the beat
   grid up with where the synth actually plays, and writes the clip's timing
   and chart to src/melodies/clips/<id>.json

The game picks the clip up on the next build; the melody stops being a demo.

    python tools/melodies/build_melody.py se-te-ve-la-tanga --start 0.5 --end 17
    python tools/melodies/build_melody.py se-te-ve-la-tanga --find   # suggest sections
    python tools/melodies/build_melody.py --all                      # every song in songs-in/
    python tools/melodies/build_melody.py --all --chart-only         # re-chart built clips only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "chartgen"))
sys.path.insert(0, str(ROOT / "tools" / "melodies"))

from chartgen import HOP, SR, Grid  # noqa: E402
from melody_chart import chart_melody, fit_grid, synth_notes  # noqa: E402

LIBRARY = ROOT / "src" / "melodies" / "library.json"
CLIPS = ROOT / "src" / "melodies" / "clips"
AUDIO = ROOT / "public" / "melodies"
SONGS_IN = ROOT / "songs-in"
STEMS = ROOT / "stems"
STEM_NAMES = ["drums", "bass", "guitar", "piano", "other", "vocals"]


def find_song(song_id: str) -> Path | None:
    for ext in ("mp3", "m4a", "wav", "flac", "ogg", "webm"):
        p = SONGS_IN / f"{song_id}.{ext}"
        if p.exists():
            return p
    return None


def separate(song: Path, song_id: str) -> Path:
    out = STEMS / "htdemucs_6s" / song_id
    if all((out / f"{s}.wav").exists() for s in STEM_NAMES):
        return out
    print(f"separating {song.name} (a minute or two on CPU)…")
    subprocess.run(
        [sys.executable, "-m", "demucs", "-n", "htdemucs_6s", "-o", str(STEMS),
         "--filename", f"{song_id}/{{stem}}.{{ext}}", str(song)],
        check=True,
    )
    return out


def mono(stems: Path, names: list[str]) -> np.ndarray:
    ys = [librosa.load(stems / f"{n}.wav", sr=SR, mono=True)[0] for n in names]
    n = min(len(y) for y in ys)
    return sum(y[:n] for y in ys)


def suggest_sections(stems: Path, lead_stems: list[str], length: float, count: int = 5) -> list[tuple[float, float]]:
    """Windows where the lead synth is loudest against the singing."""
    lead = mono(stems, lead_stems)
    rest = mono(stems, ["vocals"]) if "vocals" not in lead_stems else np.zeros_like(lead)
    hop = SR // 2

    def frame_db(y: np.ndarray) -> np.ndarray:
        n = len(y) // hop * hop
        return 20 * np.log10(np.sqrt((y[:n].reshape(-1, hop) ** 2).mean(axis=1)) + 1e-6)

    # Loud lead, quiet singing (half weight: shouts over a riff are fine)
    score = frame_db(lead) - 0.5 * frame_db(rest)
    win = max(1, int(length * 2))
    totals = np.convolve(score, np.ones(win) / win, "valid")
    picks: list[tuple[float, float]] = []
    for i in np.argsort(-totals):
        start = i / 2
        if all(abs(start - p[0]) >= length for p in picks):
            picks.append((start, float(totals[i])))
        if len(picks) == count:
            break
    return picks


def measure_tempo(stems: Path, lead_stems: list[str], start: float, end: float) -> tuple[float, float]:
    """BPM and the time of a downbeat near `start`, from the drums, bass and lead."""
    a = max(0.0, start - 4)
    rhythm = mono(stems, ["drums", "bass"])[int(a * SR) : int((end + 4) * SR)]
    env = librosa.onset.onset_strength(y=rhythm, sr=SR, hop_length=HOP)
    tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, start_bpm=95)
    times = librosa.frames_to_time(beats, sr=SR, hop_length=HOP) + a
    if len(times) < 8:
        raise SystemExit("could not find a steady beat in this section; pass --bpm and --offset")
    # Refine the tracker's estimate: the tempo and phase whose grid lands on the most onset energy
    est = 60 / float(np.median(np.diff(times)))
    while est > 130:
        est /= 2
    while est < 65:
        est *= 2
    env_t = librosa.times_like(env, sr=SR, hop_length=HOP) + a
    best = (-1.0, est, times[0])
    for bpm in np.arange(est - 2, est + 2.01, 0.1):
        spb = 60 / bpm
        grid = np.arange(start, end, spb)
        for phase in np.arange(0, spb, 0.005):
            score = np.interp(grid + phase, env_t, env).mean()
            if score > best[0]:
                best = (score, bpm, start + phase)
    _, bpm, t0 = best
    # The onset envelope peaks a little after each attack, so fine-tune the grid against the
    # attacks themselves: the drum and lead onsets that land on the 8th-note grid
    attacks = np.concatenate([
        librosa.onset.onset_detect(y=mono(stems, names)[int(start * SR) : int(end * SR)], sr=SR, hop_length=HOP, units="time") + start
        for names in (["drums"], lead_stems)
    ])
    fine = (-1.0, bpm, t0)
    for b in np.arange(bpm - 0.3, bpm + 0.31, 0.05):
        half = 30 / b
        for shift in np.arange(-0.08, 0.081, 0.004):
            x = (attacks - (t0 + shift)) / half
            score = float((np.abs(x - np.round(x)) * half < 0.025).mean())
            if score > fine[0]:
                fine = (score, b, t0 + shift)
    _, bpm, t0 = fine
    bpm = round(float(bpm), 2)
    spb = 60 / bpm
    # Kick and bass both play every beat, but the bass leans on 1 and 3: pick the
    # stronger pair. Telling 1 from 3 isn't possible from onsets and doesn't matter
    # for the chart, so beat 0 is the first of the pair inside the section.
    bass = mono(stems, ["bass"])
    benv = librosa.onset.onset_strength(y=bass, sr=SR, hop_length=HOP)
    btimes = librosa.times_like(benv, sr=SR, hop_length=HOP)
    first = t0 + np.ceil((start - 0.15 - t0) / spb) * spb
    strength = np.zeros(2)
    for i in range(int((end - first) / spb)):
        j = np.searchsorted(btimes, [first + i * spb - 0.04, first + i * spb + 0.04])
        if j[1] > j[0]:
            strength[i % 2] += benv[j[0] : j[1]].max()
    downbeat = first + int(np.argmax(strength)) * spb
    return bpm, float(downbeat)


def measure_groove(stems: Path, lead_stems: list[str], bpm: float, beat0: float, start: float, end: float) -> list[float]:
    """Median push of each 16th position (1, e, &, a) from a straight grid, in beats.

    Measured on the lead synth in the section: that's the feel the player has to hit.
    """
    y = mono(stems, lead_stems)[int(start * SR) : int(end * SR)]
    onsets = librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, units="time") + start
    spb = 60 / bpm
    devs: list[list[float]] = [[], [], [], []]
    for t in onsets:
        pos = (t - beat0) / spb * 4
        slot = int(round(pos))
        d = (pos - slot) / 4
        if abs(d) <= 0.11:
            devs[slot % 4].append(d)
    base = np.median(devs[0]) if len(devs[0]) >= 3 else 0.0
    groove = [0.0]
    for d in devs[1:]:
        g = float(np.median(d) - base) if len(d) >= 3 else 0.0
        groove.append(round(float(np.clip(g, -0.11, 0.11)), 2))
    return groove


def write_clip(stems: Path, song_id: str, lead_stems: list[str], a: float, b: float) -> Path:
    """Cut every stem to [a, b] for charting, and mix the lead and backing MP3s."""
    clip_dir = STEMS / "clips" / song_id
    clip_dir.mkdir(parents=True, exist_ok=True)
    lead = backing = None
    for name in STEM_NAMES:
        y, sr = sf.read(stems / f"{name}.wav", always_2d=True)
        seg = y[int(a * sr) : int(b * sr)]
        sf.write(clip_dir / f"{name}.wav", seg, sr)
        if name in lead_stems:
            lead = seg if lead is None else lead + seg
        else:
            backing = seg if backing is None else backing + seg
    assert lead is not None and backing is not None
    # Short fade in, longer fade out, and one gain for both tracks so their balance is kept
    fade_in, fade_out = int(0.01 * sr), int(1.0 * sr)
    env = np.ones(len(lead))
    env[:fade_in] = np.linspace(0, 1, fade_in)
    env[-fade_out:] = np.linspace(1, 0, fade_out)
    gain = min(1.0, 0.98 / (np.abs(lead + backing).max() + 1e-9))
    out = AUDIO / song_id
    out.mkdir(parents=True, exist_ok=True)
    for track, y in (("lead", lead), ("backing", backing)):
        wav = clip_dir / f"_{track}.wav"
        sf.write(wav, y * env[:, None] * gain, sr)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "4",
             str(out / f"{track}.mp3")],
            check=True,
        )
    return clip_dir


def write_chart(song_id: str, clip_dir: Path, lead_stems: list[str], clip: dict, min_gap: int) -> list[dict]:
    """Chart the clip's lead synth and save the clip's timing and chart."""
    y = sum(librosa.load(clip_dir / f"{name}.wav", sr=SR, mono=True)[0] for name in lead_stems)
    src = clip["source"]
    a, b = src["start"] - src["clipStart"], src["end"] - src["clipStart"]
    # Line the grid up with the synth: it can sit behind the drums or swing harder than them
    heard = [n for n in synth_notes(y) if a - 0.1 <= n.start < b]
    clip["offset"], clip["groove"] = fit_grid(heard, clip["bpm"], clip["offset"], clip["groove"])
    grid = Grid(clip["bpm"], clip["offset"], clip["groove"])
    notes, _ = chart_melody(y, grid, max(0.0, a - 0.1), b, min_gap=min_gap)
    notes = [n for n in notes if n["b"] >= -4]
    clip["chart"] = {"name": "Normal", "source": "generated", "notes": notes}
    CLIPS.mkdir(parents=True, exist_ok=True)
    (CLIPS / f"{song_id}.json").write_text(json.dumps(clip, separators=(",", ":"), ensure_ascii=False) + "\n")
    return notes


def build(entry: dict, args: argparse.Namespace) -> None:
    song_id = entry["id"]
    if args.chart_only:
        # Re-chart a built clip from its cut stems, keeping its audio and tempo
        clip = json.loads((CLIPS / f"{song_id}.json").read_text())
        clip.pop("chart", None)
        notes = write_chart(song_id, STEMS / "clips" / song_id, args.lead_stems or entry["leadStems"], clip, args.min_gap)
        print(f"{song_id}: {len(notes)} notes ({sum('d' in n for n in notes)} holds), grid {clip['offset']}s {clip['groove']}")
        return
    song = find_song(song_id)
    if not song:
        raise SystemExit(f"put the recording at songs-in/{song_id}.mp3")
    stems = separate(song, song_id)
    lead_stems = args.lead_stems or entry["leadStems"]

    if args.find:
        length = entry["end"] - entry["start"]
        print(f"{entry['title']}: lead synth strongest in these {length:.0f}s windows")
        for start, score in suggest_sections(stems, lead_stems, length):
            print(f"  --start {start:6.1f} --end {start + length:6.1f}   (score {score:.1f})")
        return

    start = args.start if args.start is not None else entry["start"]
    end = args.end if args.end is not None else entry["end"]
    if args.bpm and args.offset is not None:
        bpm, beat0 = args.bpm, args.offset
    else:
        bpm, beat0 = measure_tempo(stems, lead_stems, start, end)
    spb = 60 / bpm
    # Beat 0 is the first downbeat in the section; a pickup before it gets negative beats
    beat0 = float(beat0 + np.ceil((start - 0.15 - beat0) / (4 * spb)) * 4 * spb)
    groove = args.groove or measure_groove(stems, lead_stems, bpm, beat0, start, end)

    clip_start = max(0.0, beat0 - 4 * spb)
    clip_end = end + 1.0
    clip_dir = write_clip(stems, song_id, lead_stems, clip_start, clip_end)

    offset = beat0 - clip_start
    clip = {
        "bpm": bpm,
        "offset": round(offset, 3),
        "groove": groove,
        "beatsPerBar": 4,
        "source": {"start": start, "end": end, "clipStart": round(clip_start, 3)},
    }
    notes = write_chart(song_id, clip_dir, lead_stems, clip, args.min_gap)

    # Remember a section given on the command line
    if args.start is not None or args.end is not None:
        lib = json.loads(LIBRARY.read_text())
        for e in lib:
            if e["id"] == song_id:
                e.update(start=start, end=end, approx=False)
        LIBRARY.write_text(json.dumps(lib, indent=2, ensure_ascii=False) + "\n")

    holds = sum("d" in n for n in notes)
    print(
        f"{song_id}: {bpm} BPM · beat 1 at {beat0:.2f}s · groove {clip['groove']} · "
        f"{len(notes)} notes ({holds} holds) · clip {clip_start:.1f}-{clip_end:.1f}s"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("id", nargs="?", help="library id, e.g. se-te-ve-la-tanga")
    ap.add_argument("--all", action="store_true", help="build every library song found in songs-in/")
    ap.add_argument("--find", action="store_true", help="suggest sections where the lead synth plays")
    ap.add_argument("--start", type=float, help="section start in the full song (s); saved to library.json")
    ap.add_argument("--end", type=float, help="section end in the full song (s); saved to library.json")
    ap.add_argument("--lead-stems", nargs="+", choices=STEM_NAMES, help="stems carrying the synth here")
    ap.add_argument("--bpm", type=float, help="override the measured tempo (needs --offset)")
    ap.add_argument("--offset", type=float, help="time (s) of beat 1 in the full song")
    ap.add_argument("--groove", type=float, nargs=4, help="per-16th offsets in beats")
    ap.add_argument("--min-gap", type=int, default=1, help="min 16ths between notes (2 = easier, eighths only)")
    ap.add_argument("--chart-only", action="store_true", help="re-chart an already built clip, keeping its audio")
    args = ap.parse_args()

    library = json.loads(LIBRARY.read_text())
    if args.all:
        todo = [e for e in library if (CLIPS / f"{e['id']}.json").exists()] if args.chart_only else [e for e in library if find_song(e["id"])]
        if not todo:
            raise SystemExit("no songs in songs-in/; name them by library id, e.g. songs-in/se-te-ve-la-tanga.mp3")
        for e in todo:
            build(e, args)
        return
    entry = next((e for e in library if e["id"] == args.id), None)
    if not entry:
        raise SystemExit(f"unknown id {args.id!r}; choose one of: {', '.join(e['id'] for e in library)}")
    build(entry, args)


if __name__ == "__main__":
    main()
