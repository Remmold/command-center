import { describe, expect, it } from 'vitest'
import {
  DESTINATION_LABEL,
  allowReply,
  alwaysAllowLabel,
  alwaysAllowReply,
  denyReply,
  initialDestination,
  nextDestination,
  planDenyReply,
  planManualReply,
  planYes
} from './approval'

const input = { command: 'node -e "console.log(7)"', description: 'Print 7 with Node' }

describe('approval replies', () => {
  it('Yes allows the input unchanged and saves no rule', () => {
    expect(allowReply(input)).toEqual({ behavior: 'allow', updatedInput: input, updatedPermissions: [] })
  })

  it('No with feedback passes the feedback to Claude and lets it carry on', () => {
    expect(denyReply('write c.txt instead')).toEqual({
      behavior: 'deny',
      message:
        "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection:  write c.txt instead",
      interrupt: false
    })
  })

  it('No without feedback tells Claude to stop and interrupts the turn', () => {
    expect(denyReply('   ')).toEqual({
      behavior: 'deny',
      message:
        "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.",
      interrupt: true
    })
  })
})

const bashRule = (ruleContent?: string) => ({
  type: 'addRules',
  rules: [{ toolName: 'Bash', ...(ruleContent !== undefined ? { ruleContent } : {}) }],
  behavior: 'allow',
  destination: 'localSettings'
})

describe('the "Yes, allow …" choice', () => {
  it('is not offered without suggestions', () => {
    expect(alwaysAllowLabel([])).toBeNull()
  })

  it('names a short rule in full, then the destination', () => {
    expect(alwaysAllowLabel([bashRule('npm test')])).toEqual([
      { text: 'Yes, allow ' },
      { grant: { label: 'npm test', full: 'npm test' } },
      { text: ' for ' },
      { destination: true }
    ])
  })

  it('cuts a long rule to 17 characters and an ellipsis', () => {
    expect(alwaysAllowLabel([bashRule('node -e "console.log(7)"')])?.[1]).toEqual({
      grant: { label: 'node -e "console.…', full: 'node -e "console.log(7)"' }
    })
  })

  it('names a prefix rule by its prefix', () => {
    expect(alwaysAllowLabel([bashRule('git status:*')])?.[1]).toEqual({ grant: { label: 'git status', full: 'git status:*' } })
  })

  it('names a rule without content by its tool', () => {
    expect(alwaysAllowLabel([bashRule()])?.[1]).toEqual({ grant: { label: 'Bash', full: 'Bash' } })
  })

  it('joins two rules with "and", and counts the rest from three on', () => {
    const two = { ...bashRule(), rules: [{ toolName: 'Bash', ruleContent: 'ls' }, { toolName: 'Bash', ruleContent: 'pwd' }] }
    expect(alwaysAllowLabel([two])).toEqual([
      { text: 'Yes, allow ' },
      { grant: { label: 'ls', full: 'ls' } },
      { text: ' and ' },
      { grant: { label: 'pwd', full: 'pwd' } },
      { text: ' for ' },
      { destination: true }
    ])
    const three = { ...two, rules: [...two.rules, { toolName: 'Bash', ruleContent: 'cd x' }] }
    expect(alwaysAllowLabel([three])).toEqual([
      { text: 'Yes, allow ' },
      { grant: { label: 'ls', full: 'ls' } },
      { text: ' and ' },
      { more: 2, title: '• pwd\n• cd x' },
      { text: ' for ' },
      { destination: true }
    ])
  })

  it('offers directory access by folder name', () => {
    const dir = { type: 'addDirectories', directories: ['C:/work/shared'], destination: 'session' }
    expect(alwaysAllowLabel([dir])).toEqual([
      { text: 'Yes, allow access to ' },
      { grant: { label: 'shared/', full: 'C:/work/shared' } },
      { text: ' for ' },
      { destination: true }
    ])
  })

  it('words a mode change the way the extension does', () => {
    expect(alwaysAllowLabel([{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }])).toEqual([
      { text: 'Yes, allow all edits this session' }
    ])
    expect(alwaysAllowLabel([{ type: 'setMode', mode: 'default', destination: 'session' }])).toEqual([
      { text: 'Yes, return to normal mode' }
    ])
  })

  it('falls back to "Yes, and don\'t ask again" for anything else', () => {
    expect(alwaysAllowLabel([{ type: 'replaceRules', rules: [], destination: 'session' }])).toEqual([
      { text: "Yes, and don't ask again" }
    ])
  })
})

describe('where an "allow" rule is saved', () => {
  it('cycles this project (just you) → all projects → this project (shared) → this session', () => {
    expect(nextDestination('localSettings', 1)).toBe('userSettings')
    expect(nextDestination('userSettings', 1)).toBe('projectSettings')
    expect(nextDestination('projectSettings', 1)).toBe('session')
    expect(nextDestination('session', 1)).toBe('localSettings')
    expect(nextDestination('localSettings', -1)).toBe('session')
    expect(DESTINATION_LABEL.localSettings).toBe('this project (just you)')
    expect(DESTINATION_LABEL.userSettings).toBe('all projects')
    expect(DESTINATION_LABEL.projectSettings).toBe('this project (shared)')
    expect(DESTINATION_LABEL.session).toBe('this session')
  })

  it('starts on the last place picked, else the most shared place the CLI suggested, else this session', () => {
    expect(initialDestination([bashRule('ls')], 'session')).toBe('session')
    expect(initialDestination([bashRule('ls')], null)).toBe('localSettings')
    expect(initialDestination([{ ...bashRule('ls'), destination: 'session' }, { ...bashRule('pwd'), destination: 'projectSettings' }], null)).toBe(
      'projectSettings'
    )
    expect(initialDestination([], 'bogus')).toBe('session')
  })

  it('choice 2 allows and saves every suggestion at the chosen place, a mode change where the CLI said', () => {
    const mode = { type: 'setMode', mode: 'acceptEdits', destination: 'session' }
    expect(alwaysAllowReply(input, [bashRule('node -e "console.log(7)"'), mode], 'userSettings')).toEqual({
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: [{ ...bashRule('node -e "console.log(7)"'), destination: 'userSettings' }, mode]
    })
  })
})

describe('approving a plan', () => {
  const plan = { plan: '1. do it' }

  it('Yes switches to auto mode when the model has it, else to editing automatically', () => {
    expect(planYes(true)).toEqual({ label: 'Yes, and use auto mode', mode: 'auto' })
    expect(planYes(false)).toEqual({ label: 'Yes, and auto-accept', mode: 'acceptEdits' })
  })

  it('"manually approve edits" allows the plan and returns to Manual for this session', () => {
    expect(planManualReply(plan)).toEqual({
      behavior: 'allow',
      updatedInput: plan,
      updatedPermissions: [{ type: 'setMode', mode: 'default', destination: 'session' }]
    })
  })

  it('No keeps planning, with the feedback when there is some', () => {
    expect(planDenyReply('')).toEqual({
      behavior: 'deny',
      message: 'User chose to stay in plan mode and continue planning',
      interrupt: true
    })
    expect(planDenyReply('smaller steps')).toEqual(denyReply('smaller steps'))
  })
})
