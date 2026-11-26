import { describe, expect, it } from 'vitest'
import { HOOK_EVENTS, addHook, changeHook, hookChangeText, hooksLeftOut, otherLayerGroups, readHookEvents, retype, type HookGroup } from './hooks'
import { isEditableStatusLine } from './statusLine'
import schema from './fixtures/claude-code-settings.schema.json'

const guard = { type: 'command', command: 'python guard.py', timeout: 10, statusMessage: 'Dev-mode check' }
const lint = { type: 'command', command: 'pnpm lint' }
const notify = { type: 'command', command: 'notify-send done' }
const base = {
  model: 'opus',
  hooks: {
    PreToolUse: [
      { matcher: 'Agent', hooks: [guard, lint] },
      { matcher: 'Bash', hooks: [notify] }
    ],
    Stop: [{ hooks: [notify] }]
  }
}

describe('hook events', () => {
  it('explains every event the schema documents, once', () => {
    const documented = Object.keys((schema as unknown as { properties: { hooks: { properties: Record<string, unknown> } } }).properties.hooks.properties)
    expect(HOOK_EVENTS.map((e) => e.name).sort()).toEqual([...documented].sort())
    for (const event of HOOK_EVENTS) expect(event.label, event.name).toMatch(/^[A-Z]/)
  })
})

describe('editing hooks', () => {
  it('removing the last hook of a group drops the group, and of an event the event', () => {
    const groups = base.hooks.PreToolUse as HookGroup[]
    expect(changeHook(groups, 1, 0, undefined)).toEqual([groups[0]])
    expect(changeHook([{ hooks: [notify] }], 0, 0, undefined)).toBeUndefined()
  })

  it('adds a hook to the group with the same matcher, else as a new group at the end', () => {
    const groups = base.hooks.PreToolUse as HookGroup[]
    expect(addHook(groups, 'Bash', lint)).toEqual([groups[0], { matcher: 'Bash', hooks: [notify, lint] }])
    expect(addHook(groups, '', lint)).toEqual([...groups, { hooks: [lint] }])
    expect(addHook(undefined, 'Edit|Write', lint)).toEqual([{ matcher: 'Edit|Write', hooks: [lint] }])
  })

  it('turns a hook into another type, keeping the fields both types have', () => {
    expect(retype(guard, 'prompt', { prompt: 'Is this brief ok? $ARGUMENTS' })).toEqual({ type: 'prompt', prompt: 'Is this brief ok? $ARGUMENTS', timeout: 10, statusMessage: 'Dev-mode check' })
    expect(retype({ type: 'prompt', prompt: 'check', model: 'haiku', if: 'Bash(git *)' }, 'agent', {})).toEqual({ type: 'agent', prompt: 'check', model: 'haiku', if: 'Bash(git *)' })
    expect(retype(lint, 'mcp_tool', { server: 'memory', tool: 'save' })).toEqual({ type: 'mcp_tool', server: 'memory', tool: 'save' })
  })

  it('describes the hooks a change adds and removes', () => {
    expect(hookChangeText([{ matcher: 'Agent', hooks: [guard] }], [{ matcher: 'Agent', hooks: [{ ...guard, timeout: 20 }] }, { hooks: [notify] }])).toBe(
      'Added Agent: python guard.py, notify-send done · Removed Agent: python guard.py'
    )
    expect(hookChangeText(undefined, [{ hooks: [lint] }])).toBe('Added pnpm lint')
  })
})

describe('hooks the editor cannot show', () => {
  it('leaves out an unknown event and an event with a hook of an unknown type or field, so they show under Other keys', () => {
    const hooks = {
      PreToolUse: [{ matcher: 'Agent', hooks: [guard] }],
      PreModelSwitch: [{ hooks: [lint] }],
      Stop: [{ hooks: [{ type: 'command', command: 'x', future: true }] }],
      SessionEnd: [{ hooks: [{ type: 'webhook', url: 'x' }] }],
      Notification: 'not a list'
    }
    expect(hooksLeftOut(hooks)).toEqual([['PreModelSwitch'], ['Stop'], ['SessionEnd'], ['Notification']])
    expect(readHookEvents(hooks).map((e) => e.event)).toEqual(['PreToolUse'])
    expect(hooksLeftOut([1])).toEqual([[]])
  })
})

describe('hook groups from other layers', () => {
  it('lists each layer’s groups per event, read only, without the ones the edited layer has too', () => {
    const shared = { matcher: 'Agent', hooks: [guard] }
    const permissionHook = { matcher: '*', hooks: [{ type: 'command', command: 'node "C:/x/command-center/permission-hook.cjs"' }] }
    const layers = {
      organisation: null,
      local: { hooks: { PreToolUse: [permissionHook, shared] } },
      repo: { hooks: { Stop: [{ hooks: [notify] }] } },
      account: { hooks: { PreToolUse: [shared] } }
    }
    expect(otherLayerGroups('account', layers)).toEqual([
      { event: 'PreToolUse', group: permissionHook, layers: ['local'] },
      { event: 'Stop', group: { hooks: [notify] }, layers: ['repo'] }
    ])
  })
})

describe('status lines', () => {
  it('are shown by the editor only as a command with options it knows, a subagent’s with none', () => {
    expect(isEditableStatusLine('statusLine', { type: 'command', command: 'x', padding: 0, refreshInterval: 5, hideVimModeIndicator: true })).toBe(true)
    expect(isEditableStatusLine('statusLine', { type: 'command', command: 'x', refreshInterval: 0.5 })).toBe(false)
    expect(isEditableStatusLine('subagentStatusLine', { type: 'command', command: 'x', padding: 1 })).toBe(false)
    expect(isEditableStatusLine('statusLine', 'node x.js')).toBe(false)
  })
})
