import { describe, expect, it } from 'vitest'
import { timelineJoins, visibleBlocks } from './timelineRows'

describe('which steps the timeline line joins', () => {
  it('joins neighbouring timeline steps and stops at a prompt', () => {
    expect(timelineJoins(['plain', 'timeline', 'timeline', 'plain', 'timeline'])).toEqual([
      { above: false, below: false },
      { above: false, below: true },
      { above: true, below: false },
      { above: false, below: false },
      { above: false, below: false }
    ])
  })

  it('looks past items that draw nothing', () => {
    expect(timelineJoins(['timeline', 'hidden', 'timeline'])).toEqual([
      { above: false, below: true },
      { above: false, below: false },
      { above: true, below: false }
    ])
  })
})

describe('the blocks of a reply that draw a step', () => {
  it('skips empty text and ToolSearch, as the extension hides it', () => {
    const blocks = [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: '  ' },
      { type: 'tool_use', id: 't1', name: 'ToolSearch', input: {} },
      { type: 'tool_use', id: 't2', name: 'mcp__meshy__meshy_check_balance', input: {} },
      { type: 'text', text: 'Balance: 1932 credits.' }
    ]
    expect(visibleBlocks(blocks)).toEqual([0, 3, 4])
  })
})
