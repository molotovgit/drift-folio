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
  /** traction control: max share of the friction circle the drive may use while gripping */
  tractionLimit: 0.35,
  mu: 1.15,
  peakSlipDeg: 8,
  frontSlide: 0.78,
  rearSlide: 0.62,
  /** rear friction ×this: a stable (understeering) grip balance; sliding is the drift axis's job */
  rearGripBias: 1.2,
  /** brake input the legacy handbrake gives when it has no drift direction (straight line) */
  handbrakeBrake: 0.6,
  /**
   * Twin-axis drift (see DriftController). While the drift axis is held the
   * tyres hand the horizontal forces to the controller: the steer + drift
   * axes set the path's lateral acceleration, the drift axis sets the body
   * slip angle relative to that path.
   */
  drift: {
    /** body slip at full drift input on full throttle, degrees */
    maxSlipDeg: 48,
    /** hard anti-spin limit on body slip, degrees */
    antiSpinDeg: 75,
    /** lift-off car: the angle grows ×this with the throttle fully lifted (48° → 55°) */
    liftSlipGain: 1.15,
    /** brake with the drift axis held locks the angle: the swing rate drops by this share at full brake */
    brakeLock: 0.8,
    /** fastest the commanded slip angle swings, deg/s */
    slipRateDegS: 220,
    /** slip tracking rate, 1/s (first order on top of the swing limit) */
    slipGain: 8,
    /** yaw-rate servo rate, 1/s */
    yawServo: 40,
    /** path lateral acceleration from full drift alone, g */
    driftLatG: 0.9,
    /** path lateral acceleration from full steer while drifting, g */
    steerLatG: 0.45,
    /** ...and while straightening after a release, so steering is not weak on the way out, g */
    recoverSteerLatG: 0.9,
    /** brake tightens the line ×(1 + this) */
    brakeTighten: 0.6,
    maxLatG: 1.5,
    /** path yaw-rate cap, rad/s (low-speed sanity) */
    maxPathRate: 2.2,
    /** share of the engine's drive that pushes along the path while sideways */
    driveShare: 0.38,
    /** sideways scrub deceleration at 90° slip, g; throttle cancels `throttleScrubCut` of it */
    scrub: 0.45,
    throttleScrubCut: 0.65,
    /** braking deceleration in a drift at full brake, m/s² */
    brakeDecel: 7.5,
    /** total controller force cap, share of mu·m·g (a drift is still friction-limited) */
    forceCap: 1.3,
    /** below this speed the drift hands back to the tyres, m/s */
    minSpeed: 6,
    /** after release the controller straightens the body until |slip| is under this, degrees */
    releaseDeg: 3,
    /** a slide this big without drift input is caught and straightened (anti-spin), degrees */
    catchDeg: 14,
    /** blend in / out times between tyre grip and the drift controller, s */
    blendIn: 0.08,
    blendOut: 0.2,
  },
  dragCoeff: 0.42,
  rollingCoeff: 14,
  angularDamping: 0.6,
} as const

export type CarConfig = typeof carConfig
