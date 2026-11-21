import { describe, expect, it } from 'vitest'
import type { SessionStatusEntry } from './types'
import { needsYouQueue } from './needsYou'

const entry = (paneId: string, status: SessionStatusEntry['status'], since: number): SessionStatusEntry => ({
  paneId,
  cwd: 'C:/ws',
  status,
  since
})

describe('needs you queue', () => {
  it('lists only waiting sessions, the longest wait first', () => {
    const queue = needsYouQueue([
      entry('running', 'running', 10),
      entry('late-turn', 'your-turn', 300),
      entry('idle', 'idle', 5),
      entry('early-approval', 'needs-approval', 100),
      entry('mid-turn', 'your-turn', 200)
    ])
    expect(queue.map((e) => e.paneId)).toEqual(['early-approval', 'mid-turn', 'late-turn'])
  })
})
