import { describe, expect, it } from 'vitest'
import { appPrompt, appPromptLabel, knownAppPrompt, markAppPrompts, outgoing, type AppPromptKind } from './appPrompts'
import type { ChatItem } from './chatItems'
import { buildDriftCheck, driftCheckTitle } from './driftCheck'
import { fixMessage } from './fixMessage'

/** Every prompt the app writes, as its builder gives it. */
const SENT: readonly [AppPromptKind, string][] = [
  ['drift-check', buildDriftCheck({ kind: 'account', sessionPath: 'C:/app', account: { name: 'Personal', folder: 'C:/acc', items: [] }, projects: [], findingsFile: 'C:/f/run.json' }).prompt],
  ['fix-findings', fixMessage([], {})]
]

describe('the label of an app prompt', () => {
  it('names each kind in one line', () => {
    expect(appPromptLabel('drift-check')).toBe('Command Center · drift check instructions')
    expect(appPromptLabel('fix-findings')).toBe('Command Center · findings to fix')
  })

  it('shows a kind of a retired feature, kept in old history, as a plain app prompt', () => {
    expect(appPromptLabel('main-chat' as AppPromptKind)).toBe('Command Center · app prompt')
  })

  it("names a drift check's session as Context names the check", () => {
    expect(driftCheckTitle('project')).toBe('Drift check · This project')
    expect(driftCheckTitle('cross-project')).toBe('Drift check · Across projects')
  })
})

describe('knowing an app prompt by its shape', () => {
  it('knows every prompt the app writes', () => {
    for (const [kind, text] of SENT) expect(knownAppPrompt(text), text).toBe(kind)
  })

  it('leaves alone a typed prompt that starts the same way', () => {
    const typed = ['Drift check: is the README still right?', 'Fix findings: which ones matter?', '/flow add a login page', '']
    for (const text of typed) expect(knownAppPrompt(text), text).toBeNull()
  })
})

describe('marking items that arrived without their origin', () => {
  const user = (id: string, text: string, appPrompt?: AppPromptKind): ChatItem => ({ kind: 'user', id, text, ...(appPrompt ? { appPrompt } : {}) })

  it('marks the app prompts and keeps the typed ones and the marked ones as they are', () => {
    const items = [user('u1', SENT[0][1]), user('u2', 'what next?'), user('u3', 'Fix findings: done', 'fix-findings')]
    const marked = markAppPrompts(items)
    expect(marked.map((i) => (i.kind === 'user' ? i.appPrompt : null))).toEqual(['drift-check', undefined, 'fix-findings'])
    expect(marked[1]).toBe(items[1])
    expect(marked[2]).toBe(items[2])
  })

  it('returns the same list when nothing is an app prompt', () => {
    const items = [user('u1', 'hello'), { kind: 'system', id: 's', text: 'Drift check: check that the context files below still match the code' } as ChatItem]
    expect(markAppPrompts(items)).toBe(items)
  })
})

describe('a prompt on its way to a chat', () => {
  it('carries its origin when the app wrote it, and none when typed', () => {
    expect(outgoing(appPrompt('fix-findings', 'Fix findings: x', 'Drift check'))).toEqual({ text: 'Fix findings: x', origin: { kind: 'fix-findings', title: 'Drift check' } })
    expect(outgoing('hello')).toEqual({ text: 'hello' })
  })
})
