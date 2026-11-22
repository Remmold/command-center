import { describe, expect, it } from 'vitest'
import { observedTurn, takeOverStep } from './takeOver'

const prompt = (text: string) => JSON.stringify({ type: 'user', uuid: 'u', message: { role: 'user', content: text } })
const assistant = (stop: string | null, ...content: object[]) =>
  JSON.stringify({ type: 'assistant', uuid: 'a', message: { role: 'assistant', stop_reason: stop, content } })
const text = (t: string) => ({ type: 'text', text: t })
const toolUse = (id: string, name: string) => ({ type: 'tool_use', id, name, input: {} })
const toolResult = (id: string) =>
  JSON.stringify({ type: 'user', uuid: 'r', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } })

describe('observedTurn', () => {
  it('is idle once the last assistant message ended the turn', () => {
    expect(observedTurn({ lines: [prompt('hi'), assistant('end_turn', text('Hello.'))], live: true })).toBe('idle')
  })

  it('is working while a new prompt waits for its reply', () => {
    expect(observedTurn({ lines: [assistant('end_turn', text('Hello.')), prompt('next?')], live: true })).toBe('working')
  })

  it('is working while a tool call has no result, and after its result until the reply', () => {
    const calling = [prompt('build it'), assistant('tool_use', text('Building.')), assistant('tool_use', toolUse('t1', 'Bash'))]
    expect(observedTurn({ lines: calling, live: true })).toBe('working')
    expect(observedTurn({ lines: [...calling, toolResult('t1')], live: true })).toBe('working')
  })

  it('is waiting on input while a question or a plan to approve has no answer', () => {
    const asking = [prompt('plan it'), assistant('tool_use', toolUse('q1', 'AskUserQuestion'))]
    expect(observedTurn({ lines: asking, live: true })).toBe('waiting-input')
    expect(observedTurn({ lines: [prompt('plan'), assistant('tool_use', toolUse('p1', 'ExitPlanMode'))], live: true })).toBe('waiting-input')
    expect(observedTurn({ lines: [...asking, toolResult('q1')], live: true })).toBe('working')
  })

  it('is idle after the user stopped the turn', () => {
    const stopped = JSON.stringify({
      type: 'user',
      uuid: 'i',
      message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] }
    })
    expect(observedTurn({ lines: [prompt('go'), assistant('tool_use', toolUse('t1', 'Bash')), toolResult('t1'), stopped], live: true })).toBe('idle')
  })

  it('reads a quiet transcript, one not written for minutes, as idle, as its Quiet status says', () => {
    expect(observedTurn({ lines: [prompt('go'), assistant('tool_use', toolUse('t1', 'Bash'))], live: false })).toBe('idle')
  })

  describe('with the status the CLI keeps in its sessions folder', () => {
    const calling = [prompt('go'), assistant('tool_use', toolUse('t1', 'Bash'))]

    it('is waiting on input while VS Code asks to approve a tool call', () => {
      expect(observedTurn({ lines: calling, live: true, process: 'waiting' })).toBe('waiting-input')
    })

    it('keeps a long tool call working while the process says busy, even when the transcript has gone quiet', () => {
      expect(observedTurn({ lines: calling, live: false, process: 'busy' })).toBe('working')
    })

    it('still waits for the transcript to show the end of the turn', () => {
      expect(observedTurn({ lines: calling, live: true, process: 'idle' })).toBe('working')
    })
  })
})

describe('takeOverStep', () => {
  it('switches at once when VS Code is idle or waiting on the user', () => {
    expect(takeOverStep({ turn: 'idle', cancelled: false })).toBe('switch')
    expect(takeOverStep({ turn: 'waiting-input', cancelled: false })).toBe('switch')
  })

  it('waits while the agent is working, unless asked to take over now', () => {
    expect(takeOverStep({ turn: 'working', cancelled: false })).toBe('wait')
    expect(takeOverStep({ turn: 'working', cancelled: false, now: true })).toBe('switch')
  })

  it('stops once cancelled, whatever the agent is doing', () => {
    expect(takeOverStep({ turn: 'working', cancelled: true })).toBe('stop')
    expect(takeOverStep({ turn: 'idle', cancelled: true })).toBe('stop')
  })
})
