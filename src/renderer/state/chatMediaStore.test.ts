import { beforeEach, describe, expect, it } from 'vitest'
import { dropSavedPanelWidth, shownTab, useChatMediaStore } from './chatMediaStore'

const tabOf = (key: string) => useChatMediaStore.getState().tab[key]

describe('chat media tabs', () => {
  beforeEach(() => useChatMediaStore.setState({ tab: {}, hasMedia: { 'pane-1': true, 'pane-2': true } }))

  it('a newly opened chat starts on Chat', () => {
    expect(shownTab(tabOf('pane-1'), 3)).toBe('chat')
  })

  it('toggling switches only that chat between Chat and Media', () => {
    useChatMediaStore.getState().toggleTab('pane-1')
    expect(shownTab(tabOf('pane-1'), 3)).toBe('media')
    expect(shownTab(tabOf('pane-2'), 3)).toBe('chat')
    useChatMediaStore.getState().toggleTab('pane-1')
    expect(shownTab(tabOf('pane-1'), 3)).toBe('chat')
  })

  it('the shortcut leaves a chat without media on Chat, so media arriving later does not switch it', () => {
    useChatMediaStore.getState().toggleTab('pane-3')
    expect(tabOf('pane-3')).toBeUndefined()
  })

  it('a chat whose media is gone for a moment (a transcript reloading) keeps Media chosen', () => {
    useChatMediaStore.getState().setTab('pane-1', 'media')
    useChatMediaStore.getState().setHasMedia('pane-1', false)
    useChatMediaStore.getState().setHasMedia('pane-1', true)
    expect(shownTab(tabOf('pane-1'), 1)).toBe('media')
  })

  it('a chat with no media shows Chat whatever was chosen', () => {
    useChatMediaStore.getState().setTab('pane-1', 'media')
    expect(shownTab(tabOf('pane-1'), 0)).toBe('chat')
  })

  it('opening an agent shows the Agents tab on its live view, while the chat has agents', () => {
    useChatMediaStore.getState().showAgents('pane-4', 'a1')
    expect(useChatMediaStore.getState().openAgent['pane-4']).toBe('a1')
    expect(shownTab(tabOf('pane-4'), 0, 2)).toBe('agents')
    expect(shownTab(tabOf('pane-4'), 0, 0)).toBe('chat')
    useChatMediaStore.getState().showAgents('pane-4')
    expect(useChatMediaStore.getState().openAgent['pane-4']).toBeUndefined()
  })

  it('drops the old Media column width from storage and leaves other keys', () => {
    const saved = new Map([
      ['command-center.media-panel', '{"state":{"width":320},"version":1}'],
      ['command-center.chat-items', '{}']
    ])
    dropSavedPanelWidth({ removeItem: (k) => void saved.delete(k) })
    expect([...saved.keys()]).toEqual(['command-center.chat-items'])
  })

  it('a storage that throws is ignored', () => {
    expect(() =>
      dropSavedPanelWidth({
        removeItem: () => {
          throw new Error('blocked')
        }
      })
    ).not.toThrow()
  })
})
