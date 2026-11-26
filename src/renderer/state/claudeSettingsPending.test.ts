import { describe, expect, it } from 'vitest'
import { pendingChanges, shownValue, stage, type PendingFile } from './claudeSettingsPending'

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

  it('keeps the base of the first change, so Save can tell what Claude changed since', () => {
    const later = { model: 'haiku' }
    const file = stage(stage(null, base, 'model', 'opus'), later, 'effortLevel', 'low')
    expect(file?.base).toBe(base)
  })
})
