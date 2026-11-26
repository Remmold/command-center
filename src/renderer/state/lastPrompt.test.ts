import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import { lastPrompt } from './lastPrompt'

const user = (id: string, text: string): ChatItem => ({
  kind: 'user',
  id,
  text
})
const reply = (id: string): ChatItem =>
  ({
    kind: 'assistant',
    id,
    content: [{ type: 'text', text: 'ok' }],
    raw: {}
  }) as unknown as ChatItem

describe('last prompt', () => {
  it('is nothing in a chat with no sent prompt', () => {
    expect(lastPrompt([])).toBeNull()
    expect(lastPrompt([reply('a')])).toBeNull()
  })

  it('is the newest prompt sent, with replies after it', () => {
    expect(lastPrompt([user('u1', 'first'), reply('a'), user('u2', 'second'), reply('b')])).toEqual({ id: 'u2', text: 'second' })
  })

  it('skips prompts still queued or held', () => {
    const items = [user('u1', 'first'), reply('a'), user('u2', 'waiting')]
    expect(lastPrompt(items, [{ uuid: 'u2', text: 'waiting' }])).toEqual({
      id: 'u1',
      text: 'first'
    })
    expect(lastPrompt([user('u1', 'first')], [{ uuid: 'u9', text: 'held' }])).toEqual({ id: 'u1', text: 'first' })
  })

  it('takes the last of several items that share one id, as older chats saved them', () => {
    expect(lastPrompt([user('m', 'part one'), user('m', 'part two'), reply('m')])).toEqual({ id: 'm', text: 'part two' })
  })

  it('drops the attachment note older chats end a prompt with', () => {
    expect(lastPrompt([user('u1', 'look at this\n\n_[2 images attached]_')])).toEqual({ id: 'u1', text: 'look at this' })
  })
})
