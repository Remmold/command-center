import { describe, expect, it } from 'vitest'
import { changeHook, hookEventPath, readHookEvents, type HookGroup } from '../../shared/hooks'
import { conflicts, pendingChanges, refreshed, settle, shownValue, stage, type PendingFile } from './claudeSettingsPending'

const base = { model: 'sonnet', alwaysThinkingEnabled: true }

describe('staging Claude Code settings changes', () => {
  it('collects a set and a removal, and lists them with before and after', () => {
    let file: PendingFile | null = null
    file = stage(file, base, 'model', 'opus')
    file = stage(file, base, 'alwaysThinkingEnabled', undefined)
    file = stage(file, base, 'effortLevel', 'high')
    expect(file?.patch).toEqual({ set: { model: 'opus', effortLevel: 'high' }, remove: ['alwaysThinkingEnabled'] })
    expect(pendingChanges(file)).toEqual([
      { key: 'model', before: 'sonnet', after: 'opus' },
      { key: 'effortLevel', before: undefined, after: 'high' },
      { key: 'alwaysThinkingEnabled', before: true, after: undefined }
    ])
    expect(shownValue(file, base, 'model')).toBe('opus')
    expect(shownValue(file, base, 'alwaysThinkingEnabled')).toBeUndefined()
  })

  it('drops a change set back to the value the file had, and the file once nothing is left', () => {
    let file = stage(null, base, 'model', 'opus')
    file = stage(file, base, 'model', 'sonnet')
    expect(file).toBeNull()
    expect(stage(null, base, 'effortLevel', undefined)).toBeNull()
  })

  it('drops the waiting changes inside a key that is staged whole, such as Reset on the hooks', () => {
    const hooks = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }] }] } }
    const file = stage(stage(null, hooks, 'hooks.Stop', undefined), hooks, 'hooks', undefined)
    expect(file?.patch).toEqual({ set: {}, remove: ['hooks'] })
  })

  it('keeps the base of the first change, so Save can tell what Claude changed since', () => {
    const later = { model: 'haiku' }
    const file = stage(stage(null, base, 'model', 'opus'), later, 'effortLevel', 'low')
    expect(file?.base).toBe(base)
  })
})

describe('staging a permission rule list', () => {
  const rules = { permissions: { allow: ['Read', 'Edit'] } }

  it('records the rules added and removed, and the list empty once its last rule goes', () => {
    const file = stage(null, rules, 'permissions.allow', ['Edit', 'Write'])
    expect(file?.patch).toEqual({ set: {}, remove: [], items: { 'permissions.allow': { add: ['Write'], remove: ['Read'] } } })
    expect(pendingChanges(file)).toEqual([{ key: 'permissions.allow', before: ['Read', 'Edit'], after: ['Edit', 'Write'] }])
    const emptied = stage(null, rules, 'permissions.allow', [])
    expect(shownValue(emptied, rules, 'permissions.allow')).toBeUndefined()
    expect(shownValue(emptied, rules, 'permissions')).toBeUndefined()
  })

  it('keeps a rule Claude added on disk meanwhile, with no question to ask', () => {
    const file = stage(null, rules, 'permissions.allow', ['Edit', 'Write']) as PendingFile
    const disk = { permissions: { allow: ['Read', 'Edit', 'Bash(git status)'] } }
    const now = refreshed(file, disk)
    expect(conflicts(now, disk)).toEqual([])
    expect(shownValue(now, disk, 'permissions.allow')).toEqual(['Edit', 'Bash(git status)', 'Write'])
  })
})

describe('a settings file that changed on disk while changes wait', () => {
  const waiting = (): PendingFile => stage(stage(null, base, 'model', 'opus'), base, 'effortLevel', 'high') as PendingFile

  it('keeps the waiting changes and shows the file’s new values for every other key', () => {
    const disk = { model: 'sonnet', alwaysThinkingEnabled: false, theme: 'dark' }
    const file = refreshed(waiting(), disk)
    expect(file.patch).toEqual({ set: { model: 'opus', effortLevel: 'high' }, remove: [] })
    expect(shownValue(file, disk, 'model')).toBe('opus')
    expect(shownValue(file, disk, 'alwaysThinkingEnabled')).toBe(false)
    expect(shownValue(file, disk, 'theme')).toBe('dark')
    expect(conflicts(file, disk)).toEqual([])
  })

  it('marks a waiting key whose value on disk changed, unless the file now holds the waiting value', () => {
    const disk = { model: 'haiku', alwaysThinkingEnabled: true, effortLevel: 'high' }
    expect(conflicts(refreshed(waiting(), disk), disk)).toEqual([{ key: 'model', before: 'sonnet', mine: 'opus', theirs: 'haiku' }])
  })

  it('does not mark a key staged after the file changed under an earlier one', () => {
    const disk = { model: 'sonnet', alwaysThinkingEnabled: false }
    const file = stage(refreshed(waiting(), disk), disk, 'alwaysThinkingEnabled', true)
    expect(file?.patch.set.alwaysThinkingEnabled).toBe(true)
    expect(conflicts(file, disk)).toEqual([])
  })

  it('settles each conflict as mine or the file’s, against the file as it is now', () => {
    const disk = { model: 'haiku', alwaysThinkingEnabled: false, effortLevel: 'low' }
    const file = refreshed(stage(waiting(), base, 'alwaysThinkingEnabled', undefined) as PendingFile, disk)
    expect(conflicts(file, disk).map((c) => c.key)).toEqual(['model', 'effortLevel', 'alwaysThinkingEnabled'])

    const settledFile = settle(file, disk, { model: 'mine', effortLevel: 'file', alwaysThinkingEnabled: 'mine' })
    expect(settledFile).toEqual({ base: disk, patch: { set: { model: 'opus' }, remove: ['alwaysThinkingEnabled'] } })
    expect(conflicts(settledFile, disk)).toEqual([])
    expect(settle(file, disk, { model: 'file', effortLevel: 'file', alwaysThinkingEnabled: 'file' })).toBeNull()
  })
})

describe('staging a hook edit', () => {
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

  it('editing one hook stages only its event, with its other hooks and the other events unchanged', () => {
    const groups = readHookEvents(base.hooks).find((e) => e.event === 'PreToolUse')?.groups as HookGroup[]
    const edited = changeHook(groups, 0, 1, { ...lint, timeout: 30 })
    const file = stage(null, base, hookEventPath('PreToolUse'), edited)
    expect(file?.patch).toEqual({
      set: {
        'hooks.PreToolUse': [
          { matcher: 'Agent', hooks: [guard, { ...lint, timeout: 30 }] },
          { matcher: 'Bash', hooks: [notify] }
        ]
      },
      remove: []
    })
  })
})
