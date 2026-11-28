import { describe, expect, it } from 'vitest'
import { appPrompt } from '../../shared/appPrompts'
import { deliver, dropSendsOfClosed, requestSendOnMount, sendToChat, takeChatSends, takeSendRequest } from './startRequests'

describe('chat sends', () => {
  it('settle with whether the chat reached its running process', async () => {
    const first = requestSendOnMount('a', 'hello')
    const outside = sendToChat('b', 'fix')
    deliver(takeSendRequest('a')!, async () => true)
    for (const send of takeChatSends('b')) deliver(send, async () => false)
    await expect(first).resolves.toBe(true)
    await expect(outside).resolves.toBe(false)
  })

  it("hand the chat an app prompt's origin with its text, and none with a typed one", async () => {
    const sent: unknown[][] = []
    const record = async (...args: unknown[]): Promise<boolean> => (sent.push(args), true)
    void requestSendOnMount('m', appPrompt('main-chat', 'You are the main chat of Command Center. Hi', 'Main chat'))
    void sendToChat('n', appPrompt('outcome', '[Command Center] Sent to x.', 'Main chat'))
    void sendToChat('n', 'typed')
    deliver(takeSendRequest('m')!, record)
    for (const send of takeChatSends('n')) deliver(send, record)
    expect(sent).toEqual([
      ['You are the main chat of Command Center. Hi', { kind: 'main-chat', title: 'Main chat' }],
      ['[Command Center] Sent to x.', { kind: 'outcome', title: 'Main chat' }],
      ['typed', undefined]
    ])
  })

  it('count a send that throws as not reached', async () => {
    const outside = sendToChat('c', 'fix')
    for (const send of takeChatSends('c')) deliver(send, async () => Promise.reject(new Error('spawn failed')))
    await expect(outside).resolves.toBe(false)
  })

  it('settle as not reached when their chat closes before taking them, keeping the hosted ones waiting', async () => {
    const closedFirst = requestSendOnMount('gone', 'hello')
    const closedOutside = sendToChat('gone-too', 'fix')
    const kept = sendToChat('kept', 'fix')
    dropSendsOfClosed((paneId) => paneId === 'kept')
    await expect(closedFirst).resolves.toBe(false)
    await expect(closedOutside).resolves.toBe(false)
    expect(takeSendRequest('gone')).toBeUndefined()
    const waiting = takeChatSends('kept')
    expect(waiting.map((s) => s.prompt)).toEqual(['fix'])
    deliver(waiting[0], async () => true)
    await expect(kept).resolves.toBe(true)
  })
})
