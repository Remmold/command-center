import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model3dView } from '../../shared/model3d'

const atStep = (step: number): Model3dView => ({
  server: 'ready',
  startedByApp: true,
  jobs: [
    {
      request: { id: 'j1', kind: 'generate', argv: [], cwd: 'C:/game', python: 'py', script: 'gen3d.py', waiterPid: 1, wait: true, sessionId: '', configDir: '', submittedAt: '2026-11-28T10:00:00.000Z', summary: 'ore', runAnyway: false },
      status: { state: step < 0 ? 'done' : 'running', waitReason: null, progress: step < 0 ? null : { item: 1, of: 1, name: 'ore', stage: 'generate', step, steps: 30 }, startedAt: null, endedAt: null, error: null, outputs: [] }
    }
  ]
})
const DONE = atStep(-1)

let current: Model3dView
let push: ((view: Model3dView) => void) | null
let answer: ((view: Model3dView) => void) | null

vi.stubGlobal('window', {
  api: {
    model3d: {
      view: () => new Promise<Model3dView>((resolve) => (answer = resolve)),
      onChanged: (cb: (view: Model3dView) => void) => {
        push = cb
        return () => (push = null)
      }
    }
  }
})

const { useModel3dStore } = await import('./model3dStore')
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  useModel3dStore.setState({ view: null })
  push = null
  answer = null
  current = atStep(18)
})

describe('following the 3D service', () => {
  it('shows the job as it is now when the view opens again after it finished unseen', async () => {
    const unfollow = useModel3dStore.getState().follow()
    answer!(current)
    await flush()
    unfollow()

    const again = useModel3dStore.getState().follow()
    answer!(DONE)
    await flush()
    expect(useModel3dStore.getState().view).toEqual(DONE)
    again()
  })

  it('keeps a change pushed while the first read was still out', async () => {
    const unfollow = useModel3dStore.getState().follow()
    push!(DONE)
    answer!(current)
    await flush()
    expect(useModel3dStore.getState().view).toEqual(DONE)
    unfollow()
  })
})
