import type { ChatItem } from '../../shared/chatItems'
import type { BoardModel } from '../../shared/types'
import { findTicket, type FoundTicket } from './boardLayout'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

/** `.scratch/<feature>/issues/<NN-name>.md` or its `.progress.md`, with either slash. */
const TICKET_PATH = /\.scratch[\\/]+([^\\/\s"'`]+)[\\/]+issues[\\/]+(\d+[a-z]?-[^\\/\s"'`]+?)(?:\.progress)?\.md(?![\w.])/gi

interface TicketHit {
  featureName: string
  fileName: string
  /** The ticket file's own path (never its progress file) when the call named it absolutely. */
  path: string | null
}

/** Lower-cased with forward slashes, and Git Bash's `/c/` read as `c:/`. */
function pathKey(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/^\/([a-z])\//i, '$1:/').toLowerCase()
}

function hitsIn(text: string, absolute: boolean): TicketHit[] {
  const hits: TicketHit[] = []
  for (const match of text.matchAll(TICKET_PATH)) {
    const fileName = `${match[2]}.md`.toLowerCase()
    const path = absolute ? text.slice(0, match.index) + match[0].replace(/\.progress\.md$/i, '.md') : null
    hits.push({ featureName: match[1], fileName, path })
  }
  return hits
}

function locate(model: BoardModel, hit: TicketHit, repoGroupKey: string): FoundTicket | null {
  if (hit.path) {
    const key = pathKey(hit.path)
    for (const group of model.repoGroups) {
      for (const feature of group.features) {
        const ticket = feature.tickets.find((t) => t.sightings.some((s) => pathKey(s.filePath) === key))
        if (ticket) return { group, feature, ticket }
      }
    }
  }
  return findTicket(model, { repoGroupKey, featureName: hit.featureName, fileName: hit.fileName })
}

/**
 * The ticket a session works on: the newest ticket (or progress) file it wrote or edited, else the newest one it read
 * or named in a shell command, as the board knows it. Reads come second because a session reads tickets it is not
 * working on (blockers, the next one up). Paths in the session's own repo group resolve by feature and file name.
 */
export function currentTicket(items: readonly ChatItem[], model: BoardModel, repoGroupKey: string): FoundTicket | null {
  let read: FoundTicket | null = null
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant') continue
    for (let b = item.content.length - 1; b >= 0; b--) {
      const block = item.content[b]
      if (block.type !== 'tool_use') continue
      const name = String(block.name)
      const input = (block.input ?? {}) as { file_path?: unknown; command?: unknown }
      const shell = SHELL_TOOLS.has(name)
      const text = shell ? input.command : input.file_path
      if (typeof text !== 'string') continue
      const written = WRITE_TOOLS.has(name)
      for (const hit of hitsIn(text, !shell).reverse()) {
        const found = locate(model, hit, repoGroupKey)
        if (!found) continue
        if (written) return found
        read ??= found
      }
    }
  }
  return read
}
