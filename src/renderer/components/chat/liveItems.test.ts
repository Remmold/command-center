import { describe, expect, it } from 'vitest'
import { mergeAssistant, thinkingDurations, withStreaming } from './liveItems'
import type { AssistantMessageItem, ChatItem } from './types'
import type { ContentBlock } from '../../../shared/types'

const assistant = (id: string, content: ContentBlock[], extra: Partial<AssistantMessageItem> = {}): AssistantMessageItem => ({
  kind: 'assistant',
  id,
  content,
  raw: { type: 'assistant', message: { id, role: 'assistant', content } },
  ...extra
})
const thinking: ContentBlock = { type: 'thinking', thinking: '', signature: 'sig' }
const text: ContentBlock = { type: 'text', text: 'Done.' }
const prompt: ChatItem = { kind: 'user', id: 'u1', text: 'go', at: 1 }

describe('assistant messages from the CLI', () => {
  it('joins the blocks of one message, which the CLI sends one event at a time, into one item stamped by its last block', () => {
    const items = mergeAssistant([prompt, assistant('msg_1', [thinking], { at: 100, thinkingMs: { 0: 2000 } })], assistant('msg_1', [text], { at: 300 }))
    expect(items).toEqual([prompt, { ...assistant('msg_1', [thinking], { at: 300, thinkingMs: { 0: 2000 } }), content: [thinking, text] }])
  })

  it('appends a message with a new id as its own item', () => {
    const first = assistant('msg_1', [text])
    expect(mergeAssistant([first], assistant('msg_2', [text]))).toEqual([first, assistant('msg_2', [text])])
  })
})

describe('thinking duration', () => {
  it('runs from the block’s first stream event until the CLI commits it', () => {
    const started = new Map([[0, 1_000]])
    expect(thinkingDurations(started, 0, [thinking], 4_400)).toEqual({ 0: 3_400 })
  })

  it('places each thinking block by its index in the whole message', () => {
    const started = new Map([[0, 1_000], [2, 5_000]])
    expect(thinkingDurations(started, 2, [thinking], 6_000)).toEqual({ 2: 1_000 })
  })

  it('has no duration for a block that never streamed, or for other blocks', () => {
    expect(thinkingDurations(new Map(), 0, [thinking, text], 6_000)).toBeUndefined()
    expect(thinkingDurations(new Map([[0, 1]]), 0, [text], 6_000)).toBeUndefined()
  })
})

describe('the message still streaming', () => {
  it('is drawn after the committed items when none of its blocks is committed yet', () => {
    const live = assistant('msg_1', [thinking])
    expect(withStreaming([prompt], live)).toEqual({ items: [prompt, live], live: { id: 'msg_1', from: 0 } })
  })

  it('extends its committed item in place with the blocks still streaming', () => {
    const committed = assistant('msg_1', [thinking], { at: 100, thinkingMs: { 0: 2000 } })
    const live = assistant('msg_1', [thinking, { type: 'text', text: 'Do' }])
    expect(withStreaming([prompt, committed], live)).toEqual({
      items: [prompt, { ...committed, content: [thinking, { type: 'text', text: 'Do' }] }],
      live: { id: 'msg_1', from: 1 }
    })
  })

  it('leaves the items alone when nothing streams', () => {
    expect(withStreaming([prompt], null)).toEqual({ items: [prompt], live: null })
  })
})
