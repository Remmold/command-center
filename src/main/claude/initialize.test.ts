import { describe, expect, it } from 'vitest'
import { parseInitialize } from './initialize'
import initializeReply from './fixtures/initialize-reply.json'

describe('parseInitialize', () => {
  it('keeps models, account, commands and permission mode from a real initialize reply', () => {
    const init = parseInitialize(initializeReply.response.response)
    expect(init.models).toHaveLength(13)
    expect(init.models[0]).toEqual({
      value: 'default',
      resolvedModel: 'claude-opus-5-5',
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
    expect(init.commands.map((c) => c.name)).toEqual(['clear', 'compact', 'context', 'init', 'mcp', 'model', 'rename', 'usage', 'review'])
    expect(init.commands[0]).toEqual({
      name: 'clear',
      description: 'Start a new session with empty context; previous session stays on disk (resumable with /resume)',
      argumentHint: '[name]',
      aliases: ['reset', 'new'],
      builtin: true
    })
    expect(init.commands.at(-1)).toMatchObject({ name: 'review', aliases: [], builtin: false })
    expect(init.permissionMode).toBe('default')
  })

  it('falls back to empty values when the reply lacks them', () => {
    expect(parseInitialize({ models: [{ value: 'x' }, 'junk'] })).toEqual({
      models: [{ value: 'x', resolvedModel: 'x', displayName: 'x', description: '', supportsEffort: false, supportedEffortLevels: [], supportsAutoMode: false }],
      account: null,
      commands: [],
      permissionMode: 'default',
      remoteControl: { autoStart: false }
    })
  })

  it('reads the Remote Control start-up verdict as the extension does', () => {
    expect(parseInitialize(initializeReply.response.response).remoteControl).toEqual({ available: true, autoStart: true })
    const real = { remote_control_auto_enable: true, remote_control_auto_on_by_default: false, remote_control_available: true, ide_rc_auto_enable_gate: true }
    expect(parseInitialize(real).remoteControl.autoStart).toBe(true)
    expect(parseInitialize(real, { teleported: true }).remoteControl.autoStart).toBe(false)
    expect(parseInitialize({ ...real, remote_control_available: false }).remoteControl).toEqual({ available: false, autoStart: false })
    expect(parseInitialize({ ...real, remote_control_auto_enable: false }).remoteControl.autoStart).toBe(false)
    expect(parseInitialize({ remote_control_auto_enable: true, remote_control_auto_on_by_default: true }).remoteControl.autoStart).toBe(false)
    expect(parseInitialize({ remote_control_auto_enable: true, remote_control_auto_on_by_default: true, ide_rc_auto_enable_gate: true }).remoteControl.autoStart).toBe(true)
  })
})
