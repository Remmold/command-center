import { PLAN_TOOL, QUESTION_TOOL, type ApprovalRequest } from '../../shared/approval'
import { toolCallTitle } from '../components/chat/toolCall'
import { approvalKind } from './approvalContext'

export interface ApprovalLine {
  request: ApprovalRequest
  /** Bash, Edit, `Server [tool]`, Question or Plan. */
  kind: string
  /** What it would run or touch, on one line: the command itself for a shell call, the file for an edit. */
  target: string
  /** A plain tool approval, so Accept all may say Yes to it; questions and plans need a real answer. */
  bulk: boolean
}

function targetOf(request: ApprovalRequest, cwd: string | undefined): string {
  if (request.toolName === QUESTION_TOOL) {
    const first = (request.input.questions as Array<{ question?: unknown }> | undefined)?.[0]?.question
    return typeof first === 'string' ? first : ''
  }
  if (request.toolName === PLAN_TOOL) return ''
  const command = request.input.command
  if (typeof command === 'string' && command.trim()) return command.trim().split('\n')[0]
  return toolCallTitle(request.toolName, request.input, cwd).target
}

/** Every waiting request across the hosted chats, oldest first. */
export function approvalLines(byPane: Readonly<Record<string, readonly ApprovalRequest[]>>, cwdOf: (paneId: string) => string | undefined): ApprovalLine[] {
  return Object.values(byPane)
    .flat()
    .sort((a, b) => a.raisedAt - b.raisedAt)
    .map((request) => ({
      request,
      kind: approvalKind(request.toolName),
      target: targetOf(request, cwdOf(request.paneId)),
      bulk: request.toolName !== QUESTION_TOOL && request.toolName !== PLAN_TOOL
    }))
}

/** What Accept all answers: the tool approvals shown when it was clicked, never one that arrives after. */
export function acceptAllIds(shown: readonly ApprovalLine[]): string[] {
  return shown.filter((l) => l.bulk).map((l) => l.request.requestId)
}
