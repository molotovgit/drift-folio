import type RAPIER from '@dimforge/rapier3d-compat'
import type * as THREE from 'three/webgpu'
import type { CardPanel } from '../ui/card'
import type { Hud } from '../ui/hud'
import type { TouchControls } from '../ui/touch'
import { skipOverlay } from '../ui/skip'
import type { SafeStorage } from '../util/storage'
import type { Telemetry } from '../vehicle/driftCar'
import { BaseTown } from '../world/baseTown'
import { Breakables } from '../world/breakables'
import type { MountainWorld } from '../world/mountainWorld'
import { ProjectCorners } from '../world/projectCorners'
import { Shortcuts } from '../world/shortcuts'
import { SHORTCUT_NAMES, ShortcutDiscovery } from './discovery'
import { GhostLap } from './ghostLap'
import { formatTime, type DriftSession } from './session'

/** What the features need from the game. */
export interface FeatureHost {
  scene: THREE.Scene
  world: RAPIER.World
  mountain: MountainWorld
  storage: SafeStorage
  hud: Hud
  cards: CardPanel
  session: DriftSession
  /** on-screen controls on touch screens (null on desktop) */
  touch: TouchControls | null
  /** repaint the player's car (secret livery) */
  setPaint(hex: string): void
}

/**
 * Everything on the mountain besides the roads themselves (M5–M7): project
 * corners, the base town, the six shortcuts and their discovery, the ghost lap
 * and the breakable props. Turns their events into HUD hints and card opens.
 */
export class MountainFeatures {
  readonly corners: ProjectCorners
  readonly town: BaseTown
  readonly shortcuts: Shortcuts
  readonly discovery: ShortcutDiscovery
  readonly ghost: GhostLap
  private readonly breakables: Breakables
  /** link of the town pad the car is parked on (Enter opens it) */
  private padUrl: string | null = null
  private inDirtValue = false

  constructor(private readonly host: FeatureHost) {
    const { scene, world, mountain, storage } = host
    this.corners = new ProjectCorners(scene, mountain.roads)
    this.town = new BaseTown(scene, world, storage)
    this.shortcuts = new Shortcuts(scene, world, mountain.roads)
    this.discovery = new ShortcutDiscovery(storage)
    this.ghost = new GhostLap(scene, storage)
    this.breakables = new Breakables(scene, world, mountain.roads, (x, z) => mountain.heightAt(x, z))
    host.session.runListener = {
      start: (route) => route === 'systems' && this.ghost.start(),
      finish: (route, time) => (route === 'systems' ? this.onSystemsFinish(time) : this.ghost.cancel()),
      abandon: () => this.ghost.cancel(),
    }
    // opening a link needs a real key press (popup blockers), so pads ask for Enter
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.repeat || !this.padUrl || skipOverlay.isOpen) return
      // Enter on a focused button or link (a card's "go", the skip link) belongs to that control
      if (e.target instanceof Element && e.target.closest('a, button, input, textarea, select')) return
      window.open(this.padUrl, '_blank', 'noopener')
    })
  }

  /** Off-road driving is allowed right now (inside a dirt shortcut). */
  get inDirt(): boolean {
    return this.inDirtValue
  }

  get currentPadUrl(): string | null {
    return this.padUrl
  }

  /** Load every feature's props; restore found shortcuts and an earlier ghost win. */
  async build(): Promise<void> {
    const ground = (x: number, z: number) => this.host.mountain.heightAt(x, z)
    await Promise.all([this.corners.build(ground), this.town.build(), this.shortcuts.build(), this.ghost.load(), this.breakables.build()])
    for (const id of this.discovery.all()) this.town.lightLantern(ShortcutDiscovery.lanternOf(id))
    if (this.ghost.beaten) this.shortcuts.openPeak()
  }

  /** Fixed physics tick. */
  tick(h: number): void {
    this.ghost.tick(h)
  }

  /** Per rendered frame (not while paused). */
  update(t: Telemetry, dt: number, now: number): void {
    this.updateShortcuts(t, dt, now)
    if (this.breakables.update().macMiniHit) this.host.hud.hint('commit by Mac Mini 5')
    this.updateTown(t, now)
    const corner = this.corners.update(t)
    if (corner.opened) this.host.cards.show(corner.opened)
    else if (corner.hinted) this.host.hud.hint('Drift this corner to open the card')
  }

  /** Shortcut events → discovery, lanterns, HUD, the secret car. */
  private updateShortcuts(t: Telemetry, dt: number, now: number): void {
    const ev = this.shortcuts.update(t, dt, now)
    this.inDirtValue = ev.inDirt
    if (ev.found && this.discovery.discover(ev.found)) {
      this.town.lightLantern(ShortcutDiscovery.lanternOf(ev.found))
      this.host.hud.hint(`Shortcut found: ${SHORTCUT_NAMES[ev.found]} (${this.discovery.count}/6)`)
    }
    if (ev.secretCar) {
      this.host.setPaint('#ffc04d')
      this.host.hud.hint('Secret livery unlocked')
    }
  }

  /** Town events → HUD (pads, lots, gymkhana). */
  private updateTown(t: Telemetry, now: number): void {
    const ev = this.town.update(t.pos, now)
    const url = ev.pad?.url ?? null
    if (url !== this.padUrl) {
      if (ev.pad) this.host.hud.hint(this.host.touch ? `Tap OPEN for ${ev.pad.label} ↗` : `Press Enter to open ${ev.pad.label} ↗`)
      this.host.touch?.setLink(ev.pad)
    }
    this.padUrl = url
    if (ev.enteredLot) this.host.hud.routeBanner(ev.enteredLot === 'plaza' ? 'PIT GARAGE' : ev.enteredLot.toUpperCase())
    const g = ev.gymkhana
    if (g?.type === 'start') this.host.hud.hint('Gymkhana: go!')
    else if (g?.type === 'cone') this.host.hud.hint(`Cone +${g.penalty} s`)
    else if (g?.type === 'finish') this.host.hud.hint(`Gymkhana ${formatTime(g.time)}${g.best ? ' · new best' : ''}`)
    else if (g?.type === 'abort') this.host.hud.hint('Gymkhana aborted: you left the course')
  }

  /** A Systems Drop run ended: did it beat the ghost? */
  private onSystemsFinish(time: number): void {
    if (!this.ghost.finish(time)) return
    this.shortcuts.openPeak()
    this.host.hud.routeBanner('GHOST BEATEN')
    this.host.hud.hint('The trail behind the summit torii is open')
  }
}
