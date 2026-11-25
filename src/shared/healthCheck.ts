import type { ContextItem, ContextReport } from './context'
import type { Finding } from './findings'

/** Claude loads MEMORY.md up to this many lines and bytes; the rest never reaches a chat. */
export const MEMORY_LINE_LIMIT = 200
export const MEMORY_BYTE_LIMIT = 25_600
/** Claude Code warns about a CLAUDE.md longer than this. */
export const CLAUDE_MD_CHAR_LIMIT = 40_000

type Rule = 'memory-long' | 'missing-target' | 'unindexed' | 'claude-md-long' | 'unmatched-link'

const CLAUDE_MD_KINDS: ReadonlySet<ContextItem['kind']> = new Set(['claude-md', 'import', 'subfolder-claude-md'])

const count = (n: number): string => n.toLocaleString('en-US')
const plural = (n: number, word: string): string => `${count(n)} ${word}${n === 1 ? '' : 's'}`

/** FNV-1a, so an id needs no crypto and runs in the renderer. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

function finding(rule: Rule, path: string, detail: string, severity: Finding['severity'], text: Pick<Finding, 'claim' | 'evidence' | 'fix'>): Finding {
  return { id: `H-${rule}-${hash(`${path}\n${detail}`)}`, path, verdict: 'structural', severity, ...text, status: 'open' }
}

/** The first line Claude doesn't load in full, 1-based; null when it loads all of it. */
function firstCutLine(lineEnds: readonly number[]): number | null {
  const pastBytes = lineEnds.findIndex((end) => end > MEMORY_BYTE_LIMIT)
  const cuts = [lineEnds.length > MEMORY_LINE_LIMIT ? MEMORY_LINE_LIMIT + 1 : null, pastBytes === -1 ? null : pastBytes + 1].filter((n): n is number => n !== null)
  return cuts.length ? Math.min(...cuts) : null
}

function itemFindings(item: ContextItem): Finding[] {
  const path = item.path
  if (path === null) return []
  const out: Finding[] = []
  const index = item.kind === 'memory-index' ? item.index : undefined
  const cut = index ? firstCutLine(index.lineEnds) : null
  if (index && cut !== null) {
    const lost = index.lines - cut + 1
    out.push(
      finding('memory-long', path, '', 'problem', {
        claim: `MEMORY.md is ${plural(index.lines, 'line')}, but Claude loads only the first ${MEMORY_LINE_LIMIT} lines or ${count(MEMORY_BYTE_LIMIT)} bytes: from line ${cut} on, ${plural(lost, 'line')} ${lost === 1 ? 'is' : 'are'} cut off and never ${lost === 1 ? 'reaches' : 'reach'} a chat in full.`,
        evidence: `${plural(index.lines, 'line')}, ${plural(index.bytes, 'byte')}; the limits are ${MEMORY_LINE_LIMIT} lines and ${count(MEMORY_BYTE_LIMIT)} bytes.`,
        fix: `Shorten MEMORY.md below ${MEMORY_LINE_LIMIT} lines and ${count(MEMORY_BYTE_LIMIT)} bytes: merge or drop index lines, or move detail into the memory files.`
      })
    )
  }
  const repeats = new Map<string, number>()
  for (const { line, target } of index?.missingTargets ?? []) {
    const n = (repeats.get(target) ?? 0) + 1
    repeats.set(target, n)
    out.push(
      finding('missing-target', path, n === 1 ? target : `${target}#${n}`, 'problem', {
        claim: `MEMORY.md links ${target}, which is not there.`,
        evidence: `Line ${line} of MEMORY.md points at ${target}; no such file is in the memory folder.`,
        fix: 'Point the line at the right memory file, or remove it.'
      })
    )
  }
  if (item.kind === 'memory-file' && item.indexed === false) {
    out.push(
      finding('unindexed', path, '', 'problem', {
        claim: `${item.label} is not linked from MEMORY.md, so Claude never finds it.`,
        evidence: `No markdown link in MEMORY.md points at ${item.label}.`,
        fix: 'Add an index line for it to MEMORY.md, or delete it if it is no longer true.'
      })
    )
  }
  if (CLAUDE_MD_KINDS.has(item.kind) && item.chars !== undefined && item.chars > CLAUDE_MD_CHAR_LIMIT) {
    out.push(
      finding('claude-md-long', path, '', 'problem', {
        claim: `${item.label} is ${plural(item.chars, 'character')}, over the ${count(CLAUDE_MD_CHAR_LIMIT)} Claude Code warns about.`,
        evidence: `${plural(item.chars, 'character')} in ${path}.`,
        fix: `Trim it below ${count(CLAUDE_MD_CHAR_LIMIT)} characters: move detail Claude rarely needs into a skill, a subfolder CLAUDE.md or a doc.`
      })
    )
  }
  for (const name of item.unmatchedLinks ?? []) {
    out.push(
      finding('unmatched-link', path, name, 'note', {
        claim: `[[${name}]] in ${item.label} matches no memory file.`,
        evidence: `No memory file is named ${name}.md or has the frontmatter name ${name}.`,
        fix: 'Nothing, if it marks a memory still to write; otherwise point it at the right memory file.'
      })
    )
  }
  return [...out, ...item.children.flatMap(itemFindings)]
}

/** The free checks on a report, with no tokens: MEMORY.md past what Claude loads, unindexed memory, dead index lines, long CLAUDE.md files, unmatched `[[links]]` as notes. */
export function healthCheck(report: ContextReport): Finding[] {
  return [...report.layers.account, ...report.layers.repo, ...report.layers.local].flatMap(itemFindings)
}
