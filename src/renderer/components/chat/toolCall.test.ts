import { describe, expect, it } from 'vitest'
import { pairToolResults, toolCallTitle } from './toolCall'
import type { ChatItem, ToolResultItem } from './types'

const CWD = 'C:\\projects\\personal\\command-center'

describe('tool call title', () => {
  it('names a Read by its file, relative to the workspace', () => {
    expect(toolCallTitle('Read', { file_path: 'C:\\projects\\personal\\command-center\\src\\main\\index.ts' }, CWD)).toEqual({
      name: 'Read',
      target: 'src/main/index.ts'
    })
  })

  it('names a Bash call by the first line of its command', () => {
    expect(toolCallTitle('Bash', { command: 'pnpm quick\necho done', description: 'Run quick tier' }, CWD).target).toBe('pnpm quick')
  })

  it('names a Grep by its pattern, and the folder searched when there is one', () => {
    expect(toolCallTitle('Grep', { pattern: 'useChatItemsStore' }, CWD).target).toBe('useChatItemsStore')
    expect(toolCallTitle('Grep', { pattern: 'TODO', path: `${CWD}\\src\\renderer` }, CWD).target).toBe('TODO in src/renderer')
  })

  it('names a Glob by its pattern', () => {
    expect(toolCallTitle('Glob', { pattern: '**/*.test.ts' }, CWD).target).toBe('**/*.test.ts')
  })

  it('names a Task by its description', () => {
    expect(toolCallTitle('Task', { description: 'Find chat renderers', prompt: 'long…' }, CWD).target).toBe('Find chat renderers')
  })

  it('names web tools by their URL or query', () => {
    expect(toolCallTitle('WebFetch', { url: 'https://example.com/a', prompt: 'x' }, CWD).target).toBe('https://example.com/a')
    expect(toolCallTitle('WebSearch', { query: 'electron 31 release' }, CWD).target).toBe('electron 31 release')
  })

  it('names a notebook edit by its notebook, relative to the workspace', () => {
    expect(toolCallTitle('NotebookEdit', { notebook_path: `${CWD}\\nb\\a.ipynb` }, CWD).target).toBe('nb/a.ipynb')
  })

  it('keeps a path outside the workspace as given', () => {
    expect(toolCallTitle('Read', { file_path: 'D:\\other\\x.ts' }, CWD).target).toBe('D:\\other\\x.ts')
  })

  it('matches the workspace regardless of drive-letter case or slash style', () => {
    expect(toolCallTitle('Edit', { file_path: 'c:/projects/personal/command-center/README.md' }, CWD).target).toBe('README.md')
  })

  it('has no target for an unknown tool or missing input', () => {
    expect(toolCallTitle('TodoWrite', { todos: [] }, CWD)).toEqual({ name: 'TodoWrite', target: '' })
    expect(toolCallTitle('Read', null, CWD)).toEqual({ name: 'Read', target: '' })
  })
})

describe('tool call pairing', () => {
  const call = (id: string): ChatItem => ({
    kind: 'assistant',
    id: `a-${id}`,
    content: [{ type: 'tool_use', id, name: 'Read', input: {} }],
    raw: { type: 'assistant', message: { id: `a-${id}`, role: 'assistant', content: [] } } as never
  })
  const result = (toolUseId: string, isError = false): ToolResultItem => ({
    kind: 'tool_result',
    id: `r-${toolUseId}`,
    toolUseId,
    content: 'ok',
    isError
  })

  it('attaches each result to the call it answers', () => {
    const r = result('t1', true)
    const pairs = pairToolResults([call('t1'), r])
    expect(pairs.resultFor.get('t1')).toBe(r)
    expect(pairs.isPaired(r)).toBe(true)
  })

  it('leaves a result with no matching call in the chat on its own', () => {
    const orphan = result('gone')
    const pairs = pairToolResults([call('t1'), orphan])
    expect(pairs.isPaired(orphan)).toBe(false)
    expect(pairs.resultFor.has('t1')).toBe(false)
  })
})
