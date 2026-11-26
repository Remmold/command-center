import { describe, expect, it } from 'vitest'
import { terminalQuitQuestion } from './quitConfirm'

describe('asking before a quit with running terminals', () => {
  it('a real quit with running terminals asks, naming how many', () => {
    expect(terminalQuitQuestion(3, 'quit')).toBe('3 terminals still running: quit anyway?')
    expect(terminalQuitQuestion(1, 'quit')).toBe('1 terminal still running: quit anyway?')
  })

  it('the restart to install an update asks too', () => {
    expect(terminalQuitQuestion(2, 'update-restart')).toBe('2 terminals still running: quit anyway?')
  })

  it('no running terminal, no question', () => {
    expect(terminalQuitQuestion(0, 'quit')).toBeNull()
    expect(terminalQuitQuestion(0, 'update-restart')).toBeNull()
  })

  it('closing the window to the tray never asks', () => {
    expect(terminalQuitQuestion(4, 'close-to-tray')).toBeNull()
  })
})
