import { SongTiming } from '../engine/chart'
import type { Song, SongTracks } from '../songs/types'
import { DEMO_BARS, demoEvents, type DemoRiff } from './demo'

/**
 * Renders a demo riff in the browser: a cumbia backing (kick, güira, bass,
 * off-beat chord stabs) and the lead synth on its own track, so the lead can
 * drop out on misses just like a separated recording.
 */

const SR = 44100

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Minor-key triad on a scale step; V is major, as cumbia's harmonic minor has it. */
function triad(step: number): number[] {
  const major = [3, 7, 8, 10].includes(((step % 12) + 12) % 12)
  return [0, major ? 4 : 3, 7].map((i) => step + i)
}

let noise: AudioBuffer | null = null
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noise.getChannelData(0)
  let s = 7
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    d[i] = s / 2 ** 31 - 1
  }
  return noise
}

function envelope(ctx: BaseAudioContext, at: number, peak: number, decay: number, out: AudioNode): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  g.connect(out)
  return g
}

function kick(ctx: BaseAudioContext, at: number, out: AudioNode) {
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(130, at)
  o.frequency.exponentialRampToValueAtTime(45, at + 0.12)
  o.connect(envelope(ctx, at, 0.9, 0.3, out))
  o.start(at)
  o.stop(at + 0.32)
}

function guira(ctx: BaseAudioContext, at: number, accent: boolean, out: AudioNode) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 6500
  src.connect(hp).connect(envelope(ctx, at, accent ? 0.22 : 0.1, accent ? 0.09 : 0.05, out))
  src.start(at, Math.random() * 0.5, 0.12)
}

function bass(ctx: BaseAudioContext, at: number, len: number, midi: number, out: AudioNode) {
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = hz(midi)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.55, at + 0.01)
  g.gain.setTargetAtTime(0.0001, at + len * 0.7, 0.04)
  o.connect(g).connect(out)
  o.start(at)
  o.stop(at + len + 0.2)
}

function stab(ctx: BaseAudioContext, at: number, notes: number[], out: AudioNode) {
  const lp = ctx.createBiquadFilter()
  lp.frequency.value = 2200
  lp.connect(envelope(ctx, at, 0.07, 0.14, out))
  for (const m of notes) {
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = hz(m)
    o.connect(lp)
    o.start(at)
    o.stop(at + 0.16)
  }
}

function lead(ctx: BaseAudioContext, at: number, len: number, midi: number, out: AudioNode) {
  const lp = ctx.createBiquadFilter()
  lp.frequency.value = 3800
  lp.Q.value = 2
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.16, at + 0.006)
  g.gain.setTargetAtTime(0.11, at + 0.03, 0.08)
  g.gain.setTargetAtTime(0.0001, at + len, 0.03)
  lp.connect(g).connect(out)
  const vib = ctx.createOscillator()
  vib.frequency.value = 5.5
  const depth = ctx.createGain()
  depth.gain.value = len > 0.4 ? 6 : 0
  vib.connect(depth)
  vib.start(at)
  vib.stop(at + len + 0.25)
  for (const detune of [-9, 9, 1200]) {
    const o = ctx.createOscillator()
    o.type = detune === 1200 ? 'square' : 'sawtooth'
    o.frequency.value = hz(midi)
    o.detune.value = detune
    depth.connect(o.detune)
    o.connect(lp)
    o.start(at)
    o.stop(at + len + 0.25)
  }
}

/** Renders the riff's backing and lead tracks. */
export async function renderDemo(song: Song, riff: DemoRiff): Promise<SongTracks> {
  const timing = new SongTiming(song)
  const spb = 60 / riff.bpm
  const end = timing.noteTime(DEMO_BARS * 4) + 2 * spb + 1
  const length = Math.ceil(end * SR)

  const backing = new OfflineAudioContext(1, length, SR)
  const mix = backing.createGain()
  mix.gain.value = 0.8
  mix.connect(backing.destination)
  // One bar of güira count-in before beat 0, then the groove until the end
  for (let slot = -16; slot < DEMO_BARS * 16 + 4; slot++) {
    const beat = slot / 4
    const at = timing.noteTime(beat)
    if (at < 0) continue
    const inBeat = ((slot % 4) + 4) % 4
    if (inBeat !== 1) guira(backing, at, inBeat === 2, mix)
    if (slot < 0 || slot >= DEMO_BARS * 16) continue
    const bar = Math.floor(slot / 16)
    const root = riff.key - 24 + riff.chords[bar % 4]
    if (slot % 8 === 0) {
      kick(backing, at, mix)
      bass(backing, at, spb * 0.9, slot % 16 === 0 ? root : root + 7, mix)
    }
    if (slot % 8 === 6) bass(backing, at, spb * 0.4, root + 7, mix)
    if (inBeat === 2) stab(backing, at, triad(riff.chords[bar % 4]).map((s) => riff.key - 12 + s), mix)
  }

  const leadCtx = new OfflineAudioContext(1, length, SR)
  for (const e of demoEvents(riff)) {
    const at = timing.noteTime(e.beat)
    const len = Math.max(0.08, timing.noteTime(e.beat + e.beats) - at - 0.04)
    lead(leadCtx, at, len, e.midi, leadCtx.destination)
  }

  const [main, leadBuf] = await Promise.all([backing.startRendering(), leadCtx.startRendering()])
  return { main, lead: leadBuf }
}
