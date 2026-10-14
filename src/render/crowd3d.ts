/**
 * The bailanta in 3D: a handful of low-poly cumbia villera fans in
 * football shirts, tracksuits, gorritas and bucket hats, jumping on the beat,
 * swinging their shirts over their heads and waving flags under sweeping
 * stage lights. Rendered with three.js on its own canvas behind the highway.
 */
import * as THREE from 'three'
import type { CrowdState } from './crowd'

const SKIN = ['#f1c9a5', '#dcab82', '#c08a5e', '#9a6744', '#6e4429']
const HAIR = ['#120c08', '#1e130b', '#3a2414', '#e8c66a']

type Pose = 'bothUp' | 'wave' | 'pump' | 'clap' | 'shirt' | 'flag' | 'phone'

type Top = 'argentina' | 'boca' | 'river' | 'tee' | 'tracksuit' | 'crop' | 'bare'
type Hat = 'cap' | 'capBack' | 'bucket' | 'short' | 'long' | 'shaved'

interface Fan {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  prop: THREE.Object3D | null
  pose: Pose
  phase: number
  offbeat: boolean
  baseY: number
}

function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (g) paint(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function stripes(colors: string[], vertical: boolean, count: number): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const step = 64 / count
    for (let i = 0; i < count; i++) {
      g.fillStyle = colors[i % colors.length]
      if (vertical) g.fillRect(i * step, 0, step, 64)
      else g.fillRect(0, i * step, 64, step)
    }
  })
}

const TOP_TEXTURES: Record<Exclude<Top, 'bare'>, () => THREE.Texture> = {
  argentina: () => stripes(['#75aadb', '#ffffff'], true, 5),
  boca: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#0b2a6f'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#f5c400'
      g.fillRect(0, 22, 64, 18)
    }),
  river: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#f4f4f4'
      g.fillRect(0, 0, 64, 64)
      g.strokeStyle = '#d4001c'
      g.lineWidth = 14
      g.beginPath()
      g.moveTo(-6, 6)
      g.lineTo(70, 64)
      g.stroke()
    }),
  tee: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#151012'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#ffe600'
      g.beginPath()
      g.arc(32, 30, 12, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#e4002b'
      g.font = 'bold 10px Impact, sans-serif'
      g.textAlign = 'center'
      g.fillText('CUMBIA', 32, 56)
    }),
  tracksuit: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#b3001e'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#ffffff'
      g.fillRect(4, 0, 3, 64)
      g.fillRect(57, 0, 3, 64)
      g.fillStyle = '#d8d8d8'
      g.fillRect(31, 0, 2, 64)
    }),
  crop: () => stripes(['#ff4fa3', '#ffffff'], false, 4),
}

const ARG_FLAG = () =>
  canvasTexture(96, 64, (g) => {
    g.fillStyle = '#75aadb'
    g.fillRect(0, 0, 96, 64)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 21, 96, 22)
    g.fillStyle = '#f6b40e'
    g.beginPath()
    g.arc(48, 32, 7, 0, Math.PI * 2)
    g.fill()
  })

export class CrowdScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100)
  private readonly fans: Fan[] = []
  private readonly spots: { light: THREE.SpotLight; beam: THREE.Mesh; x: number; speed: number; phase: number }[] = []
  private readonly sun: THREE.Mesh
  private readonly disposables: { dispose(): void }[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.scene.background = new THREE.Color('#2a0008')
    this.scene.fog = new THREE.FogExp2('#3a000c', 0.03)
    this.camera.position.set(0, 2.9, 5)
    this.camera.lookAt(0, 1.6, -8)

    this.scene.add(new THREE.HemisphereLight('#ffb070', '#2a0008', 1.1))
    const key = new THREE.DirectionalLight('#ffd9a0', 1.4)
    key.position.set(0, 6, 8)
    this.scene.add(key)

    this.sun = this.buildBackWall()
    this.buildFloor()
    this.buildLights()
    this.buildCrowd()
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x)
    return x
  }

  private buildBackWall(): THREE.Mesh {
    const wallTex = this.own(
      canvasTexture(1024, 512, (g) => {
        g.fillStyle = '#3a0610'
        g.fillRect(0, 0, 1024, 512)
        // Rough brick courses
        g.fillStyle = 'rgba(0,0,0,0.25)'
        for (let y = 0; y < 512; y += 24) {
          g.fillRect(0, y, 1024, 2)
          for (let x = (y / 24) % 2 ? 0 : 30; x < 1024; x += 60) g.fillRect(x, y, 2, 24)
        }
      }),
    )
    const wall = new THREE.Mesh(
      this.own(new THREE.PlaneGeometry(60, 18)),
      this.own(new THREE.MeshLambertMaterial({ map: wallTex })),
    )
    wall.position.set(0, 6, -14)
    this.scene.add(wall)

    // Sunburst glowing behind the crowd, like the album covers
    const sunTex = this.own(
      canvasTexture(512, 512, (g) => {
        const c = 256
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          g.fillStyle = i % 2 ? 'rgba(255,230,0,0.5)' : 'rgba(228,0,43,0.45)'
          g.beginPath()
          g.moveTo(c, c)
          g.arc(c, c, c, a, a + Math.PI / 24)
          g.closePath()
          g.fill()
        }
        const glow = g.createRadialGradient(c, c, 0, c, c, c)
        glow.addColorStop(0, 'rgba(255,250,210,1)')
        glow.addColorStop(0.12, 'rgba(255,170,0,0.7)')
        glow.addColorStop(1, 'rgba(255,120,0,0)')
        g.fillStyle = glow
        g.fillRect(0, 0, 512, 512)
      }),
    )
    const sun = new THREE.Mesh(
      this.own(new THREE.CircleGeometry(14, 48)),
      this.own(
        new THREE.MeshBasicMaterial({
          map: sunTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      ),
    )
    sun.position.set(0, 9, -13.5)
    this.scene.add(sun)

    // Trapos hung across the wall
    const banner = (text: string, bg: string, fg: string, x: number, y: number, rot: number) => {
      const tex = this.own(
        canvasTexture(1024, 160, (g) => {
          g.fillStyle = bg
          g.fillRect(0, 0, 1024, 160)
          g.fillStyle = fg
          g.font = "bold 92px 'Permanent Marker', Impact, sans-serif"
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(text, 512, 84)
        }),
      )
      // The marker font may still be loading on first paint
      void document.fonts?.ready.then(() => {
        const g = (tex.image as HTMLCanvasElement).getContext('2d')
        if (!g) return
        g.fillStyle = bg
        g.fillRect(0, 0, 1024, 160)
        g.fillStyle = fg
        g.font = "bold 92px 'Permanent Marker', Impact, sans-serif"
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(text, 512, 84)
        tex.needsUpdate = true
      })
      const m = new THREE.Mesh(
        this.own(new THREE.PlaneGeometry(13, 2)),
        this.own(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })),
      )
      m.position.set(x, y, -13.3)
      m.rotation.z = rot
      this.scene.add(m)
    }
    banner('¡DALE TECLADISTA!', '#ffe600', '#b3001e', -9, 4.2, 0.03)
    banner('LA BANDA DE LA CUMBIA', '#b3001e', '#ffe600', 9, 4.6, -0.04)
    const flag = this.own(ARG_FLAG())
    for (const x of [-15, 0, 15]) {
      const f = new THREE.Mesh(
        this.own(new THREE.PlaneGeometry(4.5, 3)),
        this.own(new THREE.MeshLambertMaterial({ map: flag, side: THREE.DoubleSide })),
      )
      f.position.set(x, 3.4, -13.2)
      this.scene.add(f)
    }
    return sun
  }

  private buildFloor(): void {
    const floor = new THREE.Mesh(
      this.own(new THREE.PlaneGeometry(60, 40)),
      this.own(new THREE.MeshLambertMaterial({ color: '#1a0306' })),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.z = -10
    this.scene.add(floor)
  }

  private buildLights(): void {
    const beamGeo = this.own(new THREE.ConeGeometry(1.6, 16, 24, 1, true))
    beamGeo.translate(0, -8, 0)
    const rigs = [
      { x: -9, color: '#ffe600', speed: 0.7, phase: 0 },
      { x: -3, color: '#ff2a2a', speed: -0.55, phase: 1.3 },
      { x: 3, color: '#ff8a00', speed: 0.6, phase: 2.1 },
      { x: 9, color: '#ffffff', speed: -0.75, phase: 0.6 },
    ]
    for (const r of rigs) {
      const light = new THREE.SpotLight(r.color, 120, 30, 0.35, 0.6, 1.6)
      light.position.set(r.x, 11, -6)
      this.scene.add(light)
      this.scene.add(light.target)
      const beam = new THREE.Mesh(
        beamGeo,
        this.own(
          new THREE.MeshBasicMaterial({
            color: r.color,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        ),
      )
      beam.position.copy(light.position)
      this.scene.add(beam)
      this.spots.push({ light, beam, x: r.x, speed: r.speed, phase: r.phase })
    }
  }

  private buildCrowd(): void {
    const r = rng(2001)
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]

    const box = this.own(new THREE.BoxGeometry(1, 1, 1))
    const sphere = this.own(new THREE.SphereGeometry(0.5, 14, 10))
    const halfSphere = this.own(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2))
    const cyl = this.own(new THREE.CylinderGeometry(0.5, 0.5, 1, 12))
    const torus = this.own(new THREE.TorusGeometry(0.13, 0.018, 6, 16))

    const mats = new Map<string, THREE.Material>()
    const mat = (key: string, make: () => THREE.Material) => {
      let m = mats.get(key)
      if (!m) {
        m = this.own(make())
        mats.set(key, m)
      }
      return m
    }
    const color = (c: string) => mat(c, () => new THREE.MeshToonMaterial({ color: c }))
    const topMat = (t: Exclude<Top, 'bare'>) =>
      mat(`top:${t}`, () => new THREE.MeshToonMaterial({ map: this.own(TOP_TEXTURES[t]()) }))
    const gold = mat('gold', () => new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.9, roughness: 0.25 }))
    const screen = mat('screen', () => new THREE.MeshBasicMaterial({ color: '#cfe8ff' }))
    const flagMat = mat(
      'flag',
      () => new THREE.MeshToonMaterial({ map: this.own(ARG_FLAG()), side: THREE.DoubleSide }),
    )

    const part = (geo: THREE.BufferGeometry, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m)
      mesh.scale.set(sx, sy, sz)
      mesh.position.set(x, y, z)
      return mesh
    }

    // A handful of the player's hinchada, all turned to face the stage
    const spots: { x: number; z: number; top: Top; hat: Hat; pose: Pose }[] = [
      { x: -4.7, z: -2.6, top: 'argentina', hat: 'capBack', pose: 'bothUp' },
      { x: -7.2, z: -5, top: 'bare', hat: 'shaved', pose: 'shirt' },
      { x: -5.5, z: -8, top: 'boca', hat: 'bucket', pose: 'pump' },
      { x: 4.7, z: -2.8, top: 'tracksuit', hat: 'cap', pose: 'pump' },
      { x: 7.1, z: -5.2, top: 'crop', hat: 'long', pose: 'clap' },
      { x: 5.6, z: -8.2, top: 'river', hat: 'short', pose: 'flag' },
    ]
    for (const spot of spots) {
      const skin = color(pick(SKIN))
      const { x, z, top, hat, pose } = spot
      const scale = 0.92 + r() * 0.18

      const root = new THREE.Group()
      root.position.set(x, 0, z)
      root.rotation.y = Math.atan2(-x, 5 - z)
      root.scale.setScalar(scale)
      const body = new THREE.Group()
      root.add(body)

      // Legs: tracksuit bottoms, jeans or football shorts
      const pants = pick(['#121218', '#1b2a5a', '#2b3d78', 'shorts'])
      for (const s of [-1, 1]) {
        if (pants === 'shorts') {
          body.add(part(box, color('#111'), 0.2, 0.32, 0.22, s * 0.12, 0.74, 0))
          body.add(part(box, skin, 0.14, 0.5, 0.16, s * 0.12, 0.34, 0))
        } else {
          body.add(part(box, color(pants), 0.18, 0.82, 0.2, s * 0.12, 0.5, 0))
        }
        body.add(part(box, color('#f2f2f2'), 0.2, 0.12, 0.32, s * 0.12, 0.06, 0.05))
      }

      // Torso
      const torsoMat = top === 'bare' ? skin : topMat(top)
      body.add(part(box, torsoMat, 0.52, 0.62, 0.28, 0, 1.2, 0))
      if (top === 'crop') body.add(part(box, skin, 0.46, 0.14, 0.24, 0, 0.88, 0))
      if (r() < 0.45) {
        const chain = new THREE.Mesh(torus, gold)
        chain.position.set(0, 1.42, 0.13)
        chain.rotation.x = 0.4
        body.add(chain)
      }

      // Head and hair or hat
      const head = new THREE.Group()
      head.position.set(0, 1.68, 0)
      body.add(head)
      head.add(part(sphere, skin, 0.34, 0.4, 0.34, 0, 0, 0))
      if (r() < 0.4) {
        // Wraparound sunglasses
        head.add(part(box, color('#050505'), 0.3, 0.07, 0.06, 0, 0.03, 0.16))
      }
      const hair = color(pick(HAIR))
      switch (hat) {
        case 'cap':
        case 'capBack': {
          const capMat = color(pick(['#ffffff', '#111111', '#d4001c', '#0b2a6f', '#f5c400']))
          head.add(part(halfSphere, capMat, 0.36, 0.3, 0.36, 0, 0.05, 0))
          const visor = part(box, capMat, 0.26, 0.03, 0.2, 0, 0.06, hat === 'cap' ? 0.24 : -0.24)
          head.add(visor)
          break
        }
        case 'bucket': {
          const m = color(pick(['#f2f2f2', '#111111', '#e4002b', '#75aadb']))
          head.add(part(cyl, m, 0.34, 0.16, 0.34, 0, 0.13, 0))
          head.add(part(cyl, m, 0.52, 0.03, 0.52, 0, 0.06, 0))
          break
        }
        case 'short':
          head.add(part(halfSphere, hair, 0.36, 0.28, 0.36, 0, 0.04, -0.01))
          break
        case 'long':
          head.add(part(halfSphere, hair, 0.37, 0.3, 0.37, 0, 0.04, 0))
          head.add(part(box, hair, 0.34, 0.5, 0.12, 0, -0.18, -0.13))
          break
        default:
          head.add(part(halfSphere, hair, 0.345, 0.12, 0.345, 0, 0.1, 0))
      }

      // Arms pivot at the shoulder and hang down by default
      const sleeve = top === 'tracksuit' ? topMat('tracksuit') : top === 'argentina' || top === 'boca' || top === 'river' || top === 'tee' ? torsoMat : null
      const arm = (side: -1 | 1) => {
        const g = new THREE.Group()
        g.position.set(side * 0.32, 1.46, 0)
        if (sleeve) g.add(part(box, sleeve, 0.15, 0.24, 0.16, 0, -0.12, 0))
        g.add(part(box, skin, 0.12, sleeve ? 0.38 : 0.6, 0.13, 0, sleeve ? -0.42 : -0.3, 0))
        g.add(part(sphere, skin, 0.13, 0.13, 0.13, 0, -0.64, 0))
        body.add(g)
        return g
      }
      const armL = arm(-1)
      const armR = arm(1)

      // Props in the right hand
      let prop: THREE.Object3D | null = null
      if (pose === 'shirt') {
        const pivot = new THREE.Group()
        pivot.position.set(0, -0.66, 0)
        const shirt = part(box, topMat(pick(['argentina', 'boca', 'river', 'tee'] as const)), 0.5, 0.04, 0.32, 0.3, 0, 0)
        pivot.add(shirt)
        armR.add(pivot)
        prop = pivot
      } else if (pose === 'flag') {
        const pivot = new THREE.Group()
        pivot.position.set(0, -0.66, 0)
        pivot.add(part(cyl, color('#d9d2c0'), 0.03, 1.4, 0.03, 0, -0.3, 0))
        const cloth = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.9, 0.6)), flagMat)
        cloth.position.set(0.46, -0.72, 0)
        pivot.add(cloth)
        armR.add(pivot)
        prop = cloth
      } else if (pose === 'phone') {
        const phone = part(box, color('#111'), 0.09, 0.16, 0.02, 0, -0.7, 0.06)
        phone.add(part(box, screen, 0.8, 0.85, 1.2, 0, 0, 0.3))
        armR.add(phone)
      }

      this.scene.add(root)
      this.fans.push({
        root,
        body,
        head,
        armL,
        armR,
        prop,
        pose,
        phase: r() * 0.3,
        offbeat: r() < 0.2,
        baseY: 0,
      })
    }
  }

  private size = { w: 0, h: 0 }

  resize(w: number, h: number): void {
    if (w === this.size.w && h === this.size.h) return
    this.size = { w, h }
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
  }

  render(s: CrowdState): void {
    const energy = s.saborActive ? 1.25 : 0.35 + Math.min(1, s.combo / 40) * 0.65
    const frac = ((s.beat % 1) + 1) % 1
    const pulse = Math.pow(1 - frac, 3)

    for (const f of this.fans) {
      const b = s.beat + f.phase + (f.offbeat ? 0.5 : 0)
      const bounce = Math.abs(Math.sin(Math.PI * b))
      f.root.position.y = f.baseY + bounce * 0.38 * energy
      f.body.rotation.z = Math.sin(Math.PI * b) * 0.06 * energy
      f.head.rotation.x = -0.1 + bounce * 0.15
      const up = 0.85 + 0.15 * Math.min(1, energy)
      const wave = Math.sin(Math.PI * b)
      f.armL.rotation.set(0, 0, 0)
      f.armR.rotation.set(0, 0, 0)
      switch (f.pose) {
        case 'bothUp':
          f.armL.rotation.z = -(2.7 + wave * 0.15) * up
          f.armR.rotation.z = (2.7 - wave * 0.15) * up
          break
        case 'wave':
          f.armL.rotation.z = -0.15
          f.armR.rotation.z = (2.6 + wave * 0.4) * up
          break
        case 'pump':
          f.armL.rotation.z = -0.2
          f.armR.rotation.z = 0.15
          f.armR.rotation.x = -(1.6 + bounce * 1.3) * up
          break
        case 'clap': {
          const open = (1 - bounce) * 0.5
          f.armL.rotation.x = -2.6 * up
          f.armR.rotation.x = -2.6 * up
          f.armL.rotation.z = -open
          f.armR.rotation.z = open
          break
        }
        case 'shirt':
          f.armL.rotation.z = -0.25
          f.armR.rotation.z = 2.95 * up
          if (f.prop) f.prop.rotation.y = s.time * 9 * (0.6 + energy * 0.5)
          break
        case 'flag':
          f.armL.rotation.z = -0.2
          f.armR.rotation.z = (2.5 + wave * 0.35) * up
          if (f.prop) f.prop.rotation.y = Math.sin(s.time * 6) * 0.5
          break
        case 'phone':
          f.armL.rotation.z = -0.15
          f.armR.rotation.x = -2.4
          f.armR.rotation.z = 0.2
          break
      }
    }

    for (const sp of this.spots) {
      const a = Math.sin(s.time * sp.speed + sp.phase) * 0.6
      const tx = sp.x + Math.sin(a) * 10
      sp.light.target.position.set(tx, 0, -9 + Math.cos(s.time * sp.speed * 0.7) * 4)
      sp.light.intensity = (70 + pulse * 120) * energy
      sp.beam.lookAt(sp.light.target.position)
      sp.beam.rotateX(-Math.PI / 2)
      ;(sp.beam.material as THREE.MeshBasicMaterial).opacity = 0.04 + pulse * 0.06 * energy
    }
    this.sun.rotation.z = s.time * 0.08
    this.sun.scale.setScalar(1 + pulse * 0.04 * energy)

    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
  }
}
