/**
 * Whether the main window should stay out of the user's way: test runs launch the app on the fake CLI,
 * and their windows must not pop up mid-screen or take focus. `CC_OFFSCREEN=0|1` overrides.
 */
export function windowOffscreen(env: Record<string, string | undefined>): boolean {
  if (env.CC_OFFSCREEN === '1') return true
  if (env.CC_OFFSCREEN === '0') return false
  return /fake-claude\.mjs$/i.test(env.CC_CLAUDE_BIN ?? '')
}

/** Far outside any monitor layout; the window still renders, so screenshots and input work. */
export const OFFSCREEN_POSITION = { x: -32000, y: -32000 } as const
