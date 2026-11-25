export const MAX_DRAWER_SHARE = 0.8

/** A docked drawer's share of its host's width, kept between `minWidth` px and 80 %. */
export function clampDrawerShare(share: number, minWidth: number, hostWidth: number): number {
  return Math.min(MAX_DRAWER_SHARE, Math.max(minWidth / hostWidth, share))
}
