import { describe, expect, it } from 'vitest'
import { parseInitialize } from './initialize'
import initializeReply from './fixtures/initialize-reply.json'

describe('parseInitialize', () => {
  it('keeps models, account, commands and permission mode from a real initialize reply', () => {
    const init = parseInitialize(initializeReply.response.response)
    expect(init.models).toHaveLength(13)
    expect(init.models[0]).toEqual({
      value: 'default',
      displayName: 'Default (recommended)',
      description: 'Opus 5.5 · Best for everyday, complex tasks',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      supportsAutoMode: true
    })
    expect(init.account).toEqual({
      email: 'someone@example.com',
      organization: 'Example Organization',
      subscriptionType: 'Claude Ultra',
      apiProvider: 'firstParty'
    })
    expect(init.commands.map((c) => c.name)).toEqual(['compact', 'review'])
    expect(init.permissionMode).toBe('default')
  })

  it('falls back to empty values when the reply lacks them', () => {
    expect(parseInitialize({ models: [{ value: 'x' }, 'junk'] })).toEqual({
      models: [{ value: 'x', displayName: 'x', description: '', supportsEffort: false, supportedEffortLevels: [], supportsAutoMode: false }],
      account: null,
      commands: [],
      permissionMode: 'default'
    })
  })
})
