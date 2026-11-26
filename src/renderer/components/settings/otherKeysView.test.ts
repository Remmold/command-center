import { describe, expect, it } from 'vitest'
import { otherKeyRows, otherKeysNotice } from './otherKeysView'
import { stage } from '../../state/claudeSettingsPending'

describe('the Other keys notice', () => {
  it('names the parse error of a file that does not parse, instead of saying every key has a setting', () => {
    expect(otherKeysNotice({ value: null, text: '{ nope', mtime: 1, error: 'not valid JSON: Unexpected token' }, 0)).toBe(
      'This file is not valid JSON: Unexpected token, so its keys can’t be listed until it parses.'
    )
  })

  it('says every key has a setting above when none is left over, and explains the boxes otherwise', () => {
    const snapshot = { value: { model: 'opus' }, text: '{}', mtime: 1 }
    expect(otherKeysNotice(snapshot, 0)).toBe('Every key in this file has its own setting above.')
    expect(otherKeysNotice(snapshot, 2)).toMatch(/^Keys this page has no control for/)
  })
})

describe('the Other keys rows', () => {
  it('show a key inside a model’s settings, marked when the file changed it while its change waited', () => {
    const disk = { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high', autoCompactWindow: 1 } } }
    const path = 'modelSettings.claude-opus-5-5.autoCompactWindow'
    const pending = stage(null, disk, path, 2)
    const now = { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high', autoCompactWindow: 3 } } }
    const edited = { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high', autoCompactWindow: 2 } } }
    expect(otherKeyRows(now, edited, pending)).toEqual([{ path, value: 2, before: 1, changed: true, fileValue: { value: 3 } }])
  })
})
