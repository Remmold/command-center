import { join } from 'node:path'
import type {
  BoardColumn,
  BoardFeature,
  BoardModel,
  BoardRepoGroup,
  BoardTicket,
  FeatureProgress,
  FeatureSighting,
  FeatureState,
  TicketNumber,
  TicketSighting,
  TicketStatus,
  Workspace
} from '../../shared/types'
import { groupByRepo } from '../../shared/repoGroups'
import { wordColumn } from '../../shared/ticketWords'

export interface DirEntry {
  name: string
  isDirectory: boolean
}

/** Missing paths read as an empty listing or null, never as an error. */
export interface BoardFileReader {
  listDir(path: string): Promise<DirEntry[]>
  readFile(path: string): Promise<string | null>
  /** Modification time in epoch ms. */
  modifiedAt(path: string): Promise<number | null>
}

/** A git worktree of an added repo that isn't itself an added workspace, read as one more copy. */
export interface ExtraCopy {
  repoGroupKey: string
  path: string
  /** The branch, or the folder name when detached. */
  worktreeTag: string
}

export function extraCopyId(path: string): string {
  return `worktree:${path}`
}

interface CopySource {
  id: string
  path: string
  worktreeTag: string
}

const COLUMN_RANK: Record<BoardColumn, number> = { backlog: 0, blocked: 1, 'in-progress': 2, done: 3 }
const TICKET_FILE = /^(\d+[a-z]?)-(.+)\.md$/i
const PROGRESS_SUFFIX = '.progress.md'

interface ParsedTicket {
  number: TicketNumber
  fileName: string
  title: string
  status: TicketStatus
  blockedBy: TicketNumber[]
  filePath: string
  progressPath: string | null
}

interface FeatureCopy {
  sighting: FeatureSighting
  noteLines: string[]
  notesChangedAt: number | null
  tickets: ParsedTicket[]
}

function toTicketNumber(raw: string): TicketNumber {
  const [, digits, suffix] = /^(\d+)([a-z]?)$/i.exec(raw) ?? ['', raw, '']
  return String(Number(digits)).padStart(2, '0') + suffix.toLowerCase()
}

function compareTicketNumbers(a: TicketNumber, b: TicketNumber): number {
  return parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b)
}

function field(markdown: string, name: string): string | null {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s+)?${name}\\s*:\\s*(.*)$`, 'i')
  for (const line of markdown.split(/\r?\n/)) {
    const match = pattern.exec(line.replace(/\*\*|__/g, ''))
    if (match) return match[1].trim()
  }
  return null
}

const NO_STATUS: TicketStatus = { status: null, statusNote: null, statusLine: null, statusKnown: true }

function parseStatus(markdown: string): TicketStatus {
  const line = field(markdown, 'status')
  const match = line ? /^([^\s—]+)(.*)$/s.exec(line) : null
  if (!line || !match) return NO_STATUS
  const status = match[1].toLowerCase()
  const note = match[2].replace(/^[\s—–-]+/, '').trim()
  return { status, statusNote: note || null, statusLine: line, statusKnown: wordColumn(status) !== null }
}


function parseTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]
  if (!heading) return fallback
  return heading.replace(/^\d+[a-z]?\s*[:.-]\s*/i, '').trim()
}

/** Reads leading items that start with a ticket number; the first other item (prose, another feature's name) ends the list. */
function parseBlockedBy(markdown: string): TicketNumber[] {
  const value = field(markdown, 'blocked by')
  if (!value || /^none\b/i.test(value)) return []
  const numbers: TicketNumber[] = []
  for (const item of value.split(/[,;]|\band\b/i)) {
    const match = /^\s*#?(\d+[a-z]?)(?![\w'])/i.exec(item)
    if (!match) break
    numbers.push(toTicketNumber(match[1]))
  }
  return numbers
}

function isDone(status: TicketStatus): boolean {
  return wordColumn(status.status) === 'done'
}

function columnOf(ticket: ParsedTicket, resolved: Set<TicketNumber>): BoardColumn {
  const byWord = wordColumn(ticket.status.status)
  if (byWord === 'done') return 'done'
  if (byWord === 'blocked' || ticket.blockedBy.some((n) => !resolved.has(n))) return 'blocked'
  if (byWord === 'in-progress' || ticket.progressPath !== null) return 'in-progress'
  return 'backlog'
}

async function listFileNames(dir: string, files: BoardFileReader): Promise<string[]> {
  return (await files.listDir(dir)).filter((e) => !e.isDirectory).map((e) => e.name)
}

async function readTickets(issuesDir: string, files: BoardFileReader): Promise<ParsedTicket[]> {
  const names = await listFileNames(issuesDir, files)
  const lowerNames = new Set(names.map((n) => n.toLowerCase()))
  const tickets: ParsedTicket[] = []
  for (const name of names) {
    if (name.toLowerCase().endsWith(PROGRESS_SUFFIX)) continue
    const match = TICKET_FILE.exec(name)
    if (!match) continue
    const filePath = join(issuesDir, name)
    const markdown = await files.readFile(filePath)
    if (markdown === null) continue
    const progressName = name.slice(0, -'.md'.length) + PROGRESS_SUFFIX
    tickets.push({
      number: toTicketNumber(match[1]),
      fileName: name.toLowerCase(),
      title: parseTitle(markdown, match[2]),
      status: parseStatus(markdown),
      blockedBy: parseBlockedBy(markdown),
      filePath,
      progressPath: lowerNames.has(progressName.toLowerCase()) ? join(issuesDir, progressName) : null
    })
  }
  return tickets
}

function newest(times: Array<number | null>): number | null {
  return times.reduce<number | null>((best, t) => (t !== null && (best === null || t > best) ? t : best), null)
}

async function newestChange(paths: Array<string | null>, files: BoardFileReader): Promise<number | null> {
  const present = paths.filter((p): p is string => p !== null)
  return newest(await Promise.all(present.map((p) => files.modifiedAt(p))))
}

async function readFeatureCopies(source: CopySource, files: BoardFileReader): Promise<Map<string, FeatureCopy>> {
  const scratch = join(source.path, '.scratch')
  const copies = new Map<string, FeatureCopy>()
  for (const entry of await files.listDir(scratch)) {
    if (!entry.isDirectory) continue
    const dir = join(scratch, entry.name)
    const ownFiles = new Set((await listFileNames(dir, files)).map((n) => n.toLowerCase()))
    const pathIfPresent = (name: string): string | null => (ownFiles.has(name) ? join(dir, name) : null)
    const specPath = pathIfPresent('spec.md')
    const progressPath = pathIfPresent('progress.md')
    const notes = progressPath ? await files.readFile(progressPath) : null
    const tickets = await readTickets(join(dir, 'issues'), files)
    const featureFiles = [specPath, progressPath, ...tickets.flatMap((t) => [t.filePath, t.progressPath])]
    copies.set(entry.name, {
      sighting: {
        workspaceId: source.id,
        worktreeTag: source.worktreeTag,
        specPath,
        progressPath,
        lastActivity: await newestChange(featureFiles, files)
      },
      noteLines: (notes ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== ''),
      notesChangedAt: await newestChange([progressPath], files),
      tickets
    })
  }
  return copies
}

/** A number is resolved once every ticket file carrying it is done in at least one worktree copy. */
function resolvedNumbers(copies: FeatureCopy[]): Set<TicketNumber> {
  const doneByFile = new Map<string, { number: TicketNumber; done: boolean }>()
  for (const copy of copies) {
    for (const t of copy.tickets) {
      const prev = doneByFile.get(t.fileName)
      doneByFile.set(t.fileName, { number: t.number, done: (prev?.done ?? false) || isDone(t.status) })
    }
  }
  const open = new Set([...doneByFile.values()].filter((f) => !f.done).map((f) => f.number))
  return new Set([...doneByFile.values()].map((f) => f.number).filter((n) => !open.has(n)))
}

function progressOf(tickets: BoardTicket[], copies: FeatureCopy[]): FeatureProgress {
  const latest = copies
    .filter((c) => c.noteLines.length > 0)
    .reduce<FeatureCopy | null>((best, c) => {
      if (!best) return c
      const byTime = (c.notesChangedAt ?? 0) - (best.notesChangedAt ?? 0)
      return byTime > 0 || (byTime === 0 && c.noteLines.length > best.noteLines.length) ? c : best
    }, null)
  return {
    done: tickets.filter((t) => t.column === 'done').length,
    total: tickets.length,
    lastNote: latest?.noteLines.at(-1) ?? null
  }
}

function stateOf(progress: FeatureProgress, copies: FeatureCopy[]): FeatureState {
  if (progress.total > 0) return progress.done === progress.total ? 'finished' : 'active'
  return copies.some((c) => c.sighting.specPath !== null) ? 'spec-only' : 'empty'
}

/** resolved > in-progress > blocked > ready > needs-*, so ready outranks needs-* inside Backlog. */
function rankOf(sighting: TicketSighting): number {
  const ready = sighting.column === 'backlog' && sighting.status?.startsWith('ready-') === true
  return COLUMN_RANK[sighting.column] * 2 + (ready ? 1 : 0)
}

function buildFeature(name: string, copies: FeatureCopy[]): BoardFeature {
  const resolved = resolvedNumbers(copies)
  const byFile = new Map<string, Array<{ parsed: ParsedTicket; sighting: TicketSighting }>>()
  for (const copy of copies) {
    for (const t of copy.tickets) {
      const sighting: TicketSighting = {
        workspaceId: copy.sighting.workspaceId,
        worktreeTag: copy.sighting.worktreeTag,
        column: columnOf(t, resolved),
        ...t.status,
        blockedBy: t.blockedBy,
        filePath: t.filePath,
        progressPath: t.progressPath
      }
      const list = byFile.get(t.fileName)
      if (list) list.push({ parsed: t, sighting })
      else byFile.set(t.fileName, [{ parsed: t, sighting }])
    }
  }
  const tickets: BoardTicket[] = [...byFile].map(([fileName, list]) => {
    const ranked = [...list].sort((a, b) => rankOf(b.sighting) - rankOf(a.sighting))
    const { parsed, sighting } = ranked[0]
    return {
      number: parsed.number,
      fileName,
      title: parsed.title,
      column: sighting.column,
      ...parsed.status,
      sightings: ranked.map((r) => r.sighting)
    }
  })
  tickets.sort((a, b) => compareTicketNumbers(a.number, b.number) || a.fileName.localeCompare(b.fileName))
  const progress = progressOf(tickets, copies)
  const sightings = copies.map((c) => c.sighting)
  return {
    name,
    state: stateOf(progress, copies),
    progress,
    lastActivity: newest(sightings.map((s) => s.lastActivity)),
    tickets,
    sightings
  }
}

/** Copies are read main checkout first, then added workspaces, then extras, so a tie keeps the main checkout's status. */
export async function readBoard(workspaces: Workspace[], files: BoardFileReader, extras: ExtraCopy[] = []): Promise<BoardModel> {
  const repoGroups: BoardRepoGroup[] = []
  for (const group of groupByRepo(workspaces)) {
    const sources: CopySource[] = [
      ...group.workspaces.map((w) => ({ id: w.id, path: w.path, worktreeTag: w.worktreeTag })),
      ...extras
        .filter((e) => e.repoGroupKey === group.repoGroupKey)
        .map((e) => ({ id: extraCopyId(e.path), path: e.path, worktreeTag: e.worktreeTag }))
    ].sort((a, b) => Number(a.worktreeTag !== '') - Number(b.worktreeTag !== ''))
    const copiesByFeature = new Map<string, FeatureCopy[]>()
    for (const sourceCopies of await Promise.all(sources.map((s) => readFeatureCopies(s, files)))) {
      for (const [name, copy] of sourceCopies) {
        const list = copiesByFeature.get(name)
        if (list) list.push(copy)
        else copiesByFeature.set(name, [copy])
      }
    }
    repoGroups.push({
      repoGroupKey: group.repoGroupKey,
      repoName: group.repoName,
      features: [...copiesByFeature]
        .map(([name, copies]) => buildFeature(name, copies))
        .sort((a, b) => a.name.localeCompare(b.name))
    })
  }
  return { repoGroups }
}
