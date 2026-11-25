import { describe, expect, it } from 'vitest'
import type { AssistantMessageItem } from './chatItems'
import { findTestFlow, repoNameFor } from './testFlow'

const FOLDER = 'C:\\projects\\test-flows'

function call(id: string, name: string, input: unknown, parentToolUseId?: string): AssistantMessageItem {
  const content = [{ type: 'tool_use' as const, id: `${id}-call`, name, input }]
  return {
    kind: 'assistant',
    id,
    content,
    raw: { type: 'assistant', message: { id, role: 'assistant', content } },
    ...(parentToolUseId ? { parentToolUseId } : {})
  } as AssistantMessageItem
}

describe('finding a session test flow', () => {
  it('takes the file a Write call put in the folder', () => {
    const items = [call('a', 'Write', { file_path: 'C:\\projects\\test-flows\\continuum-1220-ai-person-card.md', content: '# run' })]
    expect(findTestFlow({ items, folder: FOLDER, repoName: 'continuum' })).toEqual({
      path: 'C:\\projects\\test-flows\\continuum-1220-ai-person-card.md',
      source: 'session'
    })
  })

  const found = (items: AssistantMessageItem[], repoName = 'command-center') => findTestFlow({ items, folder: FOLDER, repoName })

  it('takes the file an Edit call changed', () => {
    expect(found([call('a', 'Edit', { file_path: 'C:\\projects\\test-flows\\darkfall64.md', old_string: 'a', new_string: 'b' })])?.path).toBe(
      'C:\\projects\\test-flows\\darkfall64.md'
    )
  })

  it('takes the file a shell command names, such as the render script', () => {
    const render = call('a', 'Bash', { command: 'python C:/projects/tools/render_test_flow.py "C:/projects/test-flows/bumblebook.md"' })
    expect(found([render])?.path).toBe('C:\\projects\\test-flows\\bumblebook.md')
    const gitBash = call('b', 'Bash', { command: 'python /c/projects/tools/render_test_flow.py /c/projects/test-flows/bumblebook.md && echo ok' })
    expect(found([gitBash])?.path).toBe('C:\\projects\\test-flows\\bumblebook.md')
    const pwsh = call('c', 'PowerShell', { command: "Set-Content -Path 'C:\\projects\\test-flows\\explainer.html' -Value $page" })
    expect(found([pwsh])?.path).toBe('C:\\projects\\test-flows\\explainer.html')
  })

  it('the latest write wins, a subagent write included', () => {
    const items = [
      call('a', 'Write', { file_path: 'C:\\projects\\test-flows\\continuum-1012.md' }),
      call('b', 'Write', { file_path: 'C:\\projects\\test-flows\\continuum-1220.md' }, 'agent-call'),
      call('c', 'Read', { file_path: 'C:\\projects\\test-flows\\continuum-1012.md' })
    ]
    expect(found(items)).toEqual({ path: 'C:\\projects\\test-flows\\continuum-1220.md', source: 'session' })
  })

  it('ignores command lists, other file types, and files outside the folder or in a subfolder', () => {
    const items = [
      call('a', 'Write', { file_path: 'C:\\projects\\test-flows\\run.md' }),
      call('b', 'Write', { file_path: 'C:\\projects\\test-flows\\command-center-commands.md' }),
      call('c', 'Bash', { command: 'python render_test_flow.py C:\\projects\\test-flows\\command-center-commands.md' }),
      call('d', 'Write', { file_path: 'C:\\projects\\test-flows\\notes.txt' }),
      call('e', 'Write', { file_path: 'C:\\projects\\test-flows\\old\\archived.md' }),
      call('f', 'Bash', { command: 'cat C:/projects/test-flows/old/archived.md' }),
      call('g', 'Write', { file_path: 'C:\\projects\\test-flows-backup\\run2.md' }),
      call('h', 'Write', { file_path: 'C:\\projects\\personal\\command-center\\README.md' })
    ]
    expect(found(items)?.path).toBe('C:\\projects\\test-flows\\run.md')
  })

  it('compares the folder ignoring case and slashes', () => {
    expect(found([call('a', 'Write', { file_path: 'c:/Projects//Test-Flows/Run.MD' })])?.path).toBe('C:\\projects\\test-flows\\Run.MD')
    expect(findTestFlow({ items: [call('a', 'Write', { file_path: 'C:\\projects\\test-flows\\run.md' })], folder: 'c:/projects/test-flows/', repoName: 'x' })).toEqual({
      path: 'c:/projects/test-flows/run.md',
      source: 'session'
    })
  })

  it('falls back to the file named after the repo when the session wrote none', () => {
    expect(found([call('a', 'Read', { file_path: 'C:\\projects\\test-flows\\darkfall64.md' })])).toEqual({
      path: 'C:\\projects\\test-flows\\command-center.md',
      source: 'repo'
    })
    expect(found([], '')).toBeNull()
  })
})

describe('the repo name a test flow falls back to', () => {
  const workspaces = [{ path: 'C:\\projects\\personal\\command-center-processes', repoName: 'command-center' }]

  it('is the workspace repo identity, so a worktree shares its repo name', () => {
    expect(repoNameFor(workspaces, 'c:/Projects/personal/command-center-processes/')).toBe('command-center')
  })

  it('is the folder name for a folder that is not a known workspace', () => {
    expect(repoNameFor(workspaces, 'C:\\projects\\scratch\\notes\\')).toBe('notes')
    expect(repoNameFor(workspaces, undefined)).toBe('')
  })
})
