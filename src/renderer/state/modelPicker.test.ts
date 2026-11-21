import { describe, expect, it } from 'vitest'
import type { CliModel } from '../../shared/types'
import {
  effortLabel,
  effortLevels,
  launchChoice,
  migrateModelChoices,
  nextEffort,
  pickerModels,
  pillText,
  sessionTag
} from './modelPicker'

const ALL_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

const model = (value: string, resolvedModel: string, displayName: string, description: string, levels = ALL_LEVELS): CliModel => ({
  value,
  resolvedModel,
  displayName,
  description,
  supportsEffort: true,
  supportedEffortLevels: levels,
  supportsAutoMode: true
})

/** Entries from a real `initialize` reply (fixtures/initialize-reply.json). */
const models: CliModel[] = [
  model('default', 'claude-opus-5-5', 'Default (recommended)', 'Opus 5.5 · Best for everyday, complex tasks'),
  model('opus', 'claude-opus-5-5', 'Opus 5.5', 'For complex work and everyday tasks'),
  model('sonnet', 'claude-sonnet-5-5', 'Sonnet 5.5', 'Most efficient for simpler tasks'),
  model('haiku', 'claude-haiku-5-5', 'Haiku 5.5', 'Fastest for quick answers'),
  model('fable', 'claude-fable-5-1', 'Fable 5.1', 'Most capable for your hardest and longest-running tasks'),
  model('claude-opus-4-6', 'claude-opus-4-6', 'Opus 4.6', 'Best for everyday, complex tasks', ['low', 'medium', 'high', 'max'])
]

const legacy: CliModel = {
  value: 'claude-haiku-4-5-20251001',
  resolvedModel: 'claude-haiku-4-5-20251001',
  displayName: 'Haiku 4.5',
  description: 'Fastest for quick answers',
  supportsEffort: false,
  supportedEffortLevels: [],
  supportsAutoMode: false
}

describe('picker options', () => {
  it('lists the CLI models in its order, with Default (recommended) first', () => {
    const names = pickerModels(models).map((m) => m.displayName)
    expect(names.slice(0, 5)).toEqual(['Default (recommended)', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.1'])
    expect(names).toHaveLength(models.length)
  })

  it('moves models described as aliases to the end, as the extension does', () => {
    const alias = { ...legacy, value: 'opusplan', displayName: 'Opus Plan', description: 'Alias for opus in plan mode' }
    expect(pickerModels([alias, ...models.slice(0, 2)]).map((m) => m.value)).toEqual(['default', 'opus', 'opusplan'])
  })

  it("offers each model's own effort levels, Low/Medium/High when it lists none, and none without effort", () => {
    expect(effortLevels(models.find((m) => m.value === 'claude-opus-4-6'))).toEqual(['low', 'medium', 'high', 'max'])
    expect(effortLevels({ ...legacy, supportsEffort: true })).toEqual(['low', 'medium', 'high'])
    expect(effortLevels(legacy)).toEqual([])
    expect(effortLevels(undefined)).toEqual([])
  })

  it('labels effort levels as the extension does, Auto when unset', () => {
    expect(['low', 'medium', 'high', 'xhigh', 'max'].map(effortLabel)).toEqual(['Low', 'Medium', 'High', 'Extra high', 'Max'])
    expect(effortLabel(undefined)).toBe('Auto')
  })

  it('clicking the Effort row steps to the next level and wraps', () => {
    const levels = ['low', 'medium', 'high']
    expect(nextEffort(levels, 'low')).toBe('medium')
    expect(nextEffort(levels, 'high')).toBe('low')
    expect(nextEffort(levels, undefined)).toBe('low')
  })
})

describe('pill text', () => {
  it('shows the picked model and its effort', () => {
    expect(pillText({ models, selection: 'opus', effort: 'high' })).toEqual({ label: 'Opus 5.5', effort: 'High' })
  })

  it('shows Default (recommended) until the CLI reports which model it serves', () => {
    expect(pillText({ models, selection: undefined })).toEqual({ label: 'Default (recommended)' })
    expect(pillText({ models, selection: 'default', servedModel: 'claude-opus-5-5', effort: 'xhigh' })).toEqual({
      label: 'Opus 5.5',
      effort: 'Extra high'
    })
  })

  it('adds the version when the CLI names a model by its family only, as the extension does', () => {
    const bare = [model('opus', 'claude-opus-5-5', 'Opus', 'Opus 5.5 · Best for everyday, complex tasks')]
    expect(pillText({ models: bare, selection: 'opus' })).toEqual({ label: 'Opus 5.5' })
    const dated = [model('x', 'claude-haiku-4-5-20251001', 'Haiku', '')]
    expect(pillText({ models: dated, selection: 'x' })).toEqual({ label: 'Haiku 4.5' })
  })

  it('omits effort for a model without effort support, and when none is set', () => {
    expect(pillText({ models: [legacy], selection: legacy.value, effort: 'high' })).toEqual({ label: 'Haiku 4.5' })
    expect(pillText({ models, selection: 'sonnet' })).toEqual({ label: 'Sonnet 5.5' })
  })

  it('falls back to the raw model name, or Model, without a model list', () => {
    expect(pillText({ models: [], selection: 'claude-sonnet-4-6' })).toEqual({ label: 'claude-sonnet-4-6' })
    expect(pillText({ models: [], selection: undefined })).toEqual({ label: 'Model' })
  })
})

describe('work list tag', () => {
  it('reads model · effort, shortened, with the effort left out when unset', () => {
    expect(sessionTag({ label: 'Opus 5.5', effort: 'High' })).toBe('Opus 5.5 · High')
    expect(sessionTag({ label: 'Default (recommended)' })).toBe('Default')
  })
})

describe('launch flags', () => {
  const defaults = { model: 'opus', effortByModel: { 'claude-opus-5-5': 'high' } }

  it('passes nothing when the session matches the saved defaults', () => {
    expect(launchChoice({ models, defaults, selection: 'opus', effort: 'high' })).toEqual({})
    expect(launchChoice({ models, defaults, selection: undefined, effort: undefined })).toEqual({})
  })

  it('passes the model and effort the session picked that differ from the defaults', () => {
    expect(launchChoice({ models, defaults, selection: 'sonnet', effort: undefined })).toEqual({ model: 'sonnet' })
    expect(launchChoice({ models, defaults, selection: 'opus', effort: 'max' })).toEqual({ effort: 'max' })
  })

  it('treats Default as no saved model', () => {
    expect(launchChoice({ models, defaults: { effortByModel: {} }, selection: 'default', effort: undefined })).toEqual({})
    expect(launchChoice({ models, defaults, selection: 'default', effort: undefined })).toEqual({ model: 'default' })
  })
})

describe('saved sessions', () => {
  it('gain Thinking on, and lose the app-wide default model, which settings.json now holds', () => {
    const saved = {
      defaultModel: 'sonnet',
      views: { a: { claudeSessions: [{ id: 's1', model: 'sonnet' }, { id: 's2', model: 'opus', thinking: false }] } }
    }
    migrateModelChoices(saved)
    expect(saved).toEqual({
      views: { a: { claudeSessions: [{ id: 's1', model: 'sonnet', thinking: true }, { id: 's2', model: 'opus', thinking: false }] } }
    })
  })
})
