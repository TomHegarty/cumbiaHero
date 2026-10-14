"""Chart a battle melody from the synth's own notes.

The lead track of a melody clip is the synth on its own (the stems listed as
`leadStems`), and it drops out in the game when you miss. So the chart
should be what that track plays: a note on each synth attack, on the lane
its pitch earns.

1. Find every attack in the lead track's onset curve: each one is a note.
2. Pitch it with the top voice basic-pitch hears at that attack (the synth
   is often stacked in chords or octaves), and fold a lone note heard an
   octave off back to its neighbours' register.
3. Nudge the beat grid to where the synth sits, snap each note to the
   groove-aware 16th grid, and thin to the difficulty's spacing, keeping the
   longer note when two crowd each other.
4. Give every distinct pitch its own lane, low to high, so the same note is
   always the same key and a rising line moves right. Melodies with more
   than 8 pitches share lanes between neighbours, still in pitch order.
5. Notes that ring for a beat or more become holds.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 256
LANES = 8


@dataclass
class Note:
    start: float
    end: float
    pitch: float
    level: float


def synth_notes(y: np.ndarray, *, floor_db: float = -30, min_strength: float = 0.1) -> list[Note]:
    """One note per audible attack of the synth, pitched by its top voice.

    The rhythm comes from the synth's own onsets: every attack you can hear in
    the lead track is a note, and nothing else is. The pitch comes from
    Spotify's basic-pitch transcription, which hears every voice of a stacked
    synth; the melody is the highest voice at the attack (the skyline), as a
    keyboardist plays the tune with the top fingers.
    """
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    frames = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, delta=0.05, wait=4)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    db = 20 * np.log10(rms + 1e-9)
    loud = db.max() + floor_db
    strong = np.percentile(env[frames], 95) * min_strength if len(frames) else 0
    # Sound must follow the attack: a click in silence or a tail's flutter isn't a note
    frames = [f for f in frames if env[f] >= strong and db[f : f + 6].max() >= loud]
    starts = librosa.frames_to_time(np.array(frames, dtype=int), sr=SR, hop_length=HOP)

    events = transcribe(y)
    # For quiet attacks the transcription skips: the strongest pitch in the spectrum just after the attack
    cqt = np.abs(librosa.cqt(y, sr=SR, hop_length=HOP, fmin=librosa.midi_to_hz(36), n_bins=72))
    notes: list[Note] = []
    for k, t in enumerate(starts):
        nxt = starts[k + 1] if k + 1 < len(starts) else t + 1.0
        # Voices that begin at this attack, else whatever is sounding just after it
        group = [e for e in events if abs(e[0] - t) < 0.07]
        if not group:
            group = [e for e in events if e[0] < t + 0.05 and e[1] > t + 0.05]
        f = frames[k]
        level = float(db[f : f + 6].max())
        if group:
            loudest = max(e[3] for e in group)
            _, b, p, _ = max((e for e in group if e[3] >= 0.6 * loudest), key=lambda e: e[2])
            notes.append(Note(float(t), float(min(b, nxt)), float(p), level))
        elif f + 2 < cqt.shape[1]:
            p = 36 + int(np.argmax(cqt[:, f + 2 : f + 10].mean(axis=1)))
            notes.append(Note(float(t), float(min(t + 0.15, nxt)), float(p), level))
    return fold_octaves(notes)


def transcribe(y: np.ndarray) -> list[tuple[float, float, int, float]]:
    """Every voice in the lead track as (start, end, midi pitch, amplitude), from basic-pitch."""
    import tempfile

    import soundfile as sf
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import Model, predict

    model = Model(Path(ICASSP_2022_MODEL_PATH).parent / "nmp.onnx")
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, y, SR)
        _, _, events = predict(f.name, model, onset_threshold=0.4, frame_threshold=0.25, minimum_note_length=50)
    return sorted((float(a), float(b), int(p), float(v)) for a, b, p, v, *_ in events)


def fold_octaves(notes: list[Note]) -> list[Note]:
    """Fold a lone note heard an octave off both its neighbours back into their register.

    A real leap leads somewhere (the next note stays up there); a transcription
    slip is a single spike between two notes in the line's register.
    """
    for i in range(1, len(notes) - 1):
        n, before, after = notes[i], notes[i - 1].pitch, notes[i + 1].pitch
        for shift in (-12, 12):
            p = n.pitch + shift
            if abs(p - before) <= 5 and abs(p - after) <= 5 and abs(n.pitch - before) > 7 and abs(n.pitch - after) > 7:
                n.pitch = p
    return notes


def fit_grid(notes: list[Note], bpm: float, offset: float, groove: list[float]) -> tuple[float, list[float]]:
    """Nudge beat 1 and the groove so the 16th grid sits where the synth actually plays.

    The tempo and beat come from the drums, but a synth player can sit behind
    the beat or swing harder than the band; the chart has to follow the synth,
    since that is what the player hears and plays along with.
    """
    spb = 60 / bpm
    starts = np.array([n.start for n in notes])
    if len(starts) < 8:
        return offset, groove
    groove = list(groove)
    start = offset
    for _ in range(3):
        pos = np.round((starts - offset) / spb * 4).astype(int)
        err = np.array([(t - offset) / spb - (p / 4 + groove[p % 4]) for t, p in zip(starts, pos)])  # in beats
        # Downbeat 16ths set beat 1; every other position sets its own swing
        on = pos % 4 == 0
        base = float(np.median(err[on])) if on.sum() >= 3 else float(np.median(err))
        # A nudge, not a new beat: at most an eighth of a beat from where the drums put it
        offset = start + float(np.clip(offset - start + base * spb, -spb / 8, spb / 8))
        err -= base
        for k in (1, 2, 3):
            m = pos % 4 == k
            if m.sum() >= 3:
                groove[k] = float(np.clip(groove[k] + np.median(err[m]), -0.12, 0.12))
    return round(offset, 3), [round(g, 3) for g in groove]


def pitch_lanes(pitches: list[float]) -> dict[float, int]:
    """Each distinct pitch gets a lane, spread across the keyboard in pitch order."""
    distinct = sorted(set(pitches))
    if len(distinct) == 1:
        return {distinct[0]: 3}
    span = len(distinct) - 1
    if span < LANES:
        # Fewer pitches than keys: spread them, keeping the centre of the keyboard
        step = min(2.0, (LANES - 1) / span)
        first = round((LANES - 1 - span * step) / 2)
        return {p: int(round(first + i * step)) for i, p in enumerate(distinct)}
    return {p: int(round(i * (LANES - 1) / span)) for i, p in enumerate(distinct)}


def chart_melody(
    y: np.ndarray,
    grid,
    start: float,
    end: float,
    *,
    min_gap: int = 1,
    hold_beats: float = 1.0,
    tracker=None,
) -> tuple[list[dict], list[Note]]:
    """Chart the lead synth `y` between `start` and `end` (clip seconds) on `grid`."""
    found = [n for n in (tracker or synth_notes)(y) if start - 0.1 <= n.start < end]

    # Snap to the 16th grid; when notes collide or crowd, the longer one stays
    by_slot: dict[int, Note] = {}
    for n in found:
        slot, _ = grid.snap(n.start)
        if slot not in by_slot or n.end - n.start > by_slot[slot].end - by_slot[slot].start:
            by_slot[slot] = n
    slots = sorted(by_slot)
    # Thin to the difficulty's spacing, strongest notes first: loud, long and on the beat
    def weight(s: int) -> float:
        n = by_slot[s]
        return 10 ** (n.level / 20) * min(n.end - n.start, 0.6) * (1.3 if s % 2 == 0 else 1.0)

    taken: set[int] = set()
    for s in sorted(slots, key=weight, reverse=True):
        if all(abs(s - k) >= min_gap for k in taken):
            taken.add(s)
    kept = sorted(taken)

    pitches = [round(by_slot[s].pitch) for s in kept]
    lanes = pitch_lanes([float(p) for p in pitches])

    notes: list[dict] = []
    for i, s in enumerate(kept):
        n = by_slot[s]
        note: dict = {"b": s / 4, "l": lanes[float(pitches[i])]}
        ring = (n.end - n.start) / grid.spb
        # Room before the next note, leaving half a beat to let go
        room = ((kept[i + 1] - s) / 4 if i + 1 < len(kept) else ring + 1) - 0.5
        if ring >= hold_beats and room >= 1:
            note["d"] = float(min(np.floor(room * 2) / 2, max(1.0, round(ring * 2) / 2)))
        notes.append(note)
    return notes, [by_slot[s] for s in kept]
