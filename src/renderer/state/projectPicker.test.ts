import { describe, expect, it } from 'vitest'
import type { LocalSessionInfo, Workspace } from '../../shared/types'
import { enterAction, sessionRows, startStep, stepBack, touchRecent, type SessionWhereabouts } from './projectPicker'
import { workspacePicks } from './workspacePicker'

const workspace = (id: string, repoName: string, worktreeTag = ''): Workspace => ({
  id,
  name: repoName,
  path: `C:/src/${id}`,
  createdAt: 0,
  profileId: 'default',
  repoGroupKey: `key-${repoName}`,
  repoName,
  worktreeTag
})

const WORKSPACES = [workspace('cc', 'command-center'), workspace('dc', 'darkfall-companion'), workspace('mm', 'mmorpg')]

const session = (sessionId: string, title: string, modifiedAt: number, gitBranch?: string): LocalSessionInfo => ({
  sessionId,
  title,
  modifiedAt,
  titleSource: 'claude',
  preview: title,
  gitBranch
})

const nowhere: SessionWhereabouts = () => ({})

describe('project order', () => {
  const order = (recent: Record<string, number>, query = '') =>
    workspacePicks({ workspaces: WORKSPACES, identities: {}, query, recent }).map((p) => p.workspace.id)

  it('puts recently used projects first, most recent first, then the rest by name', () => {
    expect(order({ mm: 10, dc: 20 })).toEqual(['dc', 'mm', 'cc'])
    expect(order({})).toEqual(['cc', 'dc', 'mm'])
  })

  it('keeps the recency order while filtering', () => {
    expect(order({ dc: 20 }, 'a')).toEqual(['dc', 'cc'])
  })

  it('records a use as the newest, keeping at most 50', () => {
    expect(touchRecent({ a: 1, b: 2 }, 'a', 3)).toEqual({ a: 3, b: 2 })
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`w${i}`, i]))
    const touched = touchRecent(many, 'new', 100)
    expect(Object.keys(touched)).toHaveLength(50)
    expect(touched.new).toBe(100)
    expect(touched.w0).toBeUndefined()
  })
})

describe('where the picker starts', () => {
  it('opens at the focused chat’s project, else at the project list', () => {
    expect(startStep('dc', WORKSPACES)).toEqual({ kind: 'sessions', workspaceId: 'dc' })
    expect(startStep(null, WORKSPACES)).toEqual({ kind: 'projects' })
    expect(startStep('gone', WORKSPACES)).toEqual({ kind: 'projects' })
  })
})

describe('session rows', () => {
  const SESSIONS = [session('a', 'Old login fix', 1, 'feature/oauth'), session('b', 'Tidy the readme', 3, 'main'), session('c', 'Add a test', 2)]

  it('lists newest first and filters by title or branch, ignoring case', () => {
    expect(sessionRows({ sessions: SESSIONS, query: '', showAll: false }).shown.map((s) => s.sessionId)).toEqual(['b', 'c', 'a'])
    expect(sessionRows({ sessions: SESSIONS, query: 'OAUTH', showAll: false }).shown.map((s) => s.sessionId)).toEqual(['a'])
    expect(sessionRows({ sessions: SESSIONS, query: 'readme', showAll: false }).shown.map((s) => s.sessionId)).toEqual(['b'])
  })

  it('shows the 50 newest and counts the rest until Show all', () => {
    const many = Array.from({ length: 53 }, (_, i) => session(`s${i}`, `Chat ${i}`, i))
    const capped = sessionRows({ sessions: many, query: '', showAll: false })
    expect(capped.shown).toHaveLength(50)
    expect(capped.shown[0].sessionId).toBe('s52')
    expect(capped.hidden).toBe(3)
    const all = sessionRows({ sessions: many, query: '', showAll: true })
    expect(all.shown).toHaveLength(53)
    expect(all.hidden).toBe(0)
  })
})

describe('what Enter does', () => {
  const dc = { kind: 'sessions', workspaceId: 'dc' } as const
  const old = session('a', 'Old login fix', 1)

  it('a project opens its sessions', () => {
    expect(enterAction({ kind: 'projects' }, { kind: 'project', workspaceId: 'dc' }, nowhere)).toEqual({ kind: 'open-project', workspaceId: 'dc' })
  })

  it('New chat starts a chat in the project', () => {
    expect(enterAction(dc, { kind: 'new-chat' }, nowhere)).toEqual({ kind: 'new-chat', workspaceId: 'dc' })
  })

  it('a session resumes, or switches to the tab already showing it', () => {
    expect(enterAction(dc, { kind: 'session', session: old }, nowhere)).toEqual({ kind: 'resume', workspaceId: 'dc', session: old })
    expect(enterAction(dc, { kind: 'session', session: old }, () => ({ paneId: 'p1' }))).toEqual({ kind: 'switch', paneId: 'p1', workspaceId: 'dc', session: old })
  })

  it('a session live in VS Code offers the take-over', () => {
    expect(enterAction(dc, { kind: 'session', session: old }, () => ({ vsCodeWorkspaceId: 'dc' }))).toEqual({
      kind: 'take-over',
      target: { workspaceId: 'dc', sessionId: 'a', title: 'Old login fix' }
    })
  })

  it('a tab here wins over the same session in VS Code', () => {
    expect(enterAction(dc, { kind: 'session', session: old }, () => ({ paneId: 'p1', vsCodeWorkspaceId: 'dc' }))).toEqual({
      kind: 'switch',
      paneId: 'p1',
      workspaceId: 'dc',
      session: old
    })
  })

  it('Show all lists every session', () => {
    expect(enterAction(dc, { kind: 'show-all' }, nowhere)).toEqual({ kind: 'show-all' })
  })
})

describe('back', () => {
  it('goes from a project’s sessions to the project list, and stays there', () => {
    expect(stepBack({ kind: 'sessions', workspaceId: 'dc' })).toEqual({ kind: 'projects' })
    expect(stepBack({ kind: 'projects' })).toEqual({ kind: 'projects' })
  })
})
