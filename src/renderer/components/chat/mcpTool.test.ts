import { describe, expect, it } from 'vitest'
import { mcpToolTitle } from './mcpTool'

describe('MCP tool title', () => {
  it('shows the server with a capital first letter and the tool in brackets', () => {
    expect(mcpToolTitle('mcp__meshy__meshy_check_balance', {})).toEqual({ server: 'Meshy', tool: 'meshy_check_balance', detail: null })
    expect(mcpToolTitle('mcp__blender__execute_blender_code', { code: 'print(1)' })?.server).toBe('Blender')
  })

  it('capitalises each underscore-separated word, lowercases the rest and keeps the known spellings', () => {
    expect(mcpToolTitle('mcp__darkfall_DEBUG__tail_log', {})?.server).toBe('Darkfall Debug')
    expect(mcpToolTitle('mcp__github__get_issue', {})?.server).toBe('GitHub')
    expect(mcpToolTitle('mcp__claude_ai__x', {})?.server).toBe('Claude AI')
  })

  it('splits only on underscores, so a hyphenated server stays one word', () => {
    expect(mcpToolTitle('mcp__claude-in-chrome__navigate', {})).toMatchObject({ server: 'Claude-in-chrome', tool: 'navigate' })
  })

  it('keeps double underscores inside the tool name', () => {
    expect(mcpToolTitle('mcp__srv__a__b', {})?.tool).toBe('a__b')
  })

  it('adds the first of query, message, channel, repo, url, path, title, search or text as detail', () => {
    expect(mcpToolTitle('mcp__slack__send', { text: 'hi', channel: 'general' })?.detail).toBe('#general')
    expect(mcpToolTitle('mcp__web__get', { url: 'https://example.com/a/b' })?.detail).toBe('example.com')
    expect(mcpToolTitle('mcp__x__y', { query: 'q'.repeat(45) })?.detail).toBe(`${'q'.repeat(40)}…`)
    expect(mcpToolTitle('mcp__x__y', { url: 'not a url but long enough to be cut off' })?.detail).toBe('not a url but long enough to b…')
    expect(mcpToolTitle('mcp__x__y', { count: 3, query: '' })?.detail).toBeNull()
  })

  it('is null for a built-in tool', () => {
    expect(mcpToolTitle('Bash', {})).toBeNull()
  })
})
