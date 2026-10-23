import * as THREE from 'three/webgpu'
import { about } from '../content/projects'
import { palette } from '../render/palette'

/** Canvas-painted textures for the base town (no image files needed). */
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif'

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export class TownTextures {
  /** Concrete lot with faint expansion joints. */
  static concrete(): THREE.CanvasTexture {
    return canvasTexture(256, 256, (g) => {
      g.fillStyle = '#6f6178'
      g.fillRect(0, 0, 256, 256)
      g.strokeStyle = 'rgba(30, 20, 40, 0.35)'
      g.lineWidth = 3
      g.strokeRect(1, 1, 254, 254)
    }, true)
  }

  /** Skidpad lot: concrete with a painted donut ring and centre dot (u,v 0..1 over the disc's square). */
  static skidpad(): THREE.CanvasTexture {
    return canvasTexture(1024, 1024, (g) => {
      g.fillStyle = '#6f6178'
      g.fillRect(0, 0, 1024, 1024)
      g.strokeStyle = palette.roadLine
      g.lineWidth = 18
      g.setLineDash([60, 40])
      g.beginPath()
      g.arc(512, 512, 300, 0, Math.PI * 2)
      g.stroke()
      g.setLineDash([])
      g.fillStyle = palette.hudAccent
      g.beginPath()
      g.arc(512, 512, 40, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = palette.roadLine
      g.font = `italic 800 90px ${DISPLAY}`
      g.textAlign = 'center'
      g.fillText('SKIDPAD', 512, 880)
    })
  }

  /** The pit wall inside the garage: name, handle and the README line (spec §7). */
  static pitWall(): THREE.CanvasTexture {
    return canvasTexture(1536, 640, (g) => {
      g.fillStyle = palette.skyTop
      g.fillRect(0, 0, 1536, 640)
      g.fillStyle = palette.hudAccent
      g.fillRect(0, 0, 1536, 18)
      g.fillStyle = palette.hudText
      g.font = `italic 800 190px ${DISPLAY}`
      g.fillText(about.name.toUpperCase(), 70, 230)
      g.fillStyle = palette.hudGold
      g.font = `italic 700 70px ${DISPLAY}`
      g.fillText(`@${about.handle}`, 76, 320)
      g.fillStyle = palette.hudText
      g.font = `600 50px ${DISPLAY}`
      TownTextures.wrap(g, about.line, 76, 420, 1380, 62)
    })
  }

  /** Small sign above a tyre stack. */
  static label(text: string, accent = palette.hudGold): THREE.CanvasTexture {
    return canvasTexture(512, 160, (g) => {
      g.fillStyle = palette.skyTop
      g.fillRect(0, 0, 512, 160)
      g.strokeStyle = accent
      g.lineWidth = 10
      g.strokeRect(5, 5, 502, 150)
      g.fillStyle = palette.hudText
      g.font = `italic 800 84px ${DISPLAY}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text.toUpperCase(), 256, 84)
    })
  }

  /** Drive-on link pad: gold ring with the link name. */
  static pad(text: string): THREE.CanvasTexture {
    return canvasTexture(512, 512, (g) => {
      g.fillStyle = 'rgba(0,0,0,0)'
      g.clearRect(0, 0, 512, 512)
      g.fillStyle = palette.skyTop
      g.beginPath()
      g.arc(256, 256, 250, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = palette.hudGold
      g.lineWidth = 22
      g.beginPath()
      g.arc(256, 256, 228, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = palette.hudGold
      g.font = `italic 800 96px ${DISPLAY}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text.toUpperCase(), 256, 256)
    })
  }

  private static wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
    let line = ''
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (g.measureText(next).width > maxW && line) {
        g.fillText(line, x, y)
        line = word
        y += lineH
      } else line = next
    }
    if (line) g.fillText(line, x, y)
  }
}
