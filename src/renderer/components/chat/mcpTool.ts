const MCP_PREFIX = 'mcp__'
const SPELLINGS: Record<string, string> = { Github: 'GitHub', Pubmed: 'PubMed', Ai: 'AI' }
const DETAIL_KEYS = ['query', 'message', 'channel', 'repo', 'url', 'path', 'title', 'search', 'text'] as const

export interface McpToolTitle {
  server: string
  tool: string
  detail: string | null
}

/** The extension's `ITe`: each underscore-separated word capitalised, with a few brand spellings. */
function humanizeServer(server: string): string {
  return server
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .map((w) => SPELLINGS[w] ?? w)
    .join(' ')
}

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** The extension's `qIn`: the first telling string field of the input. */
function detailOf(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  for (const key of DETAIL_KEYS) {
    const v = o[key]
    if (typeof v !== 'string' || !v) continue
    if (key === 'channel') return `#${v}`
    if (key === 'url') {
      try {
        return new URL(v).hostname
      } catch {
        return cut(v, 30)
      }
    }
    return cut(v, 40)
  }
  return null
}

/** "Server [tool]" for an MCP tool (`mcp__server__tool`), as the extension's `NW` header; null for a built-in tool. */
export function mcpToolTitle(name: string, input: unknown): McpToolTitle | null {
  if (!name.startsWith(MCP_PREFIX)) return null
  const [server = '', ...rest] = name.slice(MCP_PREFIX.length).split('__')
  return { server: humanizeServer(server), tool: rest.join('__'), detail: detailOf(input) }
}
