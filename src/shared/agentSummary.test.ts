import { describe, expect, it } from 'vitest'
import { agentFileEnd } from './agentEnd'
import { addToSummary, agentSettled, EMPTY_SUMMARY, summarizeAgent, summaryEnd } from './agentSummary'
import type { AssistantMessageItem, ChatItem, ToolResultItem, UserMessageItem } from './chatItems'

function assistant(id: string, content: AssistantMessageItem['content'], at: number): AssistantMessageItem {
  return { kind: 'assistant', id, content, raw: { type: 'assistant', message: { id, role: 'assistant', content } }, at }
}
const call = (id: string, name: string, input: unknown, at: number): AssistantMessageItem => assistant(`m-${id}`, [{ type: 'tool_use', id, name, input }], at)
const said = (id: string, text: string, at: number): AssistantMessageItem => assistant(id, [{ type: 'text', text }], at)
const result = (toolUseId: string, text: string, at: number): ToolResultItem => ({ kind: 'tool_result', id: `r-${toolUseId}`, toolUseId, content: [{ type: 'text', text }], at })
const prompt = (id: string, text: string, at: number): UserMessageItem => ({ kind: 'user', id, text, at })

const TEN_MIN = 10 * 60_000
const REPORT = 'Ticket 13 is done as 87130bd.'
const working: ChatItem[] = [
  prompt('p', 'Implement ticket 13.', 1000),
  call('t1', 'Read', { file_path: 'a.ts' }, 2000),
  result('t1', 'x'.repeat(5000), 2500),
  call('t2', 'Bash', { command: 'pnpm test' }, 3000),
  result('t2', 'ok', 3500)
]
const handedBack: ChatItem[] = [...working, call('h', 'SubagentHandback', { message: REPORT }, 9000), result('h', '{"success":true}', 9500)]

describe('an agent’s summary, built from its file’s items', () => {
  it('counts its replies and tool calls and knows its first and last times', () => {
    expect(summarizeAgent(handedBack)).toMatchObject({ replies: 3, toolUses: 3, firstAt: 1000, lastAt: 9500 })
  })

  it('keeps its last reply and what came after it, so its end and its now line need nothing else', () => {
    const summary = summarizeAgent(handedBack)
    expect(summary.last.map((i) => i.id)).toEqual(['m-h', 'r-h'])
    expect(summaryEnd(summary, {})).toEqual(agentFileEnd(handedBack, {}))
    expect(summaryEnd(summary, {})).toEqual({ status: 'finished', at: 9500, report: REPORT, handedBack: true })
  })

  it('drops the bulky parts nothing reads: tool output after the last reply and the raw copy of each reply', () => {
    const summary = summarizeAgent(working)
    expect(summary.last).toHaveLength(2)
    expect((summary.last[1] as ToolResultItem).content).toBe('')
    expect((summary.last[0] as AssistantMessageItem).raw.message.content).toEqual([])
    expect(JSON.stringify(summary).length).toBeLessThan(800)
  })

  it('is the same whether the items arrive at once or line by line', () => {
    const stepwise = handedBack.reduce((s, item) => addToSummary(s, [item]), EMPTY_SUMMARY)
    expect(stepwise).toEqual(summarizeAgent(handedBack))
  })

  it('remembers a prompt after a handback, so the CLI’s earlier finished mark no longer ends it', () => {
    const woken = [...handedBack, prompt('again', 'Also fix the lint.', 20_000), call('t3', 'Bash', { command: 'pnpm lint' }, 21_000)]
    const summary = summarizeAgent(woken)
    expect(summary.woken).toBe(true)
    expect(summaryEnd(summary, { finished: true })).toEqual(agentFileEnd(woken, { finished: true }))
    expect(summaryEnd(summary, { finished: true })).toBeUndefined()
  })

  it('keeps the Agent calls it made and their results, for the agents it started', () => {
    const items = [prompt('p', 'go', 1000), call('c9', 'Agent', { description: 'Review' }, 2000), result('c9', 'Review: fine.', 8000), said('end', 'Done.', 9000)]
    expect(summarizeAgent(items).calls.map((i) => i.id)).toEqual(['m-c9', 'r-c9'])
    expect((summarizeAgent(items).calls[1] as ToolResultItem).content).toEqual([{ type: 'text', text: 'Review: fine.' }])
  })

  it('sees an interrupt after its last reply', () => {
    const items = [...working, prompt('i', '[Request interrupted by user for tool use]', 4000)]
    expect(summaryEnd(summarizeAgent(items), {})).toEqual({ status: 'stopped', at: 4000 })
  })
})

describe('whether an agent still needs following', () => {
  it('is followed while it works and settles once it handed back, was interrupted or the CLI marked it finished', () => {
    expect(agentSettled(summarizeAgent(working), {}, 4000)).toBe(false)
    expect(agentSettled(summarizeAgent(handedBack), {}, 10_000)).toBe(true)
    expect(agentSettled(summarizeAgent([...working, prompt('i', '[Request interrupted by user]', 4000)]), {}, 5000)).toBe(true)
    expect(agentSettled(summarizeAgent(working), { finished: true }, 4000)).toBe(true)
  })

  it('settles once its file has been quiet for 10 minutes, a final reply of plain text included', () => {
    expect(agentSettled(summarizeAgent(working), {}, 3500 + TEN_MIN)).toBe(false)
    expect(agentSettled(summarizeAgent(working), {}, 3500 + TEN_MIN + 1)).toBe(true)
    expect(agentSettled(summarizeAgent([...working, said('end', 'All done.', 4000)]), {}, 4000 + TEN_MIN + 1)).toBe(true)
  })

  it('follows again once woken after its handback', () => {
    const woken = [...handedBack, prompt('again', 'Also fix the lint.', 20_000)]
    expect(agentSettled(summarizeAgent(woken), { finished: true }, 21_000)).toBe(false)
  })

  it('an empty file is followed: its agent is about to write', () => {
    expect(agentSettled(EMPTY_SUMMARY, {}, 1_000_000)).toBe(false)
  })
})
