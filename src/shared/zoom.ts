/** Chromium's zoom scale: a level of n is a factor of 1.2^n, so one level is about 20%, as in VS Code. */
const LEVEL_BASE = 1.2
const MIN_LEVEL = -8
const MAX_LEVEL = 8

export type ZoomStep = 'in' | 'out' | 'reset'

export function isZoomStep(x: unknown): x is ZoomStep {
  return x === 'in' || x === 'out' || x === 'reset'
}

/** 110%: the UI at 100% read small on a 1700px window. */
export const ZOOM_DEFAULT_LEVEL = Math.log(1.1) / Math.log(LEVEL_BASE)

function clamp(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level))
}

/** The level to start at from what was saved; anything that is not a level means it was never set. */
export function savedZoomLevel(saved: unknown): number {
  return typeof saved === 'number' && Number.isFinite(saved) ? clamp(saved) : ZOOM_DEFAULT_LEVEL
}

export function zoomStep(level: number, step: ZoomStep): number {
  if (step === 'reset') return ZOOM_DEFAULT_LEVEL
  return clamp(level + (step === 'in' ? 1 : -1))
}

export function zoomFactor(level: number): number {
  return LEVEL_BASE ** level
}

export function zoomPercent(level: number): number {
  return Math.round(zoomFactor(level) * 100)
}
