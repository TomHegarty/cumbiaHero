import type { Song, SongTracks } from '../songs/types'

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

/** Loads (or synthesizes) a song's audio, with its lead synth track when it has one. */
export function loadSongTracks(song: Song): Promise<SongTracks> {
  if (song.synth) return song.synth()
  const base = import.meta.env.BASE_URL
  return Promise.all([loadAudio(base + song.audio), song.lead ? loadAudio(base + song.lead) : undefined]).then(
    ([main, lead]) => ({ main, lead }),
  )
}

/**
 * Plays an AudioBuffer and exposes a song clock derived from the
 * AudioContext's hardware clock, which is far steadier than frame timing.
 */
export class SongPlayer {
  private source: AudioBufferSourceNode | null = null
  private leadSource: AudioBufferSourceNode | null = null
  private readonly gain: GainNode
  private readonly leadGain: GainNode
  /** ctx.currentTime at which song-time 0 would have played. */
  private startCtxTime = 0
  private pausedAt = 0
  private rate = 1
  playing = false
  private onEnded: (() => void) | null = null

  readonly buffer: AudioBuffer
  /** Optional lead synth track, played in sync with `buffer` on its own fader. */
  readonly lead: AudioBuffer | null
  private readonly ctx: AudioContext

  constructor(buffer: AudioBuffer, ctx: AudioContext = audioContext(), lead?: AudioBuffer) {
    this.buffer = buffer
    this.lead = lead ?? null
    this.ctx = ctx
    this.gain = ctx.createGain()
    this.gain.connect(ctx.destination)
    this.leadGain = ctx.createGain()
    this.leadGain.connect(this.gain)
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

  /** Fades the lead track towards `v` (0..1), e.g. dropping it out on a miss as in Guitar Hero. */
  setLeadLevel(v: number): void {
    this.leadGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015)
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
    if (this.lead) {
      const lead = this.ctx.createBufferSource()
      lead.buffer = this.lead
      lead.playbackRate.value = this.rate
      lead.connect(this.leadGain)
      if (at >= 0) lead.start(now, Math.min(at, this.lead.duration))
      else lead.start(now - at / this.rate, 0)
      this.leadSource = lead
    }
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
    this.leadGain.disconnect()
  }

  private stopSource(): void {
    if (this.leadSource) {
      const l = this.leadSource
      this.leadSource = null
      try {
        l.stop()
      } catch {
        // already stopped
      }
      l.disconnect()
    }
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
