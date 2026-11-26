import { describe, expect, it } from 'vitest'
import { featureAccount } from './account'

const deps = (over: Partial<Parameters<typeof featureAccount>[0]> = {}) => ({
  workspace: async () => ({ profileId: 'work' }),
  hasProfile: async (id: string) => id === 'work',
  prepare: async (id: string) => ({ env: { CLAUDE_CONFIG_DIR: `C:/cfg/${id}` } }),
  ...over
})

describe('featureAccount', () => {
  it('prepares the environment of the workspace\'s own account', async () => {
    expect(await featureAccount(deps(), 'w')).toEqual({ ok: true, env: { CLAUDE_CONFIG_DIR: 'C:/cfg/work' } })
  })

  it('refuses a removed account instead of running on the default login', async () => {
    const out = await featureAccount(deps({ hasProfile: async () => false }), 'w')
    expect(out).toEqual({ ok: false, error: expect.stringMatching(/account was removed/) })
  })

  it('refuses a removed workspace', async () => {
    expect(await featureAccount(deps({ workspace: async () => undefined }), 'w')).toEqual({ ok: false, error: expect.stringMatching(/workspace .* was removed/) })
  })
})
