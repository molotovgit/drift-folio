import type * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ToonMaterials } from './toon'

/** Base URL for runtime assets; relative so it works under /drift-folio/ and at the domain root. */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`.replace(/^\.\//, './')

/**
 * Loads models from public/models once each and toonifies them. Callers get the
 * shared template and clone it (clones share geometry, so memory stays flat).
 */
export class ModelLibrary {
  private static readonly loader = new GLTFLoader()
  private static readonly pending = new Map<string, Promise<THREE.Group>>()

  static load(name: string, onProgress?: (loadedBytes: number) => void): Promise<THREE.Group> {
    let p = this.pending.get(name)
    if (!p) {
      p = this.loader
        .loadAsync(assetUrl(`models/${name}.glb`), (e) => onProgress?.(e.loaded))
        .then((gltf) => ToonMaterials.toonify(gltf.scene) as THREE.Group)
      this.pending.set(name, p)
    }
    return p
  }
}
