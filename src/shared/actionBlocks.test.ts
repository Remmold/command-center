import { describe, expect, it } from 'vitest'
import { actionKey, actionStates, writeActionBlock, type ActionBlockKind } from './actionBlocks'
import type { ChatItem } from './chatItems'
import { FEATURE_PROPOSAL_BLOCK, writeProposal } from './featureProposal'

const jump: ActionBlockKind<'feature'> = { tag: 'jump-to', parts: [{ label: 'feature', oneLine: true }], instructions: ['Jumping: write a jump-to block.'] }
const kinds = [FEATURE_PROPOSAL_BLOCK, jump]
const facts = { featureNames: ['started-one'] }

const reply = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, content: [{ type: 'text', text }], raw: {} as never })
const user = (id: string): ChatItem => ({ kind: 'user', id, text: 'hi' })
const proposal = (name: string): string => writeProposal({ workspace: 'app', name, description: 'd', brief: 'b' })
const jumpTo = (feature: string): string => writeActionBlock(jump, { feature })
const key = (id: string, segment = 0): string => actionKey(id, 0, segment)

describe('card liveness, the same for every kind', () => {
  it.each([
    ['a proposal', proposal('one')],
    ['a second kind', jumpTo('one')]
  ])('makes %s live once settled, waiting before, and read-only after a user message', (_, text) => {
    expect(actionStates([reply('a1', text)], true, kinds, facts).get(key('a1'))).toBe('live')
    expect(actionStates([reply('a1', text)], false, kinds, facts).get(key('a1'))).toBe('waiting')
    expect(actionStates([reply('a1', text), user('u2')], true, kinds, facts).get(key('a1'))).toBe('superseded')
  })

  it('lets the newest block of any kind supersede an older block of another kind', () => {
    const states = actionStates([reply('a1', proposal('one')), reply('a2', jumpTo('one'))], true, kinds, facts)
    expect(states.get(key('a1'))).toBe('superseded')
    expect(states.get(key('a2'))).toBe('live')
    const back = actionStates([reply('a1', jumpTo('one')), reply('a2', proposal('two'))], true, kinds, facts)
    expect(back.get(key('a1'))).toBe('superseded')
    expect(back.get(key('a2'))).toBe('live')
  })

  it('keys blocks of both kinds in one reply by their segment', () => {
    const states = actionStates([reply('a1', `${proposal('one')}\n\nthen\n\n${jumpTo('one')}`)], true, kinds, facts)
    expect([...states]).toEqual([
      [key('a1', 0), 'superseded'],
      [key('a1', 2), 'live']
    ])
  })

  it('reads the live card of either kind as Done once this session carried it out', () => {
    expect(actionStates([reply('a1', jumpTo('one'))], true, kinds, facts, new Set([key('a1')])).get(key('a1'))).toBe('done')
    expect(actionStates([reply('a1', proposal('one'))], true, kinds, facts, new Set([key('a1')])).get(key('a1'))).toBe('done')
  })

  it("asks each kind's own rule whether an older card is Done; a kind without one reads Superseded", () => {
    const items = [reply('a1', proposal('started-one')), reply('a2', jumpTo('started-one')), reply('a3', 'Thanks.'), user('u4')]
    const states = actionStates(items, true, kinds, facts)
    expect(states.get(key('a1'))).toBe('done')
    expect(states.get(key('a2'))).toBe('superseded')
  })

  it('leaves blocks of a kind it was not given out of the states', () => {
    expect(actionStates([reply('a1', jumpTo('one'))], true, [FEATURE_PROPOSAL_BLOCK], facts).size).toBe(0)
  })

  it('writes a single one-line part on the tag line\'s next line, label and value together', () => {
    expect(jumpTo('dark-mode')).toBe('````jump-to\nfeature: dark-mode\n````')
  })
})
