import { compactLabel } from './compaction'
import type { ChatItem } from './types'
import type { ContentBlock } from '../../../shared/types'

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === 'object' && 'text' in c) {
          return String((c as { text: unknown }).text)
        }
        return JSON.stringify(c)
      })
      .join('\n')
  }
  return JSON.stringify(content, null, 2)
}

function blockToMarkdown(block: ContentBlock): string {
  if (block.type === 'text') return (block as { text: string }).text + '\n\n'
  if (block.type === 'tool_use') {
    const b = block as { name: string; input: unknown }
    return `\n**\`${b.name}\` tool call**\n\n\`\`\`json\n${JSON.stringify(
      b.input,
      null,
      2
    )}\n\`\`\`\n\n`
  }
  return ''
}

export function itemsToMarkdown(items: ChatItem[], title?: string): string {
  const lines: string[] = []
  if (title) lines.push(`# ${title}\n`)
  lines.push(`_Exported from command-center on ${new Date().toISOString()}_\n`)
  for (const item of items) {
    switch (item.kind) {
      case 'user':
        lines.push(`\n---\n\n## 🧑 You\n\n${item.text}\n`)
        break
      case 'assistant': {
        lines.push(`\n## 🤖 Claude\n`)
        for (const block of item.content) {
          lines.push(blockToMarkdown(block))
        }
        break
      }
      case 'tool_result': {
        const label = item.isError ? '❌ Tool error' : '✅ Tool result'
        lines.push(
          `\n### ${label}\n\n\`\`\`\n${stringifyToolResult(item.content)}\n\`\`\`\n`
        )
        break
      }
      case 'result': {
        const dur = item.durationMs !== undefined ? `${(item.durationMs / 1000).toFixed(1)}s` : ''
        lines.push(
          `\n_Turn complete · ${dur}${
            item.numTurns ? ` · ${item.numTurns} turn(s)` : ''
          }_\n`
        )
        break
      }
      case 'system':
        if (item.compact) lines.push(`\n_${compactLabel(item.compact)}_\n`)
        else if (item.text) lines.push(`\n_${item.text}_\n`)
        break
    }
  }
  return lines.join('')
}
