/**
 * The keyboard-battle room in 3D, modelled on the Mundial de los Tecladistas
 * clips: a bright clubhouse with a wooden ceiling and fluorescent tubes,
 * fake-grass floor, a painted crew logo on the wall, a gold trophy on a
 * plinth, and a tight knot of hinchas behind the player in black tees,
 * hoodies, caps and Argentina shirts, waving flags and inflatable batons and
 * jumping on the beat. Rendered with three.js on its own canvas behind the
 * highway.
 */
import * as THREE from 'three'
import type { CrowdState } from './crowd'

const SKIN = ['#f1c9a5', '#dcab82', '#c08a5e', '#9a6744', '#7a4f31']
const HAIR = ['#120c08', '#1e130b', '#3a2414', '#d9c08a']
const CELESTE = '#75aadb'

type Pose = 'bothUp' | 'pump' | 'clap' | 'batons' | 'flag' | 'phone' | 'shirt' | 'point'
type Top = 'black' | 'hoodie' | 'argentina' | 'white' | 'bare'
type Hat = 'cap' | 'capBack' | 'galera' | 'short' | 'shaved'

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

const TOP_TEXTURES: Record<Exclude<Top, 'bare'>, () => THREE.Texture> = {
  // Crew merch: black tee with a small white chest print
  black: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#141414'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#e8e8e8'
      g.font = 'bold 9px Impact, sans-serif'
      g.textAlign = 'center'
      g.fillText('★ ★ ★', 32, 18)
      g.fillText('SIN FRENO', 32, 28)
    }),
  hoodie: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#1b1b1d'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#d0d0d0'
      g.fillRect(20, 14, 6, 14)
      g.fillRect(30, 14, 6, 14)
      g.fillStyle = '#111'
      g.fillRect(12, 44, 40, 12)
    }),
  argentina: () =>
    canvasTexture(64, 64, (g) => {
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : CELESTE
        g.fillRect(i * 12.8, 0, 12.8, 64)
      }
      g.fillStyle = '#1a2a5a'
      g.fillRect(40, 10, 8, 8)
    }),
  white: () =>
    canvasTexture(64, 64, (g) => {
      g.fillStyle = '#f2f2f2'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#111'
      g.font = 'bold 10px Impact, sans-serif'
      g.textAlign = 'center'
      g.fillText('CUMBIA', 32, 26)
    }),
}

const ARG_FLAG = () =>
  canvasTexture(96, 64, (g) => {
    g.fillStyle = CELESTE
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
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 60)
  private readonly fans: Fan[] = []
  private readonly tubes: THREE.MeshBasicMaterial
  private readonly fill: THREE.HemisphereLight
  private readonly ceilingFlags: THREE.Mesh[] = []
  private readonly disposables: { dispose(): void }[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.scene.background = new THREE.Color('#d8d4cc')
    // Phone-camera point of view from just behind the player's keyboard
    this.camera.position.set(0, 1.8, 4.2)
    this.camera.lookAt(0, 1.25, -6)

    this.fill = new THREE.HemisphereLight('#fff8ec', '#4a5a3a', 1.6)
    this.scene.add(this.fill)
    const key = new THREE.DirectionalLight('#ffffff', 1.3)
    key.position.set(1, 5, 6)
    this.scene.add(key)

    this.tubes = this.own(new THREE.MeshBasicMaterial({ color: '#ffffff' }))
    this.buildRoom()
    this.buildTrophy()
    this.buildCrowd()
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x)
    return x
  }

  private plane(w: number, h: number, material: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), material)
    this.scene.add(m)
    return m
  }

  private buildRoom(): void {
    const W = 20
    const H = 3.3
    const BACK = -9

    // Fake-grass floor
    const turf = this.own(
      canvasTexture(256, 256, (g) => {
        g.fillStyle = '#3f7a35'
        g.fillRect(0, 0, 256, 256)
        const r = rng(9)
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(90,150,70,0.6)' : 'rgba(30,70,30,0.6)'
          g.fillRect(r() * 256, r() * 256, 1.5, 4)
        }
      }),
    )
    turf.wrapS = turf.wrapT = THREE.RepeatWrapping
    turf.repeat.set(6, 6)
    const floor = this.plane(W, 16, this.own(new THREE.MeshLambertMaterial({ map: turf })))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0, -2)

    // White painted back wall with the crew's logo
    const wallTex = this.own(
      canvasTexture(1024, 256, (g) => {
        g.fillStyle = '#ecebe6'
        g.fillRect(0, 0, 1024, 256)
        g.fillStyle = '#151515'
        g.font = 'bold 30px Impact, sans-serif'
        g.textAlign = 'center'
        g.fillText('★   ★   ★', 512, 70)
        g.font = "bold 92px 'Black Ops One', Impact, sans-serif"
        g.fillText('CUMBIA HERO', 512, 160)
        g.lineWidth = 6
        g.strokeStyle = '#151515'
        g.beginPath()
        g.ellipse(512, 130, 330, 100, 0, Math.PI * 1.08, Math.PI * 1.92)
        g.stroke()
      }),
    )
    void document.fonts?.ready.then(() => {
      const g = (wallTex.image as HTMLCanvasElement).getContext('2d')
      if (!g) return
      g.fillStyle = '#ecebe6'
      g.fillRect(200, 95, 624, 90)
      g.fillStyle = '#151515'
      g.font = "bold 92px 'Black Ops One', Impact, sans-serif"
      g.textAlign = 'center'
      g.fillText('CUMBIA HERO', 512, 160)
      wallTex.needsUpdate = true
    })
    const back = this.plane(W, H, this.own(new THREE.MeshLambertMaterial({ map: wallTex })))
    back.position.set(0, H / 2, BACK)

    const sideMat = this.own(new THREE.MeshLambertMaterial({ color: '#e2e0da' }))
    for (const s of [-1, 1]) {
      const side = this.plane(16, H, sideMat)
      side.rotation.y = -s * (Math.PI / 2)
      side.position.set(s * (W / 2), H / 2, -1)
    }

    // Wooden plank ceiling with strip lights
    const wood = this.own(
      canvasTexture(256, 256, (g) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? '#8a5a32' : '#9c6a3c'
          g.fillRect(0, i * 32, 256, 32)
          g.fillStyle = 'rgba(40,20,5,0.5)'
          g.fillRect(0, i * 32, 256, 2)
        }
      }),
    )
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping
    wood.repeat.set(1, 4)
    const ceiling = this.plane(W, 16, this.own(new THREE.MeshLambertMaterial({ map: wood, side: THREE.DoubleSide, emissive: '#5a3818', emissiveMap: wood })))
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(0, H, -1)
    const tubeGeo = this.own(new THREE.BoxGeometry(2.4, 0.06, 0.14))
    for (const z of [-1, -4, -7]) {
      for (const x of [-3.5, 3.5]) {
        const tube = new THREE.Mesh(tubeGeo, this.tubes)
        tube.position.set(x, H - 0.05, z)
        this.scene.add(tube)
      }
    }

    // Argentine flags hung from the ceiling over the crowd
    const flagMat = this.own(
      new THREE.MeshLambertMaterial({ map: this.own(ARG_FLAG()), side: THREE.DoubleSide }),
    )
    for (const [x, z] of [
      [-5.5, -8.4],
      [5.2, -8.4],
      [-1.4, -8.7],
    ]) {
      const f = this.plane(1.6, 1, flagMat)
      f.position.set(x, H - 0.55, z)
      f.rotation.y = x * -0.08
      this.ceilingFlags.push(f)
    }
  }

  /** Gold keyboard trophy on a white plinth, like the one the finalists play beside. */
  private buildTrophy(): void {
    const gold = this.own(new THREE.MeshPhongMaterial({ color: '#f2c14e', emissive: '#7a5200', specular: '#fff4c0', shininess: 80 }))
    const white = this.own(new THREE.MeshLambertMaterial({ color: '#f4f4f2' }))
    const keys = this.own(
      new THREE.MeshLambertMaterial({
        map: this.own(
          canvasTexture(128, 32, (g) => {
            g.fillStyle = '#fff'
            g.fillRect(0, 0, 128, 32)
            g.fillStyle = '#111'
            for (let i = 0; i < 16; i++) if (i % 7 !== 2 && i % 7 !== 6) g.fillRect(i * 8 + 5, 0, 5, 20)
          }),
        ),
      }),
    )
    const box = this.own(new THREE.BoxGeometry(1, 1, 1))
    const t = new THREE.Group()
    const add = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number) => {
      const mesh = new THREE.Mesh(box, m)
      mesh.scale.set(sx, sy, sz)
      mesh.position.set(x, y, 0)
      t.add(mesh)
      return mesh
    }
    add(white, 0.6, 1.0, 0.6, 0, 0.5)
    add(gold, 0.42, 0.12, 0.3, 0, 1.06)
    add(gold, 0.1, 0.35, 0.1, 0, 1.28)
    add(gold, 0.62, 0.12, 0.2, 0, 1.5)
    const k = add(keys, 0.56, 0.02, 0.14, 0, 1.565)
    k.rotation.x = -0.2
    t.position.set(-2.9, 0, -0.6)
    t.rotation.y = 0.35
    this.scene.add(t)
  }

  private buildCrowd(): void {
    const r = rng(2026)
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]

    const box = this.own(new THREE.BoxGeometry(1, 1, 1))
    const sphere = this.own(new THREE.SphereGeometry(0.5, 14, 10))
    const halfSphere = this.own(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2))
    const cyl = this.own(new THREE.CylinderGeometry(0.5, 0.5, 1, 12))

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
    const screen = mat('screen', () => new THREE.MeshBasicMaterial({ color: '#cfe8ff' }))
    const flagMat = mat('flag', () => new THREE.MeshToonMaterial({ map: this.own(ARG_FLAG()), side: THREE.DoubleSide }))
    const galeraMat = mat(
      'galera',
      () =>
        new THREE.MeshToonMaterial({
          map: this.own(
            canvasTexture(64, 64, (g) => {
              for (let i = 0; i < 8; i++) {
                g.fillStyle = i % 2 ? '#ffffff' : CELESTE
                g.fillRect(i * 8, 0, 8, 64)
              }
            }),
          ),
        }),
    )

    const part = (
      geo: THREE.BufferGeometry,
      m: THREE.Material,
      sx: number,
      sy: number,
      sz: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new THREE.Mesh(geo, m)
      mesh.scale.set(sx, sy, sz)
      mesh.position.set(x, y, z)
      return mesh
    }

    // A tight knot of hinchas either side behind the player, two deep
    const spots: { x: number; z: number; top: Top; hat: Hat; pose: Pose }[] = [
      { x: -3.9, z: -3.6, top: 'black', hat: 'capBack', pose: 'point' },
      { x: -4.6, z: -4.1, top: 'argentina', hat: 'galera', pose: 'batons' },
      { x: -5.3, z: -3.8, top: 'hoodie', hat: 'cap', pose: 'clap' },
      { x: -6.0, z: -4.3, top: 'black', hat: 'short', pose: 'bothUp' },
      { x: -4.3, z: -5.0, top: 'white', hat: 'cap', pose: 'phone' },
      { x: -5.0, z: -5.3, top: 'bare', hat: 'shaved', pose: 'shirt' },
      { x: -5.8, z: -5.2, top: 'argentina', hat: 'short', pose: 'flag' },
      { x: 3.9, z: -3.7, top: 'hoodie', hat: 'capBack', pose: 'pump' },
      { x: 4.6, z: -4.1, top: 'black', hat: 'cap', pose: 'bothUp' },
      { x: 5.3, z: -3.8, top: 'argentina', hat: 'galera', pose: 'batons' },
      { x: 6.0, z: -4.3, top: 'black', hat: 'shaved', pose: 'clap' },
      { x: 4.3, z: -5.1, top: 'black', hat: 'short', pose: 'phone' },
      { x: 5.0, z: -5.3, top: 'argentina', hat: 'capBack', pose: 'flag' },
      { x: 5.8, z: -5.0, top: 'white', hat: 'cap', pose: 'pump' },
    ]
    for (const spot of spots) {
      const { x, z, top, hat, pose } = spot
      const skin = color(pick(SKIN))
      const root = new THREE.Group()
      root.position.set(x, 0, z)
      root.rotation.y = Math.atan2(-x, this.camera.position.z - z)
      root.scale.setScalar(0.94 + r() * 0.14)
      const body = new THREE.Group()
      root.add(body)

      // Legs: track pants, jeans or shorts, white sneakers
      const pants = pick(['#121214', '#1b2a5a', '#3a3a40', 'shorts'])
      for (const s of [-1, 1]) {
        if (pants === 'shorts') {
          body.add(part(box, color('#151515'), 0.2, 0.32, 0.22, s * 0.12, 0.74, 0))
          body.add(part(box, skin, 0.14, 0.5, 0.16, s * 0.12, 0.34, 0))
        } else {
          body.add(part(box, color(pants), 0.18, 0.82, 0.2, s * 0.12, 0.5, 0))
        }
        body.add(part(box, color('#f2f2f2'), 0.2, 0.12, 0.32, s * 0.12, 0.06, 0.05))
      }

      // Torso, with a hood bunched at the back for hoodies
      const torsoMat = top === 'bare' ? skin : topMat(top)
      body.add(part(box, torsoMat, 0.54, 0.64, 0.3, 0, 1.2, 0))
      if (top === 'hoodie') body.add(part(box, color('#1b1b1d'), 0.36, 0.16, 0.14, 0, 1.5, -0.14))

      // Head and hair or hat
      const head = new THREE.Group()
      head.position.set(0, 1.7, 0)
      body.add(head)
      head.add(part(sphere, skin, 0.34, 0.4, 0.34, 0, 0, 0))
      // Open mouth, mid-chant
      head.add(part(box, color('#3a1010'), 0.08, 0.06, 0.02, 0, -0.1, 0.165))
      if (top === 'argentina' && r() < 0.5) {
        // Celeste and white face paint stripes
        head.add(part(box, color(CELESTE), 0.03, 0.12, 0.02, -0.09, 0.02, 0.155))
        head.add(part(box, color('#ffffff'), 0.03, 0.12, 0.02, 0.09, 0.02, 0.155))
      }
      const hair = color(pick(HAIR))
      switch (hat) {
        case 'cap':
        case 'capBack': {
          const capMat = color(pick(['#111111', '#111111', '#ffffff', '#1b2a5a']))
          head.add(part(halfSphere, capMat, 0.36, 0.3, 0.36, 0, 0.05, 0))
          head.add(part(box, capMat, 0.26, 0.03, 0.2, 0, 0.06, hat === 'cap' ? 0.24 : -0.24))
          break
        }
        case 'galera':
          // Tall striped felt top hat from the stands
          head.add(part(cyl, galeraMat, 0.3, 0.42, 0.3, 0, 0.32, 0))
          head.add(part(cyl, color(CELESTE), 0.5, 0.03, 0.5, 0, 0.12, 0))
          break
        case 'short':
          head.add(part(halfSphere, hair, 0.36, 0.28, 0.36, 0, 0.04, -0.01))
          break
        default:
          head.add(part(halfSphere, hair, 0.345, 0.12, 0.345, 0, 0.1, 0))
      }

      // Arms pivot at the shoulder and hang down by default
      const sleeve = top === 'bare' ? null : torsoMat
      const longSleeve = top === 'hoodie'
      const arm = (side: -1 | 1) => {
        const g = new THREE.Group()
        g.position.set(side * 0.33, 1.47, 0)
        if (sleeve) g.add(part(box, sleeve, 0.15, longSleeve ? 0.58 : 0.24, 0.16, 0, longSleeve ? -0.29 : -0.12, 0))
        if (!longSleeve) g.add(part(box, skin, 0.12, sleeve ? 0.38 : 0.6, 0.13, 0, sleeve ? -0.42 : -0.3, 0))
        g.add(part(sphere, skin, 0.13, 0.13, 0.13, 0, -0.64, 0))
        body.add(g)
        return g
      }
      const armL = arm(-1)
      const armR = arm(1)

      // Props
      let prop: THREE.Object3D | null = null
      if (pose === 'shirt') {
        const pivot = new THREE.Group()
        pivot.position.set(0, -0.66, 0)
        pivot.add(part(box, topMat('argentina'), 0.5, 0.04, 0.32, 0.3, 0, 0))
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
      } else if (pose === 'batons') {
        // Inflatable aplaudidores, one in each hand
        for (const a of [armL, armR]) a.add(part(cyl, color(CELESTE), 0.09, 0.8, 0.09, 0, -0.95, 0))
      }

      this.scene.add(root)
      this.fans.push({ root, body, head, armL, armR, prop, pose, phase: r() * 0.25, offbeat: r() < 0.2 })
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
      const wave = Math.sin(Math.PI * b)
      f.root.position.y = bounce * 0.32 * energy
      f.body.rotation.z = wave * 0.05 * energy
      f.head.rotation.x = -0.12 + bounce * 0.15
      const up = 0.85 + 0.15 * Math.min(1, energy)
      f.armL.rotation.set(0, 0, 0)
      f.armR.rotation.set(0, 0, 0)
      switch (f.pose) {
        case 'bothUp':
          f.armL.rotation.z = -(2.7 + wave * 0.15) * up
          f.armR.rotation.z = (2.7 - wave * 0.15) * up
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
        case 'batons': {
          // Bang the batons together overhead on the beat
          const open = (1 - bounce) * 0.6
          f.armL.rotation.z = -(2.4 - open) * up
          f.armR.rotation.z = (2.4 - open) * up
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
        case 'point':
          // Pointing straight at the player, jabbing on the beat
          f.armL.rotation.z = -(2.5 + wave * 0.2) * up
          f.armR.rotation.x = -(1.45 + bounce * 0.25)
          break
      }
    }

    for (const [i, f] of this.ceilingFlags.entries()) f.rotation.x = Math.sin(s.time * 1.4 + i) * 0.08
    this.fill.intensity = 1.5 + pulse * 0.25 * energy
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
  }
}
