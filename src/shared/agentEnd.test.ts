import { describe, expect, it } from 'vitest'
import { agentFileEnd, agentReport, isRelayNotice } from './agentEnd'
import { agentOver, summarizeAgent } from './agentSummary'
import type { AssistantMessageItem, ChatItem, ToolResultItem, UserMessageItem } from './chatItems'

function assistant(id: string, content: AssistantMessageItem['content'], at: number): AssistantMessageItem {
  return { kind: 'assistant', id, content, raw: { type: 'assistant', message: { id, role: 'assistant', content: [] } }, at }
}
const call = (id: string, name: string, input: unknown, at: number): AssistantMessageItem => assistant(`m-${id}`, [{ type: 'tool_use', id, name, input }], at)
const said = (id: string, text: string, at: number): AssistantMessageItem => assistant(id, [{ type: 'text', text }], at)
const result = (toolUseId: string, text: string, at: number): ToolResultItem => ({ kind: 'tool_result', id: `r-${toolUseId}`, toolUseId, content: [{ type: 'text', text }], at })
const prompt = (id: string, text: string, at: number): UserMessageItem => ({ kind: 'user', id, text, at })

const REPORT = 'Ticket 13 is done and committed as 87130bd.\n\n- **Tests:** green.\n- Toggle is Ctrl+B.'
const working: ChatItem[] = [prompt('p', 'Implement ticket 13.', 1000), call('t1', 'Read', { file_path: 'a.ts' }, 2000), result('t1', 'x', 2500)]
const handedBack: ChatItem[] = [...working, call('h', 'SubagentHandback', { message: REPORT }, 9000), result('h', '{"success":true,"message":"Report delivered to your caller."}', 9500)]

describe('when an agent counts as ended, from its own file', () => {
  it('is finished once it hands its report back, at the handback’s result, whatever its meta says', () => {
    expect(agentFileEnd(handedBack, {})).toEqual({ status: 'finished', at: 9500, report: REPORT, handedBack: true })
    expect(agentFileEnd(handedBack.slice(0, -1), {})).toEqual({ status: 'finished', at: 9000, report: REPORT, handedBack: true })
  })

  it('is stopped when its turn was interrupted', () => {
    const items = [...working, call('t2', 'Bash', { command: 'git cherry-pick' }, 3000), prompt('i', '[Request interrupted by user for tool use]', 3100)]
    expect(agentFileEnd(items, {})).toEqual({ status: 'stopped', at: 3100 })
  })

  it('is still going while a tool call waits, or after a handback when it was woken with a new message', () => {
    expect(agentFileEnd(working, {})).toBeUndefined()
    expect(agentFileEnd([...handedBack, prompt('again', 'Also fix the lint.', 20_000)], {})).toBeUndefined()
  })

  it('is finished on a last message of plain text once the session confirms it, or once the file went quiet', () => {
    const items = [...working, said('end', 'All done.\nNothing else changed.', 4000)]
    expect(agentFileEnd(items, {})).toBeUndefined()
    expect(agentFileEnd(items, { confirmed: true })).toEqual({ status: 'finished', at: 4000, report: 'All done.\nNothing else changed.' })
    expect(agentFileEnd(items, { quiet: true })).toEqual({ status: 'finished', at: 4000, report: 'All done.\nNothing else changed.' })
  })

  it('takes the CLI’s own "finished" mark in its meta file', () => {
    expect(agentFileEnd(working, { finished: true })).toEqual({ status: 'finished', at: 2500 })
  })

  it('does not count a plain-text message as the end while a tool call of the same reply is still pending', () => {
    expect(agentFileEnd([...working, said('mid', 'Let me check.', 3000), call('t3', 'Grep', { pattern: 'x' }, 3001)], { quiet: true })).toBeUndefined()
  })
})

describe('an agent’s report', () => {
  it('is what it handed back, else its last plain text', () => {
    expect(agentReport(handedBack)).toBe(REPORT)
    expect(agentReport([...working, said('end', 'All done.', 4000)])).toBe('All done.')
    expect(agentReport(working)).toBeUndefined()
  })

  it('never is the CLI’s "delivered to you as a message" notice', () => {
    const notice = 'This agent\'s report was delivered to you as a message from "a32cb96ebed07d962" (its SubagentHandback call). Read it there; it is not repeated here.'
    expect(isRelayNotice(notice)).toBe(true)
    expect(isRelayNotice(`${notice}\n`)).toBe(true)
    expect(isRelayNotice(REPORT)).toBe(false)
    expect(agentReport([...working, said('end', notice, 4000)])).toBeUndefined()
  })
})

describe('whether an agent its live process still reports has stopped counting as busy', () => {
  it('stops once its file shows the end: a handback, an interrupt or the CLI’s finished mark', () => {
    expect(agentOver(summarizeAgent(handedBack), {})).toBe(true)
    expect(agentOver(summarizeAgent([...working, prompt('i', '[Request interrupted by user]', 3000)]), {})).toBe(true)
    expect(agentOver(summarizeAgent(working), { finished: true })).toBe(true)
  })

  it('never for silence alone, as a long build writes nothing until it returns', () => {
    expect(agentOver(summarizeAgent(working), {})).toBe(false)
    expect(agentOver(summarizeAgent([...working, said('mid', 'Building now.', 3000)]), {})).toBe(false)
  })
})

describe('an agent woken again after its handback', () => {
  it('works again, though its meta file still says finished', () => {
    const woken = [...handedBack, prompt('again', 'Also fix the lint.', 20_000), call('t9', 'Bash', { command: 'pnpm lint' }, 21_000)]
    expect(agentFileEnd(woken, { finished: true })).toBeUndefined()
  })
})
