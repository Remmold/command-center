import { describe, expect, it } from 'vitest'
import { EMPTY_SNAPSHOT, parseSnapshot, pruneSnapshot, restoredScrollTop, withDraft, withScroll } from './restoreSnapshot'

describe('restore snapshot', () => {
  it('keeps a typed draft per chat and forgets it once emptied', () => {
    const typed = withDraft(EMPTY_SNAPSHOT, 'a', 'half a thought')
    expect(typed.drafts).toEqual({ a: 'half a thought' })
    expect(withDraft(typed, 'a', '').drafts).toEqual({})
  })

  it('a chat that followed the output reopens at the bottom of its now longer transcript', () => {
    const saved = withScroll(EMPTY_SNAPSHOT, 'a', { top: 400, following: true }).scroll.a
    expect(restoredScrollTop(saved, { scrollHeight: 3000, clientHeight: 600 })).toBe(3000)
  })

  it('a chat scrolled up to read reopens at the same place', () => {
    const saved = withScroll(EMPTY_SNAPSHOT, 'a', { top: 400, following: false }).scroll.a
    expect(restoredScrollTop(saved, { scrollHeight: 3000, clientHeight: 600 })).toBe(400)
  })

  it('a saved place past the end of a shorter transcript lands at its end', () => {
    expect(restoredScrollTop({ top: 2800, following: false }, { scrollHeight: 1000, clientHeight: 600 })).toBe(400)
  })

  it('a chat with nothing saved opens at the bottom', () => {
    expect(restoredScrollTop(undefined, { scrollHeight: 3000, clientHeight: 600 })).toBe(3000)
  })

  it('drops drafts and places of chats that are no longer open', () => {
    let snap = withDraft(EMPTY_SNAPSHOT, 'a', 'x')
    snap = withDraft(snap, 'b', 'y')
    snap = withScroll(snap, 'b', { top: 1, following: false })
    expect(pruneSnapshot(snap, ['a'])).toEqual({ ...snap, drafts: { a: 'x' }, scroll: {} })
  })

  it('reads back what it wrote and survives junk', () => {
    const snap = withScroll(withDraft({ ...EMPTY_SNAPSHOT, view: 'work' }, 'a', 'x'), 'a', { top: 5, following: false })
    expect(parseSnapshot(JSON.stringify(snap))).toEqual(snap)
    expect(parseSnapshot('{not json')).toEqual(EMPTY_SNAPSHOT)
    expect(parseSnapshot(JSON.stringify({ drafts: { a: 3 }, scroll: { b: { top: 'x' } }, view: 'nope' }))).toEqual(EMPTY_SNAPSHOT)
  })
})
