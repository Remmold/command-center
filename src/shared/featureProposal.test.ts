import { describe, expect, it } from 'vitest'
import { actionKey, actionSegments, writeActionBlock, type ActionBlockKind } from './actionBlocks'
import type { ChatItem } from './chatItems'
import { proposalSegments, resolveWorkspace, writeProposal, type FeatureProposal } from './featureProposal'
import { ACTION_BLOCKS, MAIN_CHAT_INSTRUCTIONS, mainChatCardStates } from './mainChatActions'

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
    expect(MAIN_CHAT_INSTRUCTIONS).toContain('````feature-proposal')
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/press Go on the card/)
  })

  it('holds the rules of every registered kind, every kind of the spec now built', () => {
    for (const kind of ACTION_BLOCKS) for (const line of kind.instructions) expect(MAIN_CHAT_INSTRUCTIONS).toContain(line)
    expect(ACTION_BLOCKS.map((k) => k.tag)).toEqual(['feature-proposal', 'open-session', 'adopt-work', 'send-message', 'housekeeping'])
  })
})

describe('action blocks of more than one kind', () => {
  const other: ActionBlockKind<'feature' | 'note'> = { tag: 'open-thing', parts: [{ label: 'feature', oneLine: true }, { label: 'note', oneLine: false }], instructions: [] }
  const kinds = [...ACTION_BLOCKS, other]

  it('reads a second kind beside a proposal with the same parser, each tagged', () => {
    const text = `${writeProposal(proposal)}\n\nthen\n\n${writeActionBlock(other, { feature: 'dark-mode', note: 'Look at\nthe toggle.' })}`
    const segments = actionSegments(text, kinds)
    expect(segments.map((s) => (s.kind === 'text' ? 'text' : `${s.kind}:${s.tag}`))).toEqual(['block:feature-proposal', 'text', 'block:open-thing'])
    expect(segments[2]).toEqual({ kind: 'block', tag: 'open-thing', fields: { feature: 'dark-mode', note: 'Look at\nthe toggle.' } })
  })

  it('leaves a block of a kind it was not given as text', () => {
    const text = writeActionBlock(other, { feature: 'a', note: 'b' })
    expect(actionSegments(text, ACTION_BLOCKS)).toEqual([{ kind: 'text', text }])
    expect(proposalSegments(text)).toEqual([{ kind: 'text', text }])
  })

  it('counts a block of an unknown kind as one text segment before a proposal', () => {
    const text = `${writeActionBlock(other, { feature: 'a', note: 'b' })}\n\n${writeProposal(proposal)}`
    const segments = actionSegments(text, ACTION_BLOCKS)
    expect(segments.map((s) => s.kind)).toEqual(['text', 'block'])
  })
})

const reply = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, content: [{ type: 'text', text }], raw: {} as never })
const user = (id: string): ChatItem => ({ kind: 'user', id, text: 'hi' })
const key = (id: string, segment = 0): string => actionKey(id, 0, segment)
const card = (name: string): string => writeProposal({ ...proposal, name })

describe('proposal card state', () => {
  const proposalStates = (items: ChatItem[], settled: boolean, featureNames: string[], done?: Set<string>) => mainChatCardStates(items, settled, { featureNames }, done)

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
    expect(states.get(key('a1'))).toBe('done')
    expect(states.get(key('a2'))).toBe('superseded')
  })

  it('keeps the newest card live when another feature already has its name, so preflight can say why', () => {
    const items = [reply('a1', card('one'))]
    expect(proposalStates(items, true, ['one']).get(key('a1'))).toBe('live')
    expect(proposalStates(items, true, ['other']).get(key('a1'))).toBe('live')
  })

  it('reads the newest card as Started only once this session pressed Go on it', () => {
    const items = [reply('a1', card('one'))]
    expect(proposalStates(items, true, ['one'], new Set([key('a1')])).get(key('a1'))).toBe('done')
    expect(proposalStates(items, true, ['one'], new Set([key('other')])).get(key('a1'))).toBe('live')
  })

  it('keeps a remembered Go Done once the card is no longer the newest; without one, a feature of its name makes it Done', () => {
    const items = [reply('a1', card('one')), user('u2')]
    expect(proposalStates(items, true, [], new Set([key('a1')])).get(key('a1'))).toBe('done')
    expect(proposalStates(items, true, ['one'], new Set()).get(key('a1'))).toBe('done')
    expect(proposalStates(items, true, [], new Set()).get(key('a1'))).toBe('superseded')
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
