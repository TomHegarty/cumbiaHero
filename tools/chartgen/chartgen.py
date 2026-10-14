#!/usr/bin/env python3
"""Auto-chart a song's keyboard part for Cumbia Hero.

Expects stems from demucs `htdemucs_6s` (see README.md). In modern cumbia
the keyboard plays two roles, and each gets its own stem:

* lead riffs between vocal lines — demucs puts these in `other.wav`
* off-beat "chucu" chord stabs under the vocals — demucs files the
  keyboard comping under `guitar.wav`

For every bar we pick whichever role is active and chart it:

* lead: note onsets from spectral flux, pitch from harmonic salience on a
  CQT, mapped to lanes by melodic contour within the phrase (low = left,
  high = right, repeated pitch = same lane).
* comping: stab attacks on each off-beat, chord root from the bass stem, one lane per root on the
  left hand so chord changes are felt under the fingers.

Onsets are snapped to a 16th-note grid that includes the song's groove
(cumbia pushes the off-beats early), so the chart's beats stay clean while
hit times match the recording.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 128
LANES = 8
FMIN_MIDI = 36
N_BINS = 72


@dataclass
class Grid:
    bpm: float
    offset: float
    groove: list[float]  # per-16th offsets in beats

    @property
    def spb(self) -> float:
        return 60.0 / self.bpm

    def slot_time(self, slot: int) -> float:
        """Time of a 16th-note slot, groove applied."""
        beat = slot / 4 + self.groove[slot % 4]
        return self.offset + beat * self.spb

    def snap(self, t: float) -> tuple[int, float]:
        """Nearest groove-aware 16th slot and the error in seconds."""
        approx = int(round((t - self.offset) / self.spb * 4))
        best = min(range(approx - 2, approx + 3), key=lambda s: abs(self.slot_time(s) - t))
        return best, abs(self.slot_time(best) - t)


def load(path: Path) -> np.ndarray:
    y, _ = librosa.load(path, sr=SR, mono=True)
    return y


def onsets(y: np.ndarray, delta: float) -> tuple[np.ndarray, np.ndarray]:
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    frames = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, delta=delta, wait=4)
    return librosa.frames_to_time(frames, sr=SR, hop_length=HOP), env[frames]


def salience(y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Harmonic-summed CQT salience, shape (pitches, frames)."""
    C = np.abs(librosa.cqt(y, sr=SR, hop_length=HOP, fmin=librosa.midi_to_hz(FMIN_MIDI), n_bins=N_BINS))
    S = C.copy()
    for h, w in ((12, 0.5), (19, 0.33), (24, 0.25)):
        S[: N_BINS - h] += w * C[h:]
    times = librosa.frames_to_time(np.arange(C.shape[1]), sr=SR, hop_length=HOP)
    return S, times


def pitch_at(S: np.ndarray, times: np.ndarray, t: float, lo: int, hi: int) -> int:
    a, b = np.searchsorted(times, [t + 0.01, t + 0.09])
    seg = S[lo - FMIN_MIDI : hi - FMIN_MIDI, a : max(b, a + 1)].mean(axis=1)
    return int(np.argmax(seg)) + lo


def sustain(S: np.ndarray, times: np.ndarray, t: float, pitch: int, limit: float) -> float:
    """Seconds the pitch keeps ringing above half its attack level."""
    row = S[pitch - FMIN_MIDI]
    a = int(np.searchsorted(times, t + 0.02))
    b = int(np.searchsorted(times, t + limit))
    if a >= len(row):
        return 0.0
    peak = row[a : a + 8].max()
    seg = row[a:b]
    below = np.nonzero(seg < peak * 0.5)[0]
    end = below[0] if len(below) else len(seg)
    return float(end * HOP / SR)


def bar_rms_db(y: np.ndarray, grid: Grid, bar: int) -> float:
    t0 = grid.offset + bar * 4 * grid.spb
    a, b = int(max(0, t0) * SR), int(max(0, t0 + 4 * grid.spb) * SR)
    x = y[a:b]
    return float(20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-9)) if len(x) else -120.0


def contour_lanes(pitches: list[int], beats: list[float], window: float) -> list[int]:
    """Map a pitch sequence to lanes: phrase-relative rank, with honest motion."""
    lanes: list[int] = []
    for i, (p, b) in enumerate(zip(pitches, beats)):
        ctx = sorted({q for q, c in zip(pitches, beats) if abs(c - b) <= window})
        if len(ctx) == 1:
            lane = 5
        elif len(ctx) <= LANES:
            lane = round(ctx.index(p) / (len(ctx) - 1) * (LANES - 1))
        else:
            lane = round((p - ctx[0]) / (ctx[-1] - ctx[0]) * (LANES - 1))
        if i > 0 and beats[i] - beats[i - 1] <= 2:
            prev_p, prev_l = pitches[i - 1], lanes[-1]
            if p == prev_p:
                lane = prev_l
            elif p > prev_p and lane <= prev_l:
                lane = min(LANES - 1, prev_l + 1)
            elif p < prev_p and lane >= prev_l:
                lane = max(0, prev_l - 1)
        lanes.append(lane)
    return lanes


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stems", type=Path, help="folder with other.wav and guitar.wav")
    ap.add_argument("out", type=Path, help="chart JSON to write")
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--offset", type=float, required=True, help="seconds where beat 0 falls")
    ap.add_argument("--groove", type=float, nargs=4, default=[0, 0, 0, 0], help="per-16th offsets in beats")
    ap.add_argument("--lead-stem", default="other.wav")
    ap.add_argument("--lead-notes", type=Path, help="basic-pitch CSV for the lead stem (better hold lengths)")
    ap.add_argument("--comp-stem", default="guitar.wav")
    ap.add_argument("--bass-stem", default="bass.wav")
    ap.add_argument("--comp-db", type=float, default=-40, help="bar RMS above this = comping present")
    ap.add_argument("--stab-factor", type=float, default=1.5, help="attack must beat median flux by this")
    ap.add_argument("--lead-db", type=float, default=-36, help="bar RMS above this = lead section")
    ap.add_argument("--max-err", type=float, default=0.07, help="drop onsets this far off-grid (s)")
    ap.add_argument("--min-gap", type=int, default=2, help="min 16ths between lead notes")
    ap.add_argument("--hold-beats", type=float, default=1.0, help="sustain needed for a hold note")
    ap.add_argument("--window", type=float, default=4.0, help="phrase window (beats) for lane mapping")
    ap.add_argument("--name", default="Normal")
    args = ap.parse_args()

    grid = Grid(args.bpm, args.offset, args.groove)
    lead = load(args.stems / args.lead_stem)
    comp = load(args.stems / args.comp_stem)
    bars = int((len(lead) / SR - args.offset) / (4 * grid.spb)) + 1
    lead_bars = {b for b in range(bars) if bar_rms_db(lead, grid, b) > args.lead_db}

    # --- Lead riffs ---
    bp_notes: list[tuple[float, float, int]] = []
    if args.lead_notes:
        with args.lead_notes.open() as f:
            rows = list(csv.reader(f))[1:]
        bp_notes = [(float(r[0]), float(r[1]), int(r[2])) for r in rows]
    S, stimes = salience(lead)
    lt, ls = onsets(lead, delta=0.08)
    lead_events: dict[int, tuple[float, int, float]] = {}  # slot -> (strength, pitch, sustain)
    for t, s in zip(lt, ls):
        slot, err = grid.snap(t)
        if err > args.max_err or slot // 16 not in lead_bars:
            continue
        p = pitch_at(S, stimes, t, 55, 100)
        sus = sustain(S, stimes, t, p, limit=4 * grid.spb)
        for bs, be, bp in bp_notes:
            if abs(bs - t) <= 0.08 and abs(bp - p) <= 1:
                sus = max(sus, be - bs)
        if slot not in lead_events or s > lead_events[slot][0]:
            lead_events[slot] = (float(s), p, sus)
    # Thin to the density for this difficulty. With min-gap 2 (8ths) prefer the
    # on-beat/"and" note of each pair so riffs keep a steady pulse.
    kept: list[int] = []
    for slot in sorted(lead_events):
        if args.min_gap >= 2 and slot % 2 == 1 and slot - 1 in lead_events:
            continue
        if kept and slot - kept[-1] < args.min_gap:
            continue
        kept.append(slot)
    pitches = [lead_events[s][1] for s in kept]
    beats = [s / 4 for s in kept]
    lanes = contour_lanes(pitches, beats, args.window)

    notes = []
    for i, (slot, lane) in enumerate(zip(kept, lanes)):
        note = {"b": slot / 4, "l": lane}
        next_slot = kept[i + 1] if i + 1 < len(kept) else slot + 64
        sus_beats = lead_events[slot][2] / grid.spb
        room = (next_slot - slot) / 4 - 0.5
        # Hold sustained notes, and phrase-ending notes that ring into a gap.
        phrase_end = room >= 1.5 and sus_beats >= 0.4
        if (sus_beats >= args.hold_beats and room >= args.hold_beats) or phrase_end:
            note["d"] = max(0.5, round(min(max(sus_beats, 1.0), room) * 2) / 2)
        notes.append(note)

    # --- Comping stabs ---
    # The stab rhythm is steady, so test each off-beat slot for an attack
    # instead of trusting a global onset picker.
    cenv = librosa.onset.onset_strength(y=comp, sr=SR, hop_length=HOP)
    cenv_t = librosa.times_like(cenv, sr=SR, hop_length=HOP)
    bass = load(args.stems / args.bass_stem)
    Cb = np.abs(librosa.cqt(bass, sr=SR, hop_length=HOP, fmin=librosa.midi_to_hz(28), n_bins=36))
    Cb_t = librosa.frames_to_time(np.arange(Cb.shape[1]), sr=SR, hop_length=HOP)
    floor = float(np.median(cenv)) * args.stab_factor
    stabs: dict[int, int] = {}  # slot -> bass pitch class
    for bar in range(bars):
        if bar in lead_bars or bar_rms_db(comp, grid, bar) < args.comp_db:
            continue
        for beat in range(4):
            slot = bar * 16 + beat * 4 + 2
            t = grid.slot_time(slot)
            a, b = np.searchsorted(cenv_t, [t - 0.05, t + 0.05])
            if b <= a or cenv[a:b].max() < floor:
                continue
            # Bass alternates root/fifth each beat; the half-bar downbeat holds the root.
            down = grid.slot_time(bar * 16 + (beat // 2) * 8)
            ba, bb = np.searchsorted(Cb_t, [down, down + 0.25])
            prof = Cb[:, ba:max(bb, ba + 1)].mean(axis=1)
            stabs[slot] = (int(np.argmax(prof)) + 28) % 12
    # Most common bass root sits under the index finger (F), then D, S, A.
    counts: dict[int, int] = {}
    for c in stabs.values():
        counts[c] = counts.get(c, 0) + 1
    ranked = sorted(counts, key=lambda c: -counts[c])
    chord_lane = {c: [3, 2, 1, 0][min(i, 3)] for i, c in enumerate(ranked)}
    prev_chord = None
    for slot in sorted(stabs):
        c = stabs[slot]
        notes.append({"b": slot / 4, "l": chord_lane[c]})
        # Accent each chord change with the mirrored right-hand key.
        if prev_chord is not None and c != prev_chord:
            notes.append({"b": slot / 4, "l": 7 - chord_lane[c]})
        prev_chord = c

    notes.sort(key=lambda n: (n["b"], n["l"]))
    chart = {"name": args.name, "source": "generated", "notes": notes}
    args.out.write_text(json.dumps(chart, separators=(",", ":")) + "\n")

    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    print(f"bars {bars} · lead bars {len(lead_bars)} · lead notes {len(kept)} · stabs {len(stabs)}")
    print("comp roots", [(names[r], counts[r]) for r in ranked])
    spans = sorted(lead_bars)
    print("lead bars", spans)
    print(f"total {len(notes)} notes · holds {sum('d' in n for n in notes)}")


if __name__ == "__main__":
    main()
