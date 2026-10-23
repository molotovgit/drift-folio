import type * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { toonify } from './toon'

const loader = new GLTFLoader()
const pending = new Map<string, Promise<THREE.Group>>()

/** Base URL for runtime assets; relative so it works under /drift-folio/ and at the domain root. */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`.replace(/^\.\//, './')

/** Load a model from public/models once; returns the toonified template (clone it to place copies). */
export function loadModel(name: string, onProgress?: (loaded: number) => void): Promise<THREE.Group> {
  let p = pending.get(name)
  if (!p) {
    p = loader
      .loadAsync(assetUrl(`models/${name}.glb`), (e) => onProgress?.(e.loaded))
      .then((gltf) => toonify(gltf.scene) as THREE.Group)
    pending.set(name, p)
  }
  return p
}
