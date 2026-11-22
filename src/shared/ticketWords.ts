import type { BoardColumn } from './types'

const COLUMN_OF_WORD: Record<string, BoardColumn> = {
  'needs-triage': 'backlog',
  'needs-info': 'backlog',
  'ready-for-agent': 'backlog',
  'ready-for-human': 'backlog',
  'in-progress': 'in-progress',
  blocked: 'blocked',
  resolved: 'done',
  wontfix: 'done',
  done: 'done',
  complete: 'done',
  completed: 'done',
  closed: 'done',
  claimed: 'in-progress',
  doing: 'in-progress',
  wip: 'in-progress'
}

export function wordColumn(status: string | null): BoardColumn | null {
  return status !== null && Object.hasOwn(COLUMN_OF_WORD, status) ? COLUMN_OF_WORD[status] : null
}
