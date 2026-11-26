import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import type { BoardFeature, BoardModel, BoardTicket } from '../../shared/types'
import { currentTicket } from './currentTicket'

const ROOT = 'C:\\projects\\app'
const OTHER = 'C:\\projects\\other'

function ticket(root: string, feature: string, fileName: string): BoardTicket {
  return {
    number: fileName.slice(0, 2),
    fileName,
    title: fileName,
    summary: null,
    column: 'in-progress',
    status: 'in-progress',
    statusNote: null,
    statusLine: null,
    statusKnown: true,
    sightings: [
      {
        workspaceId: root,
        worktreeTag: '',
        column: 'in-progress',
        blockedBy: [],
        filePath: `${root}\\.scratch\\${feature}\\issues\\${fileName}`,
        progressPath: null,
        status: 'in-progress',
        statusNote: null,
        statusLine: null,
        statusKnown: true
      }
    ]
  }
}

function feature(root: string, name: string, files: string[]): BoardFeature {
  return {
    name,
    state: 'active',
    progress: { done: 0, total: files.length, lastNote: null },
    lastActivity: null,
    tickets: files.map((f) => ticket(root, name, f)),
    sightings: []
  }
}

const model: BoardModel = {
  repoGroups: [
    { repoGroupKey: 'app', repoName: 'app', features: [feature(ROOT, 'login', ['01-form.md', '02-reset.md'])] },
    { repoGroupKey: 'other', repoName: 'other', features: [feature(OTHER, 'login', ['01-form.md'])] }
  ]
}

const call = (name: string, input: Record<string, unknown>): ChatItem =>
  ({ kind: 'assistant', id: Math.random().toString(), content: [{ type: 'tool_use', id: 'x', name, input }], raw: {} }) as unknown as ChatItem

const found = (items: ChatItem[], repoGroupKey = 'app') => {
  const hit = currentTicket(items, model, repoGroupKey)
  return hit ? `${hit.group.repoGroupKey}/${hit.feature.name}/${hit.ticket.fileName}` : null
}

describe('current ticket', () => {
  it('is none before the session touches a ticket', () => {
    expect(found([call('Read', { file_path: `${ROOT}\\src\\a.ts` })])).toBeNull()
  })

  it('takes the newest ticket the session wrote, its progress file counting as the ticket', () => {
    expect(
      found([
        call('Edit', { file_path: `${ROOT}\\.scratch\\login\\issues\\01-form.md` }),
        call('Write', { file_path: `${ROOT}\\.scratch\\login\\issues\\02-reset.progress.md` })
      ])
    ).toBe('app/login/02-reset.md')
  })

  it('keeps the written ticket over a newer read, and falls back to the newest read when nothing was written', () => {
    const edit = call('Edit', { file_path: `${ROOT}\\.scratch\\login\\issues\\01-form.md` })
    const read = call('Read', { file_path: `${ROOT}\\.scratch\\login\\issues\\02-reset.md` })
    expect(found([edit, read])).toBe('app/login/01-form.md')
    expect(found([read])).toBe('app/login/02-reset.md')
  })

  it('reads a shell command naming a ticket, relative or in Git Bash form, in the session’s repo group', () => {
    expect(found([call('Bash', { command: 'cat .scratch/login/issues/02-reset.md | head' })])).toBe('app/login/02-reset.md')
    expect(found([call('Bash', { command: 'sed -n 1,9p /c/projects/app/.scratch/login/issues/01-form.md' })])).toBe('app/login/01-form.md')
  })

  it('finds an absolutely named ticket in another repo group by its path', () => {
    expect(found([call('Read', { file_path: 'C:/projects/other/.scratch/login/issues/01-form.md' })])).toBe('other/login/01-form.md')
  })

  it('skips a path the board does not know', () => {
    expect(found([call('Read', { file_path: `${ROOT}\\.scratch\\login\\issues\\01-form.md` }), call('Write', { file_path: `${ROOT}\\.scratch\\gone\\issues\\09-x.md` })])).toBe(
      'app/login/01-form.md'
    )
  })
})
