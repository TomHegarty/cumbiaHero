let sharedCtx: AudioContext | null = null

export function audioContext(): AudioContext {
  sharedCtx ??= new AudioContext({ latencyHint: 'interactive' })
  return sharedCtx
}

const bufferCache = new Map<string, Promise<AudioBuffer>>()

export function loadAudio(url: string): Promise<AudioBuffer> {
  let p = bufferCache.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((data) => audioContext().decodeAudioData(data))
    p.catch(() => bufferCache.delete(url))
    bufferCache.set(url, p)
  }
  return p
}

/**
 * Plays an AudioBuffer and exposes a song clock derived from the
 * AudioContext's hardware clock, which is far steadier than frame timing.
 */
export class SongPlayer {
  private source: AudioBufferSourceNode | null = null
  private readonly gain: GainNode
  /** ctx.currentTime at which song-time 0 would have played. */
  private startCtxTime = 0
  private pausedAt = 0
  private rate = 1
  playing = false
  private onEnded: (() => void) | null = null

  readonly buffer: AudioBuffer
  private readonly ctx: AudioContext

  constructor(buffer: AudioBuffer, ctx: AudioContext = audioContext()) {
    this.buffer = buffer
    this.ctx = ctx
    this.gain = ctx.createGain()
    this.gain.connect(ctx.destination)
  }

  get duration(): number {
    return this.buffer.duration
  }

  get playbackRate(): number {
    return this.rate
  }

  setPlaybackRate(r: number): void {
    const t = this.currentTime
    this.rate = r
    if (this.playing) this.play(t)
    else this.pausedAt = t
  }

  setVolume(v: number): void {
    this.gain.gain.value = v
  }

  setOnEnded(fn: (() => void) | null): void {
    this.onEnded = fn
  }

  /** Current position in song seconds (may be negative during a lead-in). */
  get currentTime(): number {
    if (!this.playing) return this.pausedAt
    return (this.ctx.currentTime - this.startCtxTime) * this.rate
  }

  /** Start playing from `at` seconds. Negative values give a silent lead-in. */
  play(at = this.pausedAt): void {
    this.stopSource()
    void this.ctx.resume()
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.playbackRate.value = this.rate
    src.connect(this.gain)
    const now = this.ctx.currentTime
    this.startCtxTime = now - at / this.rate
    if (at >= 0) src.start(now, at)
    else src.start(now - at / this.rate, 0)
    src.onended = () => {
      if (this.source === src) {
        this.playing = false
        this.pausedAt = this.duration
        this.source = null
        this.onEnded?.()
      }
    }
    this.source = src
    this.playing = true
  }

  pause(): void {
    if (!this.playing) return
    this.pausedAt = this.currentTime
    this.stopSource()
    this.playing = false
  }

  seek(t: number): void {
    if (this.playing) this.play(t)
    else this.pausedAt = t
  }

  dispose(): void {
    this.stopSource()
    this.playing = false
    this.gain.disconnect()
  }

  private stopSource(): void {
    if (this.source) {
      const s = this.source
      this.source = null
      s.onended = null
      try {
        s.stop()
      } catch {
        // already stopped
      }
      s.disconnect()
    }
  }
}

/** Short percussive click, used by calibration and the editor metronome. */
export function click(ctx: AudioContext, when: number, accent = false): void {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = accent ? 1760 : 1320
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(0.5, when + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
  osc.connect(g).connect(ctx.destination)
  osc.start(when)
  osc.stop(when + 0.08)
}
