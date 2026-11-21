import { describe, expect, it } from 'vitest'
import { EMPTY_PAIR, closeHalf, dropChats, openChat, restorePair, splitPair, type ChatPair, type ChatRef, type HalfIndex } from './chatPair'

const hosted = (paneId: string): ChatRef => ({ kind: 'hosted', paneId })

const observed = (sessionId: string): ChatRef => ({ kind: 'observed', workspaceId: 'cc', sessionId })

const split = (left: string, right: string, focused: HalfIndex = 0): ChatPair => ({
  halves: [hosted(left), hosted(right)],
  focused
})

describe('chat pair', () => {
  it('opens a chat into the single half of an empty chat area', () => {
    expect(openChat(EMPTY_PAIR, hosted('a'))).toEqual({ halves: [hosted('a')], focused: 0 })
  })

  it('opens a chat beside the one on screen, keeping focus on the first', () => {
    const one = openChat(EMPTY_PAIR, hosted('a'))
    expect(openChat(one, hosted('b'), { beside: true })).toEqual({ halves: [hosted('a'), hosted('b')], focused: 0 })
  })

  it('replaces the half that is not focused when a third chat opens beside', () => {
    expect(openChat(split('a', 'b', 1), hosted('c'), { beside: true })).toEqual({
      halves: [hosted('c'), hosted('b')],
      focused: 1
    })
  })

  it('opens a plain click, Ctrl+Shift+J or Needs you target in the focused half', () => {
    expect(openChat(split('a', 'b', 1), hosted('c'))).toEqual(split('a', 'c', 1))
  })

  it('focuses the half already showing a chat instead of showing it twice', () => {
    expect(openChat(split('a', 'b', 0), hosted('b'))).toEqual(split('a', 'b', 1))
    expect(openChat(split('a', 'b', 0), hosted('b'), { beside: true })).toEqual(split('a', 'b', 1))
    expect(openChat(openChat(EMPTY_PAIR, hosted('a')), hosted('a'), { beside: true })).toEqual({ halves: [hosted('a')], focused: 0 })
  })

  it('shows at most one observed session, replacing the half that follows the other one', () => {
    const pair: ChatPair = { halves: [hosted('a'), observed('o1')], focused: 0 }
    expect(openChat(pair, observed('o2'), { beside: true })).toEqual({ halves: [hosted('a'), observed('o2')], focused: 0 })
    expect(openChat(pair, observed('o2'))).toEqual({ halves: [hosted('a'), observed('o2')], focused: 1 })
  })

  it('splits with an empty focused half that the next pick fills', () => {
    const empty = splitPair(openChat(EMPTY_PAIR, hosted('a')))
    expect(empty).toEqual({ halves: [hosted('a'), null], focused: 1 })
    expect(openChat(empty, hosted('b'))).toEqual(split('a', 'b', 1))
    expect(splitPair(split('a', 'b'))).toEqual(split('a', 'b'))
  })

  it('closing a half leaves the other chat alone and focused', () => {
    expect(closeHalf(split('a', 'b', 0), 0)).toEqual({ halves: [hosted('b')], focused: 0 })
    expect(closeHalf(openChat(EMPTY_PAIR, hosted('a')), 0)).toEqual(EMPTY_PAIR)
  })

  it('drops a closed session from its half, collapsing the split', () => {
    const closedB = (ref: ChatRef) => !(ref.kind === 'hosted' && ref.paneId === 'b')
    expect(dropChats(split('a', 'b', 1), closedB)).toEqual({ halves: [hosted('a')], focused: 0 })
    expect(dropChats(openChat(EMPTY_PAIR, hosted('b')), closedB)).toEqual(EMPTY_PAIR)
    const pair = split('a', 'c', 1)
    expect(dropChats(pair, closedB)).toBe(pair)
  })

  it('restores a saved pair across a restart and ignores a malformed one', () => {
    const saved = JSON.parse(JSON.stringify({ halves: [hosted('a'), observed('o1')], focused: 1 }))
    expect(restorePair(saved)).toEqual({ halves: [hosted('a'), observed('o1')], focused: 1 })
    expect(restorePair(undefined)).toEqual(EMPTY_PAIR)
    expect(restorePair({ halves: [{ kind: 'hosted' }], focused: 0 })).toEqual(EMPTY_PAIR)
    expect(restorePair({ halves: [hosted('a'), hosted('b'), hosted('c')], focused: 0 })).toEqual(EMPTY_PAIR)
    expect(restorePair({ halves: [hosted('a')], focused: 1 })).toEqual({ halves: [hosted('a')], focused: 0 })
  })
})
