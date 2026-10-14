#!/usr/bin/env python3
"""Chart a song's lead synth keyboard, section by section.

Unlike chartgen.py (which mixes lead riffs with the off-beat comping), this
charts one instrument: the heavy synth keyboard that plays between vocal
lines. demucs does not keep that synth in one stem. Its lead riffs land in
`other.wav`, but its stacked chord stabs (the intro hook, for example) are
often filed under `vocals.wav`. So the caller lists the keyboard sections by
hand in a JSON file, each with the stems that carry the synth there:

    [{"start": 0.0, "end": 13.7, "stems": ["vocals", "other"]},
     {"start": 17.6, "end": 29.7, "stems": ["other"]}]

Outside the listed sections (the sung verses) the chart is left empty.

Inside a section, each note onset is snapped to the groove-aware 16th grid,
given a pitch from harmonic salience, and mapped to lanes by melodic contour.
Notes that keep ringing become holds.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import librosa
import numpy as np

from chartgen import FMIN_MIDI, HOP, SR, Grid, contour_lanes, load, pitch_at, salience, sustain


def keyboard_signal(stems: Path, sections: list[dict], n: int) -> np.ndarray:
    """Sum the listed stems inside each section, silence everywhere else."""
    cache: dict[str, np.ndarray] = {}
    out = np.zeros(n, dtype=np.float32)
    fade = int(0.02 * SR)
    for sec in sections:
        a, b = int(sec["start"] * SR), min(n, int(sec["end"] * SR))
        seg = np.zeros(b - a, dtype=np.float32)
        for name in sec["stems"]:
            if name not in cache:
                y = load(stems / f"{name}.wav")
                cache[name] = np.pad(y, (0, max(0, n - len(y))))[:n]
            seg += cache[name][a:b]
        ramp = np.linspace(0, 1, min(fade, len(seg) // 2))
        seg[: len(ramp)] *= ramp
        seg[len(seg) - len(ramp) :] *= ramp[::-1]
        out[a:b] = seg
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stems", type=Path, help="folder with the demucs htdemucs_6s stems")
    ap.add_argument("sections", type=Path, help="JSON list of {start, end, stems}")
    ap.add_argument("out", type=Path, help="chart JSON to write")
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--offset", type=float, required=True, help="seconds where beat 0 falls")
    ap.add_argument("--groove", type=float, nargs=4, default=[0, 0, 0, 0], help="per-16th offsets in beats")
    ap.add_argument("--floor-db", type=float, default=-30, help="level below the loudest frame that counts as silence")
    ap.add_argument("--attack", type=float, default=1.5, help="onset strength over the section median that counts as a new attack")
    ap.add_argument("--rise-db", type=float, default=2.0, help="level jump that makes an attack a new note")
    ap.add_argument("--same", type=float, default=0.9, help="spectral similarity below this starts a new note")
    ap.add_argument("--min-gap", type=int, default=2, help="min 16ths between notes")
    ap.add_argument("--hold-beats", type=float, default=0.75, help="sustain needed for a hold note")
    ap.add_argument("--window", type=float, default=4.0, help="phrase window (beats) for lane mapping")
    ap.add_argument("--name", default="Normal")
    args = ap.parse_args()

    grid = Grid(args.bpm, args.offset, args.groove)
    sections = json.loads(args.sections.read_text())
    n = len(load(args.stems / "drums.wav"))
    y = keyboard_signal(args.stems, sections, n)

    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    env_t = librosa.times_like(env, sr=SR, hop_length=HOP)
    S, stimes = salience(y)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    floor_db = 20 * np.log10(np.max(rms) + 1e-9) + args.floor_db

    # Walk the 16th grid. The synth is flat-pitched and often legato, so a new
    # note starts on an attack, on a change of the strongest pitch, or when
    # sound comes back after silence; otherwise the previous note rings on.
    notes_raw: list[list] = []  # [slot, pitch, length in 16ths]
    for sec in sections:
        s0, _ = grid.snap(sec["start"])
        s1, _ = grid.snap(sec["end"])
        # A slot just before the section still counts (the song's first note).
        if grid.slot_time(s0) < sec["start"] - 0.1:
            s0 += 1
        a, b = np.searchsorted(env_t, [sec["start"], sec["end"]])
        onset_floor = float(np.median(env[a:b])) * args.attack
        prev = None
        prev_vec = None
        prev_level = -120.0
        for slot in range(s0, s1):
            t, t2 = grid.slot_time(slot), grid.slot_time(slot + 1)
            fa, fb = np.searchsorted(env_t, [t, max(t2, t + 0.02)])
            level = 20 * np.log10(rms[fa:fb].mean() + 1e-9)
            if level < floor_db:
                prev = None
                prev_level = level
                continue
            sa, sb = np.searchsorted(stimes, [t + 0.01, max(t2, t + 0.03)])
            vec = S[55 - FMIN_MIDI : 100 - FMIN_MIDI, sa:sb].mean(axis=1)
            vec = vec / (np.linalg.norm(vec) + 1e-9)
            p = int(np.argmax(vec)) + 55
            oa, ob = np.searchsorted(env_t, [t - 0.04, t + 0.04])
            attack = env[oa:ob].max() > onset_floor and level > prev_level + args.rise_db
            changed = prev_vec is not None and float(vec @ prev_vec) < args.same
            if prev is None or attack or changed:
                prev = [slot, p, 1]
                notes_raw.append(prev)
            else:
                prev[2] += 1
            prev_vec, prev_level = vec, level

    # Thin to the difficulty's density. When two notes fall closer than the
    # minimum gap, a short pickup gives way to the longer note after it;
    # otherwise the later note is dropped, and its length folds into the kept
    # note when they share a pitch so sustains survive.
    kept: list[list] = []
    for n in notes_raw:
        if kept and n[0] - kept[-1][0] < args.min_gap:
            last = kept[-1]
            if n[2] > last[2] and (len(kept) < 2 or n[0] - kept[-2][0] >= args.min_gap):
                kept[-1] = n
            elif n[1] == last[1]:
                last[2] = max(last[2], n[0] + n[2] - last[0])
            continue
        kept.append(n)

    lanes = contour_lanes([n[1] for n in kept], [n[0] / 4 for n in kept], args.window)

    # A held note may ring on under notes for the other hand (lanes 0-3 are
    # the left hand, 4-7 the right), so it only has to end before the next
    # note for the same hand.
    notes = []
    for i, (n, lane) in enumerate(zip(kept, lanes)):
        slot, pitch, length = n
        note: dict = {"b": slot / 4, "l": lane}
        same_hand = [m[0] for m, ml in zip(kept[i + 1 :], lanes[i + 1 :]) if ml // 4 == lane // 4]
        next_slot = same_hand[0] if same_hand else slot + 64
        # Leave half a beat to let go before the next note.
        room = (next_slot - slot) / 4 - 0.5
        ring = max(length / 4, sustain(S, stimes, grid.slot_time(slot), pitch, limit=8 * grid.spb) / grid.spb)
        # Holds are at least a beat long so they read as holds, not taps.
        if ring >= args.hold_beats and room >= 1:
            note["d"] = float(min(np.floor(room * 2) / 2, max(1.0, round(ring * 2) / 2)))
        notes.append(note)

    chart = {"name": args.name, "source": "generated", "notes": notes}
    args.out.write_text(json.dumps(chart, separators=(",", ":")) + "\n")
    holds = [n["d"] for n in notes if "d" in n]
    print(f"notes {len(notes)} · holds {len(holds)} (median {np.median(holds) if holds else 0} beats)")
    for sec in sections:
        k = [n for n in kept if sec["start"] <= grid.slot_time(n[0]) < sec["end"]]
        print(f"  {sec['start']:6.1f}-{sec['end']:6.1f}s {'+'.join(sec['stems']):13s} {len(k)} notes")


if __name__ == "__main__":
    main()
