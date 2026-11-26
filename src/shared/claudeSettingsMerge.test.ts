import { describe, expect, it } from 'vitest'
import { SETTINGS_CATALOG, entryFor, type SettingEntry } from './claudeSettingsCatalog'
import type { SettingsLayer } from './claudeSettings'
import { effectiveSetting, sourceBadge, type LayerSettings } from './claudeSettingsMerge'

const entry = (key: string): SettingEntry => {
  const found = SETTINGS_CATALOG.find((e) => e.key === key)
  if (!found) throw new Error(`${key} is not in the catalog`)
  return found
}

const layers = (given: Partial<LayerSettings>): LayerSettings => ({ organisation: null, local: null, repo: null, account: null, ...given })

describe('the effective value', () => {
  it('comes from the highest layer that sets it: local over repo over account', () => {
    const model = entry('model')
    expect(effectiveSetting(model, layers({ account: { model: 'haiku' } }))).toEqual({ value: 'haiku', sources: ['account'], locked: false })
    expect(effectiveSetting(model, layers({ account: { model: 'haiku' }, repo: { model: 'sonnet' } }))).toEqual({ value: 'sonnet', sources: ['repo'], locked: false })
    expect(effectiveSetting(model, layers({ account: { model: 'haiku' }, repo: { model: 'sonnet' }, local: { model: 'opus' } }))).toEqual({
      value: 'opus',
      sources: ['local'],
      locked: false
    })
  })

  it('is the organisation’s, locked, when the organisation sets it', () => {
    expect(effectiveSetting(entry('model'), layers({ organisation: { model: 'sonnet' }, local: { model: 'opus' } }))).toEqual({
      value: 'sonnet',
      sources: ['organisation'],
      locked: true
    })
  })

  it('combines the permission rule lists of every layer, highest first, without repeats', () => {
    const allow = entryFor('permissions.allow')
    expect(
      effectiveSetting(
        allow,
        layers({ organisation: { permissions: { allow: ['WebFetch'] } }, account: { permissions: { allow: ['Read', 'Bash(git status)'] } }, local: { permissions: { allow: ['Bash(git status)', 'Edit'] } } })
      )
    ).toEqual({ value: ['WebFetch', 'Bash(git status)', 'Edit', 'Read'], sources: ['organisation', 'local', 'account'], locked: false })
  })

  it('combines hooks per event across layers', () => {
    const local = { matcher: 'Bash', hooks: [{ type: 'command', command: 'lint' }] }
    const account = { matcher: '', hooks: [{ type: 'command', command: 'log' }] }
    const repo = { hooks: [{ type: 'command', command: 'notify' }] }
    expect(effectiveSetting(entryFor('hooks'), layers({ account: { hooks: { PreToolUse: [account] } }, repo: { hooks: { Stop: [repo] } }, local: { hooks: { PreToolUse: [local] } } }))).toEqual({
      value: { PreToolUse: [local, account], Stop: [repo] },
      sources: ['local', 'repo', 'account'],
      locked: false
    })
  })

  it('combines env and other objects per key, the higher layer winning a key both set', () => {
    expect(effectiveSetting(entryFor('env'), layers({ account: { env: { A: '1', B: '1' } }, repo: { env: { B: '2', C: '2' } } }))).toEqual({
      value: { A: '1', B: '2', C: '2' },
      sources: ['repo', 'account'],
      locked: false
    })
  })

  it('takes a value the catalog marks whole from one layer only', () => {
    const picker = (model: string) => ({ modelPicker: { options: [{ model }] } })
    expect(effectiveSetting(entry('modelPicker'), layers({ account: picker('opus'), organisation: picker('sonnet') })).value).toEqual({ options: [{ model: 'sonnet' }] })
  })

  it('ignores auto and bypass permission modes outside the account layer', () => {
    const mode = entry('permissions.defaultMode')
    expect(effectiveSetting(mode, layers({ account: { permissions: { defaultMode: 'plan' } }, local: { permissions: { defaultMode: 'bypassPermissions' } } }))).toEqual({
      value: 'plan',
      sources: ['account'],
      locked: false
    })
    expect(effectiveSetting(mode, layers({ repo: { permissions: { defaultMode: 'auto' } } })).sources).toEqual([])
    expect(effectiveSetting(mode, layers({ account: { permissions: { defaultMode: 'auto' } }, repo: { permissions: { defaultMode: 'acceptEdits' } } })).value).toBe('acceptEdits')
  })

  it('ignores an account-only setting in the repo and local layers, and a not-in-repo one in the repo layer', () => {
    expect(effectiveSetting(entry('askUserQuestionTimeout'), layers({ account: { askUserQuestionTimeout: '5m' }, local: { askUserQuestionTimeout: '60s' } })).value).toBe('5m')
    expect(effectiveSetting(entry('skipDangerousModePermissionPrompt'), layers({ repo: { skipDangerousModePermissionPrompt: true } })).sources).toEqual([])
    expect(effectiveSetting(entry('skipDangerousModePermissionPrompt'), layers({ local: { skipDangerousModePermissionPrompt: true } })).sources).toEqual(['local'])
  })

  it('lets a stricter value the catalog marks beat higher layers', () => {
    const plan = entry('useAutoModeDuringPlan')
    expect(effectiveSetting(plan, layers({ account: { useAutoModeDuringPlan: false }, local: { useAutoModeDuringPlan: true } }))).toEqual({
      value: false,
      sources: ['account'],
      locked: false
    })
    expect(effectiveSetting(plan, layers({ account: { useAutoModeDuringPlan: true }, local: { useAutoModeDuringPlan: true } })).sources).toEqual(['local'])
    const deny = entry('permissions.denyInsteadOfPrompting')
    expect(effectiveSetting(deny, layers({ account: { permissions: { denyInsteadOfPrompting: true } }, organisation: { permissions: { denyInsteadOfPrompting: false } } }))).toEqual({
      value: true,
      sources: ['account'],
      locked: false
    })
  })

  it('is unset with no source when no layer sets it', () => {
    expect(effectiveSetting(entry('model'), layers({ account: { theme: 'dark' } }))).toEqual({ value: undefined, sources: [], locked: false })
  })
})

describe('the badge naming where the effective value comes from', () => {
  const model = entry('model')
  const badge = (given: Partial<LayerSettings>, edited: SettingsLayer) => sourceBadge(model, layers(given), edited)

  it('says From the layer when the value comes from the edited layer or one below it', () => {
    expect(badge({ account: { model: 'opus' } }, 'account')).toBe('From Account')
    expect(badge({ account: { model: 'opus' } }, 'local')).toBe('From Account')
    expect(badge({ repo: { model: 'opus' } }, 'local')).toBe('From Repo')
  })

  it('says Overridden by the layer when one above the edited layer sets it', () => {
    expect(badge({ account: { model: 'opus' }, local: { model: 'haiku' } }, 'account')).toBe('Overridden by Local')
    expect(badge({ repo: { model: 'haiku' } }, 'account')).toBe('Overridden by Repo')
  })

  it('says Overridden when a stricter value below beats the edited layer', () => {
    const plan = entry('useAutoModeDuringPlan')
    expect(sourceBadge(plan, layers({ account: { useAutoModeDuringPlan: false }, local: { useAutoModeDuringPlan: true } }), 'local')).toBe('Overridden by Account')
  })

  it('names the organisation, and every layer of a combined value', () => {
    expect(badge({ organisation: { model: 'opus' }, local: { model: 'haiku' } }, 'local')).toBe('Set by your organisation')
    const allow = entryFor('permissions.allow')
    expect(sourceBadge(allow, layers({ account: { permissions: { allow: ['Read'] } }, local: { permissions: { allow: ['Edit'] } } }), 'repo')).toBe('Combined from Local and Account')
  })

  it('is null when no layer sets it', () => {
    expect(badge({}, 'account')).toBeNull()
  })
})
