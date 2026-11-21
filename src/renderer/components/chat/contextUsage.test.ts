import { describe, expect, it } from 'vitest'
import reply from '../../../main/claude/fixtures/get-context-usage-reply.json'
import { contextIndicator, formatTokens, homePath, parseContextUsage, pieBucket, shareText } from './contextUsage'

const recorded = reply.response.response

describe('parseContextUsage', () => {
  it('keeps what the dialog and the indicator need from a real reply', () => {
    const usage = parseContextUsage(recorded)
    expect(usage).toMatchObject({
      model: 'claude-haiku-5-5',
      totalTokens: 22066,
      rawMaxTokens: 1000000,
      percentage: 2,
      autoCompactThreshold: 967000
    })
    expect(usage?.categories.map((c) => c.name)).toContain('Free space')
    expect(usage?.categories.find((c) => c.name === 'MCP tools (deferred)')?.isDeferred).toBe(true)
    expect(usage?.memoryFiles).toEqual([{ path: 'C:\\Users\\someone\\.claude\\CLAUDE.md', tokens: 2270 }])
  })

  it('returns null for a reply without token counts', () => {
    expect(parseContextUsage({})).toBeNull()
  })
})

describe('contextIndicator', () => {
  const at = (totalTokens: number, autoCompactThreshold = 200000) => ({ totalTokens, autoCompactThreshold, rawMaxTokens: 1000000 })

  it('stays hidden up to and including 50% of the space before auto-compact', () => {
    expect(contextIndicator(at(0))).toBeNull()
    expect(contextIndicator(at(100000))).toBeNull()
    expect(contextIndicator(at(100001))).not.toBeNull()
  })

  it('stays hidden without a known window', () => {
    expect(contextIndicator({ totalTokens: 5000, autoCompactThreshold: 0, rawMaxTokens: 0 })).toBeNull()
  })

  it("words the label and tooltip as the extension's", () => {
    expect(contextIndicator(at(150000))).toEqual({
      usedPercent: 75,
      label: '75% context used — click to compact',
      tooltip: '25% of context remaining until auto-compact.',
      hint: 'Click to compact now.'
    })
  })

  it('caps at 100% and falls back to the raw window without an auto-compact threshold', () => {
    expect(contextIndicator(at(300000))?.usedPercent).toBe(100)
    expect(contextIndicator({ totalTokens: 600000, rawMaxTokens: 1000000 })?.usedPercent).toBe(60)
  })
})

describe('pieBucket', () => {
  it("picks the extension's drawn pie for 50, 75 and 99", () => {
    expect(pieBucket(50.1)).toBe(50)
    expect(pieBucket(62.4)).toBe(50)
    expect(pieBucket(62.5)).toBe(75)
    expect(pieBucket(86.9)).toBe(75)
    expect(pieBucket(87)).toBe(99)
  })
})

describe('formatting', () => {
  it('formats tokens and shares as the extension does', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(22066)).toBe('22.1k')
    expect(formatTokens(1000000)).toBe('1.0M')
    expect(shareText(50, 1000000)).toBe('<0.1%')
    expect(shareText(3224, 1000000)).toBe('0.3%')
  })

  it('shortens a home folder to ~', () => {
    expect(homePath('C:\\Users\\someone\\.claude\\CLAUDE.md')).toBe('~\\.claude\\CLAUDE.md')
    expect(homePath('/home/me/x/CLAUDE.md')).toBe('~/x/CLAUDE.md')
    expect(homePath('D:\\repo\\CLAUDE.md')).toBe('D:\\repo\\CLAUDE.md')
  })
})
