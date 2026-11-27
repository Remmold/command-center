import { describe, expect, it } from 'vitest'
import { actionKey, actionSegments } from './actionBlocks'
import type { ChatItem } from './chatItems'
import { writeProposal } from './featureProposal'
import { ACTION_BLOCKS, MAIN_CHAT_INSTRUCTIONS, mainChatCardStates } from './mainChatActions'
import { featureNamed, writeOpenSession } from './openSession'

const reply = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, content: [{ type: 'text', text }], raw: {} as never })

describe('the open-session block', () => {
  it('is registered: it parses beside a proposal and its rules are in the instructions', () => {
    const text = `Here.\n\n${writeOpenSession('dark-mode')}\n\nPress Open session.`
    expect(actionSegments(text, ACTION_BLOCKS)[1]).toEqual({ kind: 'block', tag: 'open-session', fields: { feature: 'dark-mode' } })
    expect(MAIN_CHAT_INSTRUCTIONS).toContain('````open-session\nfeature: <a feature name')
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/go to, continue or look at a feature's session/)
  })

  it('marks a block with no feature, or two lines of it, as not understood', () => {
    expect(actionSegments('````open-session\nfeature:\n````', ACTION_BLOCKS).map((s) => s.kind)).toEqual(['invalid'])
    expect(actionSegments('````open-session\nfeature: a\nb\n````', ACTION_BLOCKS).map((s) => s.kind)).toEqual(['invalid'])
  })

  it('takes over liveness from an older proposal, and stays live after an open: it never reads Done on its own', () => {
    const items = [reply('a1', writeProposal({ workspace: 'app', name: 'dark-mode', description: 'd', brief: 'b' })), reply('a2', writeOpenSession('dark-mode'))]
    const states = mainChatCardStates(items, true, { featureNames: ['dark-mode'] })
    expect(states.get(actionKey('a1', 0, 0))).toBe('done')
    expect(states.get(actionKey('a2', 0, 0))).toBe('live')
    const older = mainChatCardStates([...items, { kind: 'user', id: 'u', text: 'thanks' }], true, { featureNames: ['dark-mode'] })
    expect(older.get(actionKey('a2', 0, 0))).toBe('superseded')
  })
})

describe('the open-session preflight', () => {
  const features = [{ name: 'dark-mode' }, { name: 'billing' }, { name: 'twin' }, { name: 'twin' }]

  it('passes for a name exactly one feature has', () => {
    expect(featureNamed(' dark-mode ', features)).toEqual({ kind: 'ok', feature: { name: 'dark-mode' } })
  })

  it('names the feature that does not exist, matching exactly', () => {
    expect(featureNamed('login', features)).toEqual({ kind: 'problem', problem: 'No feature named login' })
    expect(featureNamed('Dark-Mode', features)).toEqual({ kind: 'problem', problem: 'No feature named Dark-Mode' })
  })

  it('refuses a name several features have', () => {
    expect(featureNamed('twin', features)).toEqual({ kind: 'problem', problem: '2 features are named twin' })
  })
})
