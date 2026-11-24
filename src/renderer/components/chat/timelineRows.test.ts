import { describe, expect, it } from 'vitest'
import { quietStepLabel, timelineJoins, timelineSteps, visibleBlocks } from './timelineRows'

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

  it('skips the background-task plumbing that reads a task’s output', () => {
    const blocks = ['TaskOutput', 'BashOutput', 'AgentOutputTool', 'Bash'].map((name, i) => ({ type: 'tool_use', id: `t${i}`, name, input: {} }))
    expect(visibleBlocks(blocks)).toEqual([3])
  })
})

describe('the steps of a reply', () => {
  const stop = (id: string, name = 'TaskStop') => ({ type: 'tool_use', id, name, input: { task_id: id } })

  it('folds side-by-side stops of background tasks into one quiet step', () => {
    const blocks = [{ type: 'text', text: 'Stopping both.' }, stop('a'), stop('b', 'KillShell'), { type: 'text', text: 'Done.' }, stop('c')]
    expect(timelineSteps(blocks)).toEqual([
      { indexes: [0], quiet: false },
      { indexes: [1, 2], quiet: true },
      { indexes: [3], quiet: false },
      { indexes: [4], quiet: true }
    ])
  })

  it('reads a quiet step as how many tasks it stopped', () => {
    expect(quietStepLabel(1)).toBe('Stopped background task')
    expect(quietStepLabel(2)).toBe('Stopped 2 background tasks')
  })
})
