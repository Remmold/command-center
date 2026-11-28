import { describe, expect, it } from 'vitest'
import { model3dSessionEnv } from './run'

describe('a hosted session', () => {
  it('gets the jobs folder and its app session id under the names gen3d.py reads', () => {
    expect(model3dSessionEnv('C:\data\model3d-jobs', 'pane-7')).toEqual({ CC_MODEL3D_JOBS: 'C:\data\model3d-jobs', CC_SESSION_ID: 'pane-7' })
  })
})
