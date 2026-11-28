import { describe, expect, it } from 'vitest'
import { adoptOutcomeMessage, adoptedFirstPrompt, movedWorkPrompt } from './adoptWork'
import { appPrompt, appPromptLabel, knownAppPrompt, markAppPrompts, outgoing, type AppPromptKind } from './appPrompts'
import type { ChatItem } from './chatItems'
import { featureFirstPrompt, startOutcomeMessage } from './features'
import { buildDriftCheck, driftCheckTitle } from './driftCheck'
import { fixMessage } from './fixMessage'
import { housekeepingOutcomeMessage } from './housekeeping'
import { buildPreviewSetupPrompt } from './previewSetup'
import { mainChatFirstPrompt } from './mainChat'
import { sendOutcomeMessage } from './sendMessage'

const DIGEST = 'C:\\data\\feature-digest\\feature-digest.md'
const FEATURE = { name: 'add-export', branch: 'feature/add-export', worktreePath: 'C:\\repos\\app-worktrees\\add-export' }

/** Every prompt the app writes, as its builder gives it. */
const SENT: readonly [AppPromptKind, string][] = [
  ['main-chat', mainChatFirstPrompt(DIGEST)],
  ['main-chat', mainChatFirstPrompt(DIGEST, { name: 'add-export', workspace: 'app' })],
  ['feature-start', featureFirstPrompt(FEATURE, 'Export the report as CSV')],
  ['feature-start', featureFirstPrompt(FEATURE, 'Export the report\nas CSV, two lines', true, 'C:\\repos\\app-worktrees\\add-export\\.scratch\\add-export\\brief.md')],
  ['adopt-start', adoptedFirstPrompt({ branch: 'spike/old-idea', worktreePath: 'C:\\repos\\app-spike' })],
  ['work-moved', movedWorkPrompt({ branch: 'try-move', worktreePath: 'C:\\repos\\app-worktrees\\try-move' }, 'C:\\repos\\app', 'main')],
  ['outcome', startOutcomeMessage('add-export', null)],
  ['outcome', startOutcomeMessage('add-export', 'The branch exists.')],
  ['outcome', adoptOutcomeMessage('try-move', 'app', { name: 'try-move', resumed: 'abc' })],
  ['outcome', adoptOutcomeMessage('try-move', 'app', { error: 'Could not adopt try-move.' })],
  ['outcome', sendOutcomeMessage('add-export', { queued: true })],
  ['outcome', sendOutcomeMessage('add-export', { error: 'the session did not start.' })],
  ['outcome', housekeepingOutcomeMessage('app', 'delete-merged-branches', { ok: true, results: [{ item: 'a', ok: true }], skipped: [] })],
  ['drift-check', buildDriftCheck({ kind: 'account', sessionPath: 'C:/app', account: { name: 'Personal', folder: 'C:/acc', items: [] }, projects: [], findingsFile: 'C:/f/run.json' }).prompt],
  ['fix-findings', fixMessage([], {})],
  ['preview-setup', buildPreviewSetupPrompt({ draftFile: 'C:/drafts/preview.json' })]
]

describe('the label of an app prompt', () => {
  it('names each kind in one line', () => {
    expect(appPromptLabel('main-chat', mainChatFirstPrompt(DIGEST))).toBe('Command Center · main chat instructions')
    expect(appPromptLabel('feature-start', featureFirstPrompt(FEATURE, 'x'))).toBe('Command Center · started feature with /flow')
    expect(appPromptLabel('feature-start', featureFirstPrompt(FEATURE, 'x', false, 'C:\\b\\brief.md'))).toBe('Command Center · started feature with /flow and its brief')
    expect(appPromptLabel('adopt-start', SENT[4][1])).toBe('Command Center · adopted work, read its notes first')
    expect(appPromptLabel('work-moved', SENT[5][1])).toBe('Command Center · told the session where its work moved')
    expect(appPromptLabel('drift-check', SENT[13][1])).toBe('Command Center · drift check instructions')
    expect(appPromptLabel('fix-findings', SENT[14][1])).toBe('Command Center · findings to fix')
    expect(appPromptLabel('preview-setup', SENT[15][1])).toBe('Command Center · preview setup instructions')
  })

  it("names a drift check's session as Context names the check", () => {
    expect(driftCheckTitle('project')).toBe('Drift check · This project')
    expect(driftCheckTitle('cross-project')).toBe('Drift check · Across projects')
  })

  it('gives an outcome line its own first clause', () => {
    expect(appPromptLabel('outcome', adoptOutcomeMessage('try-move', 'app', { name: 'try-move', resumed: null }))).toBe('Command Center · Adopted try-move in app as the feature try-move')
    expect(appPromptLabel('outcome', startOutcomeMessage('add-export', null))).toBe('Command Center · The feature add-export started in its own session')
    expect(appPromptLabel('outcome', startOutcomeMessage('add-export', 'The branch exists.'))).toBe('Command Center · The feature add-export did not start')
    expect(appPromptLabel('outcome', sendOutcomeMessage('add-export', { queued: false }))).toBe('Command Center · Sent to add-export')
    expect(appPromptLabel('outcome', SENT[12][1])).toBe('Command Center · Housekeeping in app: deleted 1, skipped 0, failed 0')
  })

  it('keeps a dot inside a name, and shortens a long clause', () => {
    expect(appPromptLabel('outcome', sendOutcomeMessage('v1.2-fix', { queued: false }))).toBe('Command Center · Sent to v1.2-fix')
    const long = appPromptLabel('outcome', `[Command Center] The message to x was not delivered: ${'a'.repeat(120)}`)
    expect(long.length).toBeLessThanOrEqual('Command Center · '.length + 80)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('knowing an app prompt by its shape', () => {
  it('knows every prompt the app writes', () => {
    for (const [kind, text] of SENT) expect(knownAppPrompt(text), text).toBe(kind)
  })

  it('leaves alone a typed prompt that mentions Command Center or starts the same way', () => {
    const typed = [
      'How does Command Center start a feature?',
      'Command Center] Adopted x',
      'Tell me what [Command Center] messages mean',
      ' [Command Center] Sent to x.',
      'You are the main chat of Command Center, right?',
      '/flow add a login page',
      '/flow add a login page\n\nFeature name: login',
      'Adopted work: what does that mean?',
      'This work moved to another repo',
      'Drift check: is the README still right?',
      'Fix findings: which ones matter?',
      'Set up preview for me please',
      ''
    ]
    for (const text of typed) expect(knownAppPrompt(text), text).toBeNull()
  })
})

describe('marking items that arrived without their origin', () => {
  const user = (id: string, text: string, appPrompt?: AppPromptKind): ChatItem => ({ kind: 'user', id, text, ...(appPrompt ? { appPrompt } : {}) })

  it('marks the app prompts and keeps the typed ones and the marked ones as they are', () => {
    const items = [user('u1', mainChatFirstPrompt(DIGEST)), user('u2', 'what next?'), user('u3', '[Command Center] Sent to x.', 'outcome')]
    const marked = markAppPrompts(items)
    expect(marked.map((i) => (i.kind === 'user' ? i.appPrompt : null))).toEqual(['main-chat', undefined, 'outcome'])
    expect(marked[1]).toBe(items[1])
    expect(marked[2]).toBe(items[2])
  })

  it('returns the same list when nothing is an app prompt', () => {
    const items = [user('u1', 'hello'), { kind: 'system', id: 's', text: '[Command Center] Sent to x.' } as ChatItem]
    expect(markAppPrompts(items)).toBe(items)
  })
})

describe('a prompt on its way to a chat', () => {
  it('carries its origin when the app wrote it, and none when typed', () => {
    expect(outgoing(appPrompt('outcome', '[Command Center] Sent to x.', 'Main chat'))).toEqual({ text: '[Command Center] Sent to x.', origin: { kind: 'outcome', title: 'Main chat' } })
    expect(outgoing('hello')).toEqual({ text: 'hello' })
  })
})
