import { describe, expect, it } from 'vitest'
import type { ChatItem } from './types'
import { historyEntries, NO_RECALL, stepHistory } from './promptHistory'

const user = (text: string): ChatItem => ({ kind: 'user', id: text, text })
const note = (text: string): ChatItem => ({ kind: 'system', id: text, text })

describe('prompt history entries', () => {
  it('are this session\'s prompts, newest first, queued ones newest of all', () => {
    const items = [user('one'), note('claude code · haiku'), user('two')]
    expect(historyEntries(items, [{ uuid: 'q', text: 'queued' }])).toEqual(['queued', 'two', 'one'])
  })

  it('leave out the attachments marker and image-only sends', () => {
    expect(historyEntries([user('look at this\n\n_[2 images attached]_'), user('\n\n_[1 file attached]_'), user('')], [])).toEqual(['look at this'])
  })

  it('trim the prompt and skip blank ones', () => {
    expect(historyEntries([user('  padded  '), user('   ')], [])).toEqual(['padded'])
  })
})

describe('stepping through history', () => {
  const entries = ['newest', 'middle', 'oldest']

  it('↑ from the draft saves the draft and shows the newest prompt', () => {
    expect(stepHistory(NO_RECALL, entries, 'older', 'half-typed')).toEqual({
      cursor: { index: 0, draft: 'half-typed' },
      value: 'newest'
    })
  })

  it('↑ again goes further back and stops at the oldest', () => {
    const first = stepHistory(NO_RECALL, entries, 'older', '')!
    const second = stepHistory(first.cursor, entries, 'older', first.value)!
    const third = stepHistory(second.cursor, entries, 'older', second.value)!
    expect([second.value, third.value]).toEqual(['middle', 'oldest'])
    expect(stepHistory(third.cursor, entries, 'older', third.value)).toBeNull()
  })

  it('↓ comes forward and then restores the draft', () => {
    const up1 = stepHistory(NO_RECALL, entries, 'older', 'draft')!
    const up2 = stepHistory(up1.cursor, entries, 'older', up1.value)!
    const down1 = stepHistory(up2.cursor, entries, 'newer', up2.value)!
    const down2 = stepHistory(down1.cursor, entries, 'newer', down1.value)!
    expect([down1.value, down2.value]).toEqual(['newest', 'draft'])
    expect(down2.cursor.index).toBe(-1)
  })

  it('↓ on the draft does nothing', () => {
    expect(stepHistory(NO_RECALL, entries, 'newer', 'draft')).toBeNull()
  })

  it('↑ with no history does nothing', () => {
    expect(stepHistory(NO_RECALL, [], 'older', 'draft')).toBeNull()
  })

  it('editing a recalled prompt leaves the history as it was', () => {
    const up = stepHistory(NO_RECALL, entries, 'older', '')!
    const next = stepHistory(up.cursor, entries, 'older', 'newest, edited')!
    expect(next.value).toBe('middle')
    expect(stepHistory(next.cursor, entries, 'newer', next.value)!.value).toBe('newest')
  })
})
