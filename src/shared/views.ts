export type AppView = 'dashboard' | 'work' | 'board' | 'context' | 'processes' | '3d'

export const APP_VIEWS: readonly AppView[] = ['dashboard', 'work', 'board', 'context', 'processes', '3d']

export const DEFAULT_VIEW: AppView = 'dashboard'

/** 'sessions' is the retired name of Work; anything unknown opens the Dashboard. */
export function parseView(value: unknown): AppView {
  if (value === 'sessions') return 'work'
  return APP_VIEWS.find((v) => v === value) ?? DEFAULT_VIEW
}
