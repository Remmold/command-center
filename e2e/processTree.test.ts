import { describe, expect, it } from 'vitest'
import { treeOf, type ProcessRow } from './processTree'

const row = (pid: number, parent: number, started: number): ProcessRow => ({ pid, parent, started: String(started) })

describe('the test app’s process tree', () => {
  it('holds the app and everything it started, however deep', () => {
    const table = [row(100, 1, 50), row(101, 100, 60), row(102, 101, 70), row(200, 1, 55)]
    expect(treeOf(100, table).map((p) => p.pid)).toEqual([100, 101, 102])
  })

  it('leaves out an older process whose dead parent’s PID the test app reused (how VS Code was killed)', () => {
    // VS Code (pid 68492) was started at t=10 by a launcher (pid 19752) that has since exited.
    // Windows later gave pid 19752 to the test app, started at t=90.
    const table = [row(68492, 19752, 10), row(68493, 68492, 11), row(19752, 4000, 90), row(19753, 19752, 95)]
    const tree = treeOf(19752, table).map((p) => p.pid)
    expect(tree).toEqual([19752, 19753])
    expect(tree).not.toContain(68492)
    expect(tree).not.toContain(68493)
  })

  it('keeps a child started in the same tick as its parent', () => {
    expect(treeOf(5, [row(5, 1, 40), row(6, 5, 40)]).map((p) => p.pid)).toEqual([5, 6])
  })

  it('ignores a row with no start time rather than throwing', () => {
    expect(treeOf(5, [row(5, 1, 40), { pid: 7, parent: 5, started: '' }]).map((p) => p.pid)).toEqual([5])
  })
})
