export type AppView = 'dashboard' | 'work' | 'board'

export const APP_VIEWS: readonly AppView[] = ['dashboard', 'work', 'board']

export const DEFAULT_VIEW: AppView = 'dashboard'

/** Accepts the retired 'sessions' view, which became Work. */
export function parseView(value: unknown): AppView {
  if (value === 'sessions') return 'work'
  return APP_VIEWS.find((v) => v === value) ?? DEFAULT_VIEW
}
