import { describe, expect, it } from 'vitest'
import type { CliModel } from '../../shared/types'
import { NO_PICKS, recordPick, startingChoice } from './lastPick'

const model = (value: string, resolvedModel: string, levels: string[]): CliModel => ({
  value,
  resolvedModel,
  displayName: value,
  description: '',
  supportsEffort: levels.length > 0,
  supportedEffortLevels: levels,
  supportsAutoMode: true
})

const models: CliModel[] = [
  model('default', 'claude-opus-5-5', ['low', 'medium', 'high', 'xhigh', 'max']),
  model('opus', 'claude-opus-5-5', ['low', 'medium', 'high', 'xhigh', 'max']),
  model('sonnet', 'claude-sonnet-5-5', ['low', 'medium', 'high']),
  model('haiku', 'claude-haiku-5-5', [])
]

const NO_DEFAULTS = { effortByModel: {} }
const WORK = 'work'

describe('a new chat starts on the last pick', () => {
  it('uses the pick made on its own profile first', () => {
    let picks = recordPick(NO_PICKS, 'default', { model: 'opus' })
    picks = recordPick(picks, WORK, { model: 'sonnet' })
    picks = recordPick(picks, 'default', { model: 'haiku' })
    expect(startingChoice({ picks, profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ model: 'sonnet' })
  })

  it('falls back to the last pick on any profile, value by value', () => {
    let picks = recordPick(NO_PICKS, WORK, { model: 'sonnet' })
    picks = recordPick(picks, 'default', { effort: 'high' })
    expect(startingChoice({ picks, profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ model: 'sonnet', effort: 'high' })
    expect(startingChoice({ picks, profileId: 'other', models, defaults: NO_DEFAULTS })).toEqual({ model: 'sonnet', effort: 'high' })
  })

  it('a model pick drops the effort picked before it, as it does in the chat', () => {
    let picks = recordPick(NO_PICKS, WORK, { effort: 'xhigh' })
    picks = recordPick(picks, WORK, { model: 'sonnet' })
    expect(startingChoice({ picks, profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ model: 'sonnet' })
  })

  it('never remembers Max, which the CLI keeps for one session', () => {
    let picks = recordPick(NO_PICKS, WORK, { effort: 'high' })
    picks = recordPick(picks, WORK, { effort: 'max' })
    expect(startingChoice({ picks, profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ effort: 'high' })
  })

  it('without a pick leaves both unset, so the settings.json default and then the CLI default apply', () => {
    const defaults = { model: 'sonnet', effortByModel: { 'claude-sonnet-5-5': 'low' } }
    expect(startingChoice({ picks: NO_PICKS, profileId: WORK, models, defaults })).toEqual({})
  })
})

describe('a pick the profile does not offer is skipped', () => {
  it('skips a model missing from the profile list for the next pick in order', () => {
    let picks = recordPick(NO_PICKS, WORK, { model: 'fable' })
    picks = recordPick(picks, 'default', { model: 'sonnet' })
    expect(startingChoice({ picks, profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ model: 'sonnet' })
  })

  it('skips an effort the starting model lacks, judged on the settings model when no model is picked', () => {
    const picks = recordPick(NO_PICKS, WORK, { effort: 'xhigh' })
    expect(startingChoice({ picks, profileId: WORK, models, defaults: { model: 'sonnet', effortByModel: {} } })).toEqual({})
    expect(startingChoice({ picks, profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ effort: 'xhigh' })
    const onHaiku = recordPick(picks, WORK, { model: 'haiku' })
    expect(startingChoice({ picks: recordPick(onHaiku, WORK, { effort: 'low' }), profileId: WORK, models, defaults: NO_DEFAULTS })).toEqual({ model: 'haiku' })
  })

  it('keeps the picks while the profile has no model list yet', () => {
    let picks = recordPick(NO_PICKS, WORK, { model: 'fable' })
    picks = recordPick(picks, WORK, { effort: 'xhigh' })
    expect(startingChoice({ picks, profileId: WORK, models: [], defaults: NO_DEFAULTS })).toEqual({ model: 'fable', effort: 'xhigh' })
  })
})

describe('chats with their own choice', () => {
  it('keep it: a stored model or effort is never replaced', () => {
    const picks = recordPick(recordPick(NO_PICKS, WORK, { model: 'sonnet' }), WORK, { effort: 'high' })
    const input = { picks, profileId: WORK, models, defaults: NO_DEFAULTS }
    expect(startingChoice({ ...input, own: { model: 'opus', effort: 'low' } })).toEqual({ model: 'opus', effort: 'low' })
    expect(startingChoice({ ...input, own: { model: 'opus' } })).toEqual({ model: 'opus' })
  })
})
