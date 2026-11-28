import { describe, expect, it, vi } from 'vitest'
import { LAYOUT_VERSION, loadedActivityView } from './projectViewLayout'

const KEY = 'command-center.project-views'
const saved = new Map<string, string>([
  [KEY, JSON.stringify({ state: { views: {}, order: [], activeProjectId: null, activityView: null }, version: LAYOUT_VERSION })]
])
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key)
})
vi.stubGlobal('window', { api: { claude: { stop: () => undefined } } })

const { useProjectViewsStore } = await import('./projectViewsStore')

describe('side panel view', () => {
  it('a null saved while the side panel was hidden loads as Files', () => {
    expect(useProjectViewsStore.getState().activityView).toBe('explorer')
  })

  it('anything but Changes loads as Files', () => {
    expect(loadedActivityView('sourceControl')).toBe('sourceControl')
    expect(loadedActivityView(undefined)).toBe('explorer')
    expect(loadedActivityView('search')).toBe('explorer')
  })

  it('the switch shows Changes, then Files, and the pick is saved', () => {
    const { setActivityView } = useProjectViewsStore.getState()
    setActivityView('sourceControl')
    expect(useProjectViewsStore.getState().activityView).toBe('sourceControl')
    expect(JSON.parse(saved.get(KEY) ?? '{}').state.activityView).toBe('sourceControl')
    setActivityView('explorer')
    expect(useProjectViewsStore.getState().activityView).toBe('explorer')
  })
})
