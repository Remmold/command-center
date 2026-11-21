import { describe, expect, it, vi } from 'vitest'
import { ControlChannel } from './controlChannel'
import initializeReply from './fixtures/initialize-reply.json'
import usageReply from './fixtures/get-usage-reply.json'
import errorReply from './fixtures/error-reply.json'

function makeChannel(ids: string[] = ['req-1', 'req-2', 'req-3']) {
  const written: string[] = []
  const queue = [...ids]
  const channel = new ControlChannel({
    write: (line) => written.push(line),
    newId: () => queue.shift() ?? 'req-x'
  })
  return { channel, written }
}

describe('ControlChannel', () => {
  it('writes a control request as one JSON line', () => {
    const { channel, written } = makeChannel()
    void channel.request('initialize', { hooks: null })
    expect(written).toEqual([
      '{"type":"control_request","request_id":"req-1","request":{"subtype":"initialize","hooks":null}}\n'
    ])
  })

  it('resolves each request with the reply that carries its id, in any order', async () => {
    const { channel } = makeChannel([initializeReply.response.request_id, usageReply.response.request_id])
    const init = channel.request('initialize', { hooks: null })
    const usage = channel.request('get_usage')
    expect(channel.accept(usageReply)).toBe(true)
    expect(channel.accept(initializeReply)).toBe(true)
    expect((await init).current_permission_mode).toBe('default')
    expect((await usage).subscription_type).toBe('max')
  })

  it('rejects with the CLI error text when the reply is an error', async () => {
    const { channel } = makeChannel([errorReply.response.request_id])
    const bad = channel.request('no_such_subtype')
    channel.accept(errorReply)
    await expect(bad).rejects.toThrow('Unsupported control request subtype: no_such_subtype')
  })

  it('rejects a request the CLI never answers after 20 seconds', async () => {
    vi.useFakeTimers()
    try {
      const { channel } = makeChannel()
      const silent = channel.request('get_usage')
      const outcome = expect(silent).rejects.toThrow(/timed out/)
      vi.advanceTimersByTime(19_999)
      expect(channel.accept({ type: 'control_response', response: { subtype: 'success', request_id: 'other', response: {} } })).toBe(true)
      vi.advanceTimersByTime(1)
      await outcome
    } finally {
      vi.useRealTimers()
    }
  })

  const canUseTool = {
    type: 'control_request',
    request_id: 'cli-7',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'Bash',
      input: { command: 'ls' },
      permission_suggestions: [],
      tool_use_id: 'toolu_01'
    }
  }

  it('routes an incoming can_use_tool request to the handler and writes its answer back', async () => {
    const { channel, written } = makeChannel()
    const seen: unknown[] = []
    channel.setIncomingHandler(async (request) => {
      seen.push(request)
      return { behavior: 'allow', updatedInput: request.input }
    })
    expect(channel.accept(canUseTool)).toBe(true)
    await vi.waitFor(() => expect(written).toHaveLength(1))
    expect(seen).toEqual([canUseTool.request])
    expect(JSON.parse(written[0])).toEqual({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'cli-7',
        response: { behavior: 'allow', updatedInput: { command: 'ls' } }
      }
    })
  })

  it('answers an incoming request with an error when no handler takes it', async () => {
    const { channel, written } = makeChannel()
    channel.accept(canUseTool)
    await vi.waitFor(() => expect(written).toHaveLength(1))
    expect(JSON.parse(written[0])).toEqual({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'cli-7', error: 'Unsupported control request: can_use_tool' }
    })
  })

  it('keeps every control line out of the chat stream and lets chat events through', () => {
    const { channel } = makeChannel()
    channel.setIncomingHandler(async () => ({}))
    expect(channel.accept(initializeReply)).toBe(true)
    expect(channel.accept(canUseTool)).toBe(true)
    expect(channel.accept({ type: 'control_cancel_request', request_id: 'cli-7' })).toBe(true)
    expect(channel.accept({ type: 'system', subtype: 'init', session_id: 's' })).toBe(false)
    expect(channel.accept({ type: 'stream_event', event: { type: 'message_start' } })).toBe(false)
    expect(channel.accept({ type: 'result', subtype: 'success' })).toBe(false)
  })

  it('rejects open requests when the process goes away', async () => {
    const { channel } = makeChannel()
    const open = channel.request('interrupt')
    channel.close('claude process exited')
    await expect(open).rejects.toThrow('claude process exited')
  })
})
