import { describe, expect, it } from 'vitest'
import type { ChatItem } from './chatItems'
import {
  FEATURE_PROPOSAL_INSTRUCTIONS,
  proposalKey,
  proposalSegments,
  proposalStates,
  resolveWorkspace,
  writeProposal,
  type FeatureProposal
} from './featureProposal'

const proposal: FeatureProposal = { workspace: 'app · dark-mode', name: 'dark-mode', description: 'Add a dark theme', brief: 'Plan.\n\nBuild the toggle first.' }

describe('feature proposal parser', () => {
  it('reads back what it writes', () => {
    expect(proposalSegments(writeProposal(proposal))).toEqual([{ kind: 'proposal', proposal }])
  })

  it('keeps a brief that holds a fenced code block whole', () => {
    const withCode = { ...proposal, brief: 'Use this:\n```ts\nconst a = 1\n```\nThen test it.' }
    const text = writeProposal(withCode)
    expect(text.startsWith('````feature-proposal')).toBe(true)
    expect(proposalSegments(text)).toEqual([{ kind: 'proposal', proposal: withCode }])
  })

  it('uses a longer fence when the brief holds four backticks', () => {
    const odd = { ...proposal, brief: '````\nx\n````' }
    expect(proposalSegments(writeProposal(odd))).toEqual([{ kind: 'proposal', proposal: odd }])
  })

  it('keeps the text around a block as text', () => {
    const segments = proposalSegments(`Here it is.\n\n${writeProposal(proposal)}\n\nPress Go.`)
    expect(segments.map((s) => s.kind)).toEqual(['text', 'proposal', 'text'])
  })

  it.each(['workspace', 'name', 'description', 'brief'])('marks a block missing its %s as not understood', (part) => {
    const lines = writeProposal(proposal).split('\n').filter((l) => !l.startsWith(`${part}:`))
    expect(proposalSegments(lines.join('\n')).map((s) => s.kind)).toEqual(['invalid'])
  })

  it('marks a block with an empty part, or parts out of order, as not understood', () => {
    expect(proposalSegments(writeProposal({ ...proposal, brief: '  ' })).map((s) => s.kind)).toEqual(['invalid'])
    expect(proposalSegments('````feature-proposal\nname: a\nworkspace: b\ndescription: c\nbrief:\nd\n````').map((s) => s.kind)).toEqual(['invalid'])
  })

  it('reads two blocks as two proposals', () => {
    const other = { ...proposal, name: 'billing' }
    const segments = proposalSegments(`${writeProposal(proposal)}\n\nand\n\n${writeProposal(other)}`)
    expect(segments.filter((s) => s.kind === 'proposal')).toHaveLength(2)
  })

  it('leaves a block still streaming, with no closing fence, as text', () => {
    expect(proposalSegments('````feature-proposal\nworkspace: a\nname: b')).toEqual([{ kind: 'text', text: '````feature-proposal\nworkspace: a\nname: b' }])
  })

  it('shows the same format in the chat instructions', () => {
    expect(FEATURE_PROPOSAL_INSTRUCTIONS).toContain('````feature-proposal')
    expect(FEATURE_PROPOSAL_INSTRUCTIONS).toMatch(/Go button/)
  })
})

const reply = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, content: [{ type: 'text', text }], raw: {} as never })
const user = (id: string): ChatItem => ({ kind: 'user', id, text: 'hi' })
const key = (id: string, segment = 0): string => proposalKey(id, 0, segment)
const card = (name: string): string => writeProposal({ ...proposal, name })

describe('proposal card state', () => {
  it('makes the newest card live once the chat has settled, and waiting before', () => {
    const items = [user('u1'), reply('a1', card('one'))]
    expect(proposalStates(items, true, []).get(key('a1'))).toBe('live')
    expect(proposalStates(items, false, []).get(key('a1'))).toBe('waiting')
  })

  it('makes a card read-only once any user message follows it', () => {
    const items = [reply('a1', card('one')), user('u2')]
    expect(proposalStates(items, true, []).get(key('a1'))).toBe('superseded')
  })

  it('lets only the newest of several cards be live', () => {
    const states = proposalStates([reply('a1', card('one')), reply('a2', card('two'))], true, [])
    expect(states.get(key('a1'))).toBe('superseded')
    expect(states.get(key('a2'))).toBe('live')
  })

  it('lets only the last block of one reply be live', () => {
    const states = proposalStates([reply('a1', `${card('one')}\n\n${card('two')}`)], true, [])
    expect(states.get(key('a1', 0))).toBe('superseded')
    expect(states.get(key('a1', 1))).toBe('live')
  })

  it('reads an old card as Started when a feature has its name, else Superseded', () => {
    const items = [reply('a1', card('one')), user('u2'), reply('a2', card('two')), user('u3')]
    const states = proposalStates(items, true, ['One'])
    expect(states.get(key('a1'))).toBe('started')
    expect(states.get(key('a2'))).toBe('superseded')
  })

  it('reads the newest card as Started, not live, once a feature has its name', () => {
    const items = [reply('a1', card('one'))]
    expect(proposalStates(items, true, ['one']).get(key('a1'))).toBe('started')
    expect(proposalStates(items, true, ['other']).get(key('a1'))).toBe('live')
  })

  it('does not let a newer block that did not parse leave the older card live', () => {
    const items = [reply('a1', card('one')), reply('a2', '````feature-proposal\nname: x\n````')]
    expect(proposalStates(items, true, []).get(key('a1'))).toBe('superseded')
  })

  it('ignores a subagent reply and replies without a proposal', () => {
    const sub = { ...reply('s1', card('sub')), parentToolUseId: 'call' } as ChatItem
    const states = proposalStates([reply('a1', card('one')), sub, reply('a2', 'Thanks.')], true, [])
    expect(states.size).toBe(1)
    expect(states.get(key('a1'))).toBe('live')
  })
})

describe('proposal workspace', () => {
  const options = [
    { id: '1', label: 'app' },
    { id: '2', label: 'app · dark-mode' },
    { id: '3', label: 'twin' },
    { id: '4', label: 'twin' }
  ]
  it('resolves exactly one label', () => {
    expect(resolveWorkspace(' app · dark-mode ', options)).toEqual({ kind: 'ok', id: '2' })
  })
  it('is unclear for no match and for several', () => {
    expect(resolveWorkspace('nothing', options)).toEqual({ kind: 'unclear' })
    expect(resolveWorkspace('twin', options)).toEqual({ kind: 'unclear' })
  })
})
