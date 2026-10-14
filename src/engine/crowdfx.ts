/**
 * Synthesized crowd for the battle room: a roar with shouting voices and
 * whistles when a player steps up, and hand claps on the beat while the room
 * is hot. Everything is scheduled on the AudioContext clock so it lands in
 * time with the song.
 */

let noise: AudioBuffer | null = null
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noise.getChannelData(0)
  // Slightly pinked noise reads more like a room full of people than white noise
  let s = 11
  let last = 0
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    last = 0.85 * last + 0.15 * (s / 2 ** 31 - 1)
    d[i] = last * 3
  }
  return noise
}

export class CrowdFx {
  private readonly ctx: BaseAudioContext
  private readonly out: GainNode

  constructor(ctx: BaseAudioContext, destination: AudioNode, level = 0.5) {
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = level
    this.out.connect(destination)
  }

  /** A crowd roar starting at `at` (context seconds); `size` 1 is a full cheer. */
  cheer(at: number, size = 1): void {
    const ctx = this.ctx
    const len = 1.6 + size * 1.4

    // The roar: band-passed noise swelling in and dying away
    const roar = ctx.createBufferSource()
    roar.buffer = noiseBuffer(ctx)
    roar.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1100
    band.Q.value = 0.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.5 * size, at + 0.18)
    g.gain.setTargetAtTime(0.32 * size, at + 0.5, 0.4)
    g.gain.setTargetAtTime(0.0001, at + len * 0.55, len * 0.18)
    roar.connect(band).connect(g).connect(this.out)
    roar.start(at, Math.random())
    roar.stop(at + len + 0.5)

    // Individual voices: "¡eeeh!" shouts that rise and fall
    const voices = Math.round(10 + size * 14)
    for (let i = 0; i < voices; i++) {
      const t0 = at + Math.random() * 0.45
      const dur = 0.5 + Math.random() * (0.6 + size)
      const f0 = 170 + Math.random() * 260
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f0, t0)
      o.frequency.linearRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), t0 + 0.15)
      o.frequency.linearRampToValueAtTime(f0 * 0.8, t0 + dur)
      const formant = ctx.createBiquadFilter()
      formant.type = 'bandpass'
      formant.frequency.value = 700 + Math.random() * 600
      formant.Q.value = 3
      const vg = ctx.createGain()
      vg.gain.setValueAtTime(0.0001, t0)
      vg.gain.exponentialRampToValueAtTime(0.05 * (0.5 + size * 0.5), t0 + 0.06)
      vg.gain.setTargetAtTime(0.0001, t0 + dur * 0.6, dur * 0.2)
      o.connect(formant).connect(vg).connect(this.out)
      o.start(t0)
      o.stop(t0 + dur + 0.4)
    }

    // Fan whistles on a big cheer
    if (size >= 0.8) {
      for (let i = 0; i < 2; i++) {
        const t0 = at + 0.1 + Math.random() * 0.5
        const o = ctx.createOscillator()
        o.frequency.value = 2600 + Math.random() * 600
        const vib = ctx.createOscillator()
        vib.frequency.value = 22 + Math.random() * 8
        const depth = ctx.createGain()
        depth.gain.value = 60
        vib.connect(depth).connect(o.frequency)
        const wg = ctx.createGain()
        wg.gain.setValueAtTime(0.0001, t0)
        wg.gain.exponentialRampToValueAtTime(0.035, t0 + 0.03)
        wg.gain.setTargetAtTime(0.0001, t0 + 0.5 + Math.random() * 0.4, 0.06)
        o.connect(wg).connect(this.out)
        for (const n of [o, vib]) {
          n.start(t0)
          n.stop(t0 + 1.4)
        }
      }
    }
  }

  /** A crowd hand clap at `at`; `loud` 0..1 scales how many hands join in. */
  clap(at: number, loud = 1): void {
    const ctx = this.ctx
    // A few slightly spread bursts make a crowd clap rather than one pair of hands
    for (let i = 0; i < 3; i++) {
      const t0 = at + i * 0.007 + Math.random() * 0.006
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(ctx)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = 1300 + i * 250
      band.Q.value = 1.2
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.28 * loud, t0 + 0.002)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
      src.connect(band).connect(g).connect(this.out)
      src.start(t0, Math.random() * 1.5, 0.12)
    }
  }

  setLevel(level: number): void {
    this.out.gain.value = level
  }

  dispose(): void {
    this.out.disconnect()
  }
}
