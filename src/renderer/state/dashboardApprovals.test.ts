import { describe, expect, it } from 'vitest'
import { PLAN_TOOL, QUESTION_TOOL, type ApprovalRequest } from '../../shared/approval'
import { acceptAllIds, approvalLines } from './dashboardApprovals'

const request = (requestId: string, paneId: string, raisedAt: number, toolName: string, input: Record<string, unknown> = {}): ApprovalRequest => ({
  requestId,
  paneId,
  toolName,
  input,
  suggestions: [],
  raisedAt
})

const cwdOf = (paneId: string) => (paneId === 'p1' ? 'C:\\repo' : undefined)

describe('dashboard approvals', () => {
  it('lists every chat’s requests oldest first, with the command or file each would run or touch', () => {
    const lines = approvalLines(
      {
        p1: [request('b', 'p1', 200, 'Edit', { file_path: 'C:\\repo\\src\\a.ts' })],
        p2: [request('a', 'p2', 100, 'Bash', { command: 'pnpm test\n--watch', description: 'Run the tests' })]
      },
      cwdOf
    )
    expect(lines.map((l) => [l.request.requestId, l.kind, l.target])).toEqual([
      ['a', 'Bash', 'pnpm test'],
      ['b', 'Edit', 'src/a.ts']
    ])
  })

  it('accepts all tool approvals shown, never questions or plans', () => {
    const lines = approvalLines(
      {
        p1: [
          request('a', 'p1', 1, 'Bash', { command: 'ls' }),
          request('q', 'p1', 2, QUESTION_TOOL, { questions: [{ question: 'Which?' }] }),
          request('p', 'p1', 3, PLAN_TOOL, { plan: '…' }),
          request('m', 'p1', 4, 'mcp__gitlab__get_job', {})
        ]
      },
      cwdOf
    )
    expect(lines.find((l) => l.request.requestId === 'q')?.target).toBe('Which?')
    expect(acceptAllIds(lines)).toEqual(['a', 'm'])
  })

  it('accepts nothing when nothing is shown', () => {
    expect(acceptAllIds(approvalLines({}, cwdOf))).toEqual([])
  })
})
