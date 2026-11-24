import { describe, expect, it } from 'vitest'
import { pauseToSend, shownSuggestion, suggestionKey, suggestionReducer } from './promptSuggestion'

const line = (suggestion: unknown) => ({ type: 'prompt_suggestion', suggestion, uuid: 'u1', session_id: 's1' })

describe('suggestionReducer', () => {
  it('keeps the latest suggestion the CLI sent', () => {
    const first = suggestionReducer(null, { type: 'line', line: line('Run the tests') })
    expect(first).toBe('Run the tests')
    expect(suggestionReducer(first, { type: 'line', line: line('Commit it') })).toBe('Commit it')
  })

  it('leaves the suggestion alone on other lines and on malformed suggestion lines', () => {
    expect(suggestionReducer('Run the tests', { type: 'line', line: { type: 'result', subtype: 'success' } })).toBe('Run the tests')
    expect(suggestionReducer('Run the tests', { type: 'line', line: line(42) })).toBe('Run the tests')
    expect(suggestionReducer('Run the tests', { type: 'line', line: line('') })).toBe('Run the tests')
    expect(suggestionReducer(null, { type: 'line', line: 'not json' })).toBeNull()
  })

  it.each(['turn-started', 'sent', 'interrupted', 'restarted', 'dismissed'] as const)('drops it when %s', (reason) => {
    expect(suggestionReducer('Run the tests', { type: 'clear', reason })).toBeNull()
  })
})

describe('shownSuggestion', () => {
  it('shows only while the prompt box is empty and Claude is idle', () => {
    expect(shownSuggestion('Run the tests', { value: '', busy: false })).toBe('Run the tests')
    expect(shownSuggestion('Run the tests', { value: 'R', busy: false })).toBeNull()
    expect(shownSuggestion('Run the tests', { value: ' ', busy: false })).toBeNull()
    expect(shownSuggestion('Run the tests', { value: '', busy: true })).toBeNull()
    expect(shownSuggestion(null, { value: '', busy: false })).toBeNull()
  })
})

describe('suggestionKey', () => {
  const bare = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

  it('Tab accepts and Esc dismisses a shown suggestion', () => {
    expect(suggestionKey({ key: 'Tab', ...bare }, true)).toBe('accept')
    expect(suggestionKey({ key: 'Escape', ...bare }, true)).toBe('dismiss')
  })

  it('leaves keys alone with no suggestion shown, and with modifiers', () => {
    expect(suggestionKey({ key: 'Tab', ...bare }, false)).toBeNull()
    expect(suggestionKey({ key: 'Escape', ...bare }, false)).toBeNull()
    expect(suggestionKey({ key: 'Tab', ...bare, shiftKey: true }, true)).toBeNull()
    expect(suggestionKey({ key: 'Tab', ...bare, ctrlKey: true }, true)).toBeNull()
    expect(suggestionKey({ key: 'Enter', ...bare }, true)).toBeNull()
  })
})

describe('pauseToSend', () => {
  it('pauses a chat that went off screen and resumes it when shown, sending only changes', () => {
    expect(pauseToSend(false, false)).toBe(true)
    expect(pauseToSend(true, true)).toBe(false)
    expect(pauseToSend(false, true)).toBeNull()
    expect(pauseToSend(true, false)).toBeNull()
  })
})
