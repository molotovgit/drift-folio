/** speed (m/s) where motion blur and speed lines start and reach full strength (spec §5) */
export const FX_START = 15
export const FX_FULL = 45

export function speedFx(speed: number): number {
  return Math.min(1, Math.max(0, (speed - FX_START) / (FX_FULL - FX_START)))
}
