import RAPIER from '@dimforge/rapier3d-compat'
import { idleControls, type ControlState } from '../../src/core/input'
import { PHYSICS_STEP } from '../../src/core/loop'
import { DriftCar } from '../../src/vehicle/driftCar'

/** Headless Rapier world: a big flat slab and the FD at the origin facing +Z. Call RAPIER.init() first. */
export function carRig() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(0.9))
  const car = new DriftCar(world, { x: 0, y: 0, z: 0 }, 0)
  /** Hold `c` for `seconds` of fixed ticks; `sample` runs after every step with the elapsed time in this call. */
  const run = (seconds: number, c: Partial<ControlState>, sample?: (car: DriftCar, t: number) => void) => {
    const ctrl = { ...idleControls(), ...c }
    const n = Math.round(seconds / PHYSICS_STEP)
    for (let i = 0; i < n; i++) {
      car.update(ctrl, PHYSICS_STEP)
      world.step()
      sample?.(car, (i + 1) * PHYSICS_STEP)
    }
  }
  /** Settle, then accelerate in a straight line to about `speed` m/s. */
  const launch = (speed: number) => {
    run(0.5, {})
    for (let i = 0; i < 1200 && car.telemetry().speed < speed; i++) run(PHYSICS_STEP, { throttle: 1 })
  }
  return { world, car, run, launch }
}

/** y component of the car's local up vector (1 = upright). */
export const upright = (car: DriftCar) => {
  const q = car.body.rotation()
  return 1 - 2 * (q.x * q.x + q.z * q.z)
}

/** Horizontal velocity heading, radians (atan2(x, z), same frame as Telemetry.yaw). */
export const pathYaw = (car: DriftCar) => {
  const v = car.body.linvel()
  return Math.atan2(v.x, v.z)
}
