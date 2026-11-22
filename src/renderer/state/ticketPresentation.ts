import { wordColumn } from '../../shared/ticketWords'
import type { BoardColumn, BoardTicket } from '../../shared/types'

/** A word that only names its own column; wontfix and the backlog's triage words say more than their column. */
export function statusRepeatsColumn(ticket: Pick<BoardTicket, 'status' | 'statusKnown' | 'column'>): boolean {
  if (!ticket.statusKnown || ticket.status === 'wontfix' || ticket.column === 'backlog') return false
  return wordColumn(ticket.status) === ticket.column
}

/** A session dot on every card of a workspace says nothing about the ticket; on a ticket in progress it is the session doing it. */
export function showsSessionStatus(column: BoardColumn): boolean {
  return column === 'in-progress'
}

const FIELD = /^\s*(?:[-*]\s+)?(status|blocked by)\s*:/i

/**
 * The ticket file minus what the drawer's header and Blocked by already show: its title heading and its
 * Status and Blocked by lines, taken only from the header (before the first other content line).
 */
export function ticketBody(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const dropped = new Set<string>()
  let start = 0
  for (; start < lines.length; start++) {
    const line = lines[start]
    if (line.trim() === '') continue
    const field = FIELD.exec(line.replace(/\*\*|__/g, ''))?.[1].toLowerCase()
    const key = field ?? (/^#\s+/.test(line) ? 'title' : null)
    if (key === null || dropped.has(key)) break
    dropped.add(key)
  }
  return lines.slice(start).join('\n')
}
