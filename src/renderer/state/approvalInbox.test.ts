import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import { approvalKind, currentTodo, lastAssistantText } from './approvalContext'
import { GONE_LINGER_MS, answeredHere, inboxDone, moveSelection, openInbox, syncInbox, type InboxItem } from './approvalInbox'

const item = (requestId: string, paneId: string, raisedAt: number): InboxItem => ({ requestId, paneId, raisedAt })

const ids = (state: { rows: { requestId: string }[] }) => state.rows.map((r) => r.requestId)

describe('approval inbox queue', () => {
  it('opens with every pending item oldest first, the oldest selected', () => {
    const state = openInbox([item('c', 'p3', 300), item('a', 'p1', 100), item('b', 'p2', 200)])
    expect(ids(state)).toEqual(['a', 'b', 'c'])
    expect(state.selected).toBe('a')
  })

  it('opens at a chat’s oldest item when asked for that chat', () => {
    const state = openInbox([item('a', 'p1', 100), item('b', 'p2', 200), item('c', 'p2', 300)], 'p2')
    expect(state.selected).toBe('b')
  })

  it('adds items that arrive while open to the end, never reordering under the cursor', () => {
    const open = openInbox([item('b', 'p2', 200), item('c', 'p3', 300)])
    const moved = { ...open, selected: 'c' }
    // An item raised earlier than the open ones (a clock skew, a late list reply) still goes last.
    const next = syncInbox(moved, [item('b', 'p2', 200), item('c', 'p3', 300), item('e', 'p5', 500), item('a', 'p1', 100)], 1000)
    expect(ids(next)).toEqual(['b', 'c', 'a', 'e'])
    expect(next.selected).toBe('c')
  })

  it('marks an item answered in the chat, keeps it for a moment, then drops it and selects the row that took its place', () => {
    const open = openInbox([item('a', 'p1', 100), item('b', 'p2', 200), item('c', 'p3', 300)])
    const selectedB = { ...open, selected: 'b' }
    const marked = syncInbox(selectedB, [item('a', 'p1', 100), item('c', 'p3', 300)], 1000)
    expect(ids(marked)).toEqual(['a', 'b', 'c'])
    expect(marked.rows[1].goneAt).toBe(1000)
    expect(marked.selected).toBe('b')

    const still = syncInbox(marked, [item('a', 'p1', 100), item('c', 'p3', 300)], 1000 + GONE_LINGER_MS - 1)
    expect(ids(still)).toEqual(['a', 'b', 'c'])

    const dropped = syncInbox(still, [item('a', 'p1', 100), item('c', 'p3', 300)], 1000 + GONE_LINGER_MS)
    expect(ids(dropped)).toEqual(['a', 'c'])
    expect(dropped.selected).toBe('c')
  })

  it('after an answer here, drops the item at once and moves to the next; the last one moves up', () => {
    const open = openInbox([item('a', 'p1', 100), item('b', 'p2', 200), item('c', 'p3', 300)])
    const afterA = answeredHere(open, 'a')
    expect(ids(afterA)).toEqual(['b', 'c'])
    expect(afterA.selected).toBe('b')
    const afterC = answeredHere({ ...afterA, selected: 'c' }, 'c')
    expect(afterC.selected).toBe('b')
    // The broker's settled event for an item answered here finds nothing left to mark.
    expect(syncInbox(afterC, [item('b', 'p2', 200)], 2000)).toEqual(afterC)
  })

  it('is done, and closes, once the last item is answered; an inbox opened with nothing is done at once', () => {
    const open = openInbox([item('a', 'p1', 100)])
    expect(inboxDone(open)).toBe(false)
    expect(inboxDone(answeredHere(open, 'a'))).toBe(true)
    expect(inboxDone(openInbox([]))).toBe(true)
    const gone = syncInbox(open, [], 0)
    expect(inboxDone(gone)).toBe(false)
    expect(inboxDone(syncInbox(gone, [], GONE_LINGER_MS))).toBe(true)
  })

  it('moves the selection one row down or up, stopping at the ends', () => {
    const open = openInbox([item('a', 'p1', 100), item('b', 'p2', 200)])
    expect(moveSelection(open, 1).selected).toBe('b')
    expect(moveSelection(moveSelection(open, 1), 1).selected).toBe('b')
    expect(moveSelection(open, -1).selected).toBe('a')
  })
})

const said = (id: string, content: unknown[], parentToolUseId?: string): ChatItem =>
  ({ kind: 'assistant', id, content, raw: {}, ...(parentToolUseId ? { parentToolUseId } : {}) }) as unknown as ChatItem

describe('approval inbox context', () => {
  it('names each kind as the queue shows it', () => {
    expect(approvalKind('Bash')).toBe('Bash')
    expect(approvalKind('Edit')).toBe('Edit')
    expect(approvalKind('AskUserQuestion')).toBe('Question')
    expect(approvalKind('ExitPlanMode')).toBe('Plan')
    expect(approvalKind('mcp__github__create_issue')).toBe('GitHub [create_issue]')
  })

  it('takes the last thing Claude said in the chat itself, not in a subagent', () => {
    const items = [
      said('1', [{ type: 'text', text: 'First.' }]),
      said('2', [{ type: 'text', text: 'I will run the tests.' }, { type: 'tool_use', id: 't', name: 'Bash', input: {} }]),
      said('3', [{ type: 'text', text: 'subagent words' }], 'agent-call'),
      said('4', [{ type: 'tool_use', id: 'u', name: 'Bash', input: {} }])
    ]
    expect(lastAssistantText(items)).toBe('I will run the tests.')
    expect(lastAssistantText([])).toBeNull()
  })

  it('reads the todo in progress from the newest list', () => {
    const list = (id: string, todos: unknown[]) => said(id, [{ type: 'tool_use', id, name: 'TodoWrite', input: { todos } }])
    const items = [
      list('old', [{ content: 'Old step', status: 'in_progress' }]),
      list('new', [{ content: 'Write the parser', status: 'completed' }, { content: 'Run the tests', status: 'in_progress' }])
    ]
    expect(currentTodo(items)).toBe('Run the tests')
    expect(currentTodo([list('done', [{ content: 'All done', status: 'completed' }])])).toBeNull()
  })
})
