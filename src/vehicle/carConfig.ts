/** "FD" tuning. Real RX-7 FD dimensions, arcade grip. Units: SI. */
export const carConfig = {
  mass: 1280,
  /** principal inertia (x pitch, y yaw, z roll) */
  inertia: { x: 2100, y: 2050, z: 520 },
  wheelbase: 2.425,
  track: 1.46,
  /** centre of mass height above ground at rest */
  comHeight: 0.45,
  wheelRadius: 0.32,
  /** suspension mount height relative to CoM */
  mountY: 0.05,
  restLength: 0.34,
  springK: 36000,
  damperC: 3600,
  /** maximum front wheel lock */
  maxSteerDeg: 45,
  /** floor for speed-limited lock is a quarter of this */
  highSpeedSteerDeg: 14,
  /** full steer input asks for this share of the tyres' grip limit when not drifting */
  steerGripMargin: 1.0,
  steerSpeed: 10,
  powerW: 206_000,
  maxDriveForce: 7600,
  reverseForce: 3800,
  maxReverseSpeed: 9,
  brakeForce: 13000,
  brakeFrontShare: 0.62,
  /** kinetic friction of a locked (handbrake) tyre, fraction of mu·load */
  lockedFriction: 0.6,
  /** traction control: max share of the friction circle the drive may use while gripping */
  tractionLimit: 0.6,
  mu: 1.15,
  peakSlipDeg: 8,
  frontSlide: 0.78,
  rearSlide: 0.62,
  counterSteer: 0.7,
  /** drift assist: slip angle it holds a drift at */
  driftTargetDeg: 30,
  /** how far the driver's steer can move the held drift angle (± degrees around the target) */
  driftSteerRangeDeg: 18,
  /** drift assist proportional gain, N·m per rad of slip error */
  driftHoldGain: 14000,
  /** drift assist damping, N·m per rad/s of slip change */
  driftDamping: 2500,
  dragCoeff: 0.42,
  rollingCoeff: 14,
  angularDamping: 0.6,
} as const

export type CarConfig = typeof carConfig
