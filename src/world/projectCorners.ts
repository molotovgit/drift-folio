import * as THREE from 'three/webgpu'
import { projects, routeNames, type CardId, type ProjectCard } from '../content/projects'
import { ApexTriggers, type ApexResult } from '../game/triggers'
import { ModelLibrary } from '../render/loadModel'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import type { Telemetry } from '../vehicle/driftCar'
import { APEX_RADIUS, cornerSpots, type CornerSpot } from './cornerLayout'
import type { RoadNetwork } from './roadNetwork'

const PANEL_W = 1024
const PANEL_H = 614
const DISPLAY_FONT = '"Barlow Condensed", "Arial Narrow", sans-serif'

/**
 * The nine project corners (M5): a billboard per card beside its bend, a cone
 * at the clipping point, and apex triggers. Drifting through the apex opens the
 * card; passing it straight hints "drift this corner".
 */
export class ProjectCorners {
  readonly spots: CornerSpot[]
  private readonly triggers: ApexTriggers
  private readonly panels = new Map<CardId, THREE.MeshToonNodeMaterial>()

  constructor(
    private readonly scene: THREE.Scene,
    roads: RoadNetwork,
  ) {
    this.spots = cornerSpots(roads)
    this.triggers = new ApexTriggers(this.spots.map((s) => ({ id: s.id, pos: s.clip, radius: APEX_RADIUS })))
  }

  /** Load the billboard and cone models and dress every corner. */
  async build(groundAt: (x: number, z: number) => number): Promise<void> {
    await document.fonts?.load(`italic 800 64px ${DISPLAY_FONT}`).catch(() => undefined)
    const [board, cone] = await Promise.all([ModelLibrary.load('billboard'), ModelLibrary.load('cone')])
    for (const s of this.spots) {
      const card = projects.find((p) => p.id === s.id)!
      const b = board.clone(true)
      b.position.set(s.board.x, Math.min(s.board.y, groundAt(s.board.x, s.board.z)), s.board.z)
      b.rotation.y = s.boardYaw
      const panelMat = ToonMaterials.create({ color: '#ffffff', map: ProjectCorners.panelTexture(card), flatShading: false, bands: 2 })
      panelMat.emissive = new THREE.Color('#ffffff')
      panelMat.emissiveIntensity = 0.15
      b.traverse((o) => {
        if (o.name === 'panel' && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = panelMat
      })
      this.panels.set(s.id, panelMat)
      const c = cone.clone(true)
      c.position.set(s.clip.x, s.clip.y, s.clip.z)
      this.scene.add(b, c)
    }
  }

  /** Per frame: returns which card opened or should be hinted. */
  update(t: Pick<Telemetry, 'pos' | 'drifting'>): ApexResult {
    const r = this.triggers.update(t)
    if (r.opened) this.highlight(r.opened)
    return r
  }

  /** Light up a billboard once its card has been opened. */
  private highlight(id: CardId): void {
    const m = this.panels.get(id)
    if (m) m.emissiveIntensity = 0.9
  }

  /** Billboard face: route label, title, stack chips and how to open it. */
  static panelTexture(card: ProjectCard): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = PANEL_W
    c.height = PANEL_H
    const g = c.getContext('2d')!
    const bg = g.createLinearGradient(0, 0, 0, PANEL_H)
    bg.addColorStop(0, palette.skyTop)
    bg.addColorStop(1, palette.skyMid)
    g.fillStyle = bg
    g.fillRect(0, 0, PANEL_W, PANEL_H)
    g.strokeStyle = palette.hudAccent
    g.lineWidth = 14
    g.strokeRect(7, 7, PANEL_W - 14, PANEL_H - 14)

    g.fillStyle = palette.hudGold
    g.font = `600 40px ${DISPLAY_FONT}`
    g.fillText(`${card.id} · ${routeNames[card.route].toUpperCase()}`, 56, 92)
    g.textAlign = 'right'
    g.fillStyle = card.public ? palette.hudGold : palette.hudText
    g.fillText(card.public ? 'PUBLIC' : 'PRIVATE', PANEL_W - 56, 92)
    g.textAlign = 'left'

    g.fillStyle = palette.hudText
    ProjectCorners.fitText(g, card.title.toUpperCase(), 56, 220, PANEL_W - 112, 116, `italic 800`)

    g.font = `600 34px ${DISPLAY_FONT}`
    // chips wrap onto a second row; whatever does not fit there is left off
    let x = 56
    let y = 300
    for (const s of card.stack) {
      const w = g.measureText(s.toUpperCase()).width + 32
      if (x + w > PANEL_W - 56) {
        x = 56
        y += 66
        if (y + 52 > PANEL_H - 110) break
      }
      g.fillStyle = 'rgba(255, 92, 138, 0.28)'
      g.fillRect(x, y, w, 52)
      g.fillStyle = palette.hudText
      g.fillText(s.toUpperCase(), x + 16, y + 38)
      x += w + 14
    }

    g.fillStyle = palette.hudAccent
    g.font = `italic 700 44px ${DISPLAY_FONT}`
    g.fillText('DRIFT THE APEX TO OPEN', 56, PANEL_H - 60)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }

  /** Draw text on one line, shrinking the font until it fits maxWidth. */
  private static fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, style: string): void {
    let s = size
    do {
      g.font = `${style} ${s}px ${DISPLAY_FONT}`
      s -= 4
    } while (g.measureText(text).width > maxWidth && s > 40)
    g.fillText(text, x, y)
  }
}

/** Route names on the fork signposts (boards sign_0..2 have 0..1 UVs). */
export function signTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = palette.signGreen
  g.fillRect(0, 0, 512, 128)
  g.strokeStyle = '#f4efe6'
  g.lineWidth = 8
  g.strokeRect(6, 6, 500, 116)
  g.fillStyle = '#f4efe6'
  g.font = `italic 700 64px ${DISPLAY_FONT}`
  g.textBaseline = 'middle'
  g.fillText(label, 28, 68)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
