import { describe, expect, it } from 'vitest'
import { actionKey, actionSegments } from './actionBlocks'
import { adoptFailureReport, adoptName, adoptOf, adoptOutcomeMessage, adoptedFirstPrompt, movedWorkPrompt, writeAdopt } from './adoptWork'
import type { ChatItem } from './chatItems'
import { housekeepingOf, housekeepingOutcomeMessage, housekeepingRequest, writeHousekeeping } from './housekeeping'
import { ACTION_BLOCKS, MAIN_CHAT_INSTRUCTIONS, mainChatCardStates } from './mainChatActions'
import { sendMessageOf, sendOutcomeMessage, writeSendMessage } from './sendMessage'

const parsed = (text: string) => actionSegments(text, ACTION_BLOCKS).filter((s) => s.kind !== 'text')
const reply = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, content: [{ type: 'text', text }], raw: {} as never })

describe('the adopt-work block', () => {
  it('parses with or without its optional path and name, and its rules reach the instructions', () => {
    expect(parsed(writeAdopt({ workspace: 'app', branch: 'spike/x' }))).toEqual([{ kind: 'block', tag: 'adopt-work', fields: { workspace: 'app', branch: 'spike/x' } }])
    const full = parsed(writeAdopt({ workspace: 'app', branch: 'b', path: 'C:\\wt\\b', name: 'b-2' }))[0]
    expect(full.kind === 'block' && adoptOf(full.fields)).toEqual({ workspace: 'app', branch: 'b', path: 'C:\\wt\\b', name: 'b-2' })
    expect(parsed('````adopt-work\nbranch: b\n````')[0].kind).toBe('invalid')
    expect(MAIN_CHAT_INSTRUCTIONS).toContain('````adopt-work\nworkspace: <the workspace label')
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/When the user says "adopt all" or names several, ask which ones first/)
  })

  it("names the feature after the branch's last segment, folder-safe", () => {
    expect(adoptName('feat/Login_Page')).toBe('login-page')
    expect(adoptName('spike/x/')).toBe('x')
    expect(adoptName('wip')).toBe('wip')
  })

  it('reads Done when older once a feature has the name it makes', () => {
    const items: ChatItem[] = [reply('a1', writeAdopt({ workspace: 'app', branch: 'feat/export' })), { kind: 'user', id: 'u', text: 'x' }]
    expect(mainChatCardStates(items, true, { featureNames: ['export'] }).get(actionKey('a1', 0, 0))).toBe('done')
    expect(mainChatCardStates(items, true, { featureNames: [] }).get(actionKey('a1', 0, 0))).toBe('superseded')
  })

  it('reports in one [Command Center] line, and a new session is told to read first', () => {
    expect(adoptOutcomeMessage('spike/x', 'app', { name: 'x', resumed: 'abc' })).toBe(
      '[Command Center] Adopted spike/x in app as the feature x; its session resumes the Claude session abc. It has left the Open work section. Confirm this to the user in words.'
    )
    expect(adoptOutcomeMessage('spike/x', 'app', { name: 'x', resumed: null })).toContain('a new session reads its .scratch notes and git log first')
    expect(adoptOutcomeMessage('b', 'app', { error: adoptFailureReport('b', 'worktree', 'fatal: no', ['the branch']) })).toBe(
      '[Command Center] Adopting b in app failed. Could not adopt b while making the worktree for the branch: fatal: no. Still to put back by hand: the branch. Nothing was retried. Report this to the user and wait for them.'
    )
    expect(adoptedFirstPrompt({ branch: 'b', worktreePath: 'C:\\wt' })).toBe('Adopted work: branch b in C:\\wt. Read its .scratch notes and git log -20 first, then summarise where it stands and wait.')
    expect(movedWorkPrompt({ branch: 'b', worktreePath: 'C:\\wt' }, 'C:\\app', 'main')).toMatch(/^This work moved: branch b is now in C:\\wt, and C:\\app is back on main\. Work only in C:\\wt/)
  })
})

describe('the send-message block', () => {
  it('keeps the message verbatim: several lines, fenced code and label-like lines included', () => {
    const message = 'Run the tests.\nfeature: not a part\n\n```sh\npnpm test\n```'
    const block = parsed(writeSendMessage({ feature: 'export', message }))[0]
    expect(block.kind === 'block' && sendMessageOf(block.fields)).toEqual({ feature: 'export', message })
    expect(writeSendMessage({ feature: 'export', message }).startsWith('````send-message\n')).toBe(true)
  })

  it('tells the chat to send only when asked, faithfully, one per message', () => {
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/when the user asks you to tell, ask or instruct a feature's session/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/never on your own initiative/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/One block per message/)
  })

  it('reports sent, sent after a wait, or not delivered', () => {
    expect(sendOutcomeMessage('export', { queued: false })).toBe('[Command Center] Sent to export. Confirm this to the user in words.')
    expect(sendOutcomeMessage('export', { queued: true })).toBe('[Command Center] Sent to export, once its turn had ended. Confirm this to the user in words.')
    expect(sendOutcomeMessage('export', { error: 'its session did not start.' })).toMatch(/^\[Command Center\] The message to export was not delivered: its session did not start\./)
  })
})

describe('the housekeeping block', () => {
  it('takes items for the git actions and a feature for complete-feature', () => {
    const git = parsed(writeHousekeeping({ action: 'delete-merged-branches', workspace: 'app', items: '- old-a\nold-b\n\nold-a' }))[0]
    expect(git.kind === 'block' && housekeepingRequest(housekeepingOf(git.fields), 'w1')).toEqual({
      ok: true,
      request: { workspaceId: 'w1', action: 'delete-merged-branches', items: ['old-a', 'old-b'] }
    })
    const done = parsed(writeHousekeeping({ action: 'complete-feature', workspace: 'app', feature: 'export' }))[0]
    expect(done.kind === 'block' && housekeepingRequest(housekeepingOf(done.fields), 'w1')).toEqual({ ok: true, request: { workspaceId: 'w1', action: 'complete-feature', items: ['export'] } })
  })

  it('refuses an unknown action or the wrong part for the action, and tells the chat never to write "all"', () => {
    expect(housekeepingRequest({ action: 'remove-everything', workspace: 'app', items: 'a' }, 'w')).toMatchObject({ ok: false, error: expect.stringMatching(/^Unknown housekeeping action remove-everything/) })
    expect(housekeepingRequest({ action: 'complete-feature', workspace: 'app', items: 'x' }, 'w')).toMatchObject({ ok: false })
    expect(housekeepingRequest({ action: 'remove-merged-worktrees', workspace: 'app', feature: 'x' }, 'w')).toMatchObject({ ok: false })
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/List every item explicitly, one per line, never "all"/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/say per item why it looks done/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/Branches to delete come from a workspace's "Merged, deletable:" line: propose delete-merged-branches with each of its names on its own line/)
  })

  it('reports a run that could not start', () => {
    expect(housekeepingOutcomeMessage('app', 'prune-missing-worktrees', { ok: false, error: 'That workspace no longer exists.' })).toBe(
      '[Command Center] Housekeeping in app did not run: That workspace no longer exists. Report this to the user and wait for them.'
    )
  })
})
