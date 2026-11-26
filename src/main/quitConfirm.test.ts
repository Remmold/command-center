import { describe, expect, it } from 'vitest'
import { quitQuestion } from './quitConfirm'

describe('asking before a quit', () => {
  it('a real quit with running terminals asks, naming how many', () => {
    expect(quitQuestion({ sessions: 0, terminals: 3 }, 'quit')).toEqual({ message: '3 terminals still running: quit anyway?', detail: 'Quitting ends them.' })
    expect(quitQuestion({ sessions: 0, terminals: 1 }, 'quit')?.message).toBe('1 terminal still running: quit anyway?')
  })

  it('a real quit with running sessions asks as before', () => {
    expect(quitQuestion({ sessions: 2, terminals: 0 }, 'quit')).toEqual({ message: '2 sessions are running.', detail: 'Quitting stops them mid-turn.' })
    expect(quitQuestion({ sessions: 1, terminals: 0 }, 'quit')?.message).toBe('1 session is running.')
  })

  it('running terminals and sessions together make one question', () => {
    expect(quitQuestion({ sessions: 1, terminals: 2 }, 'quit')).toEqual({
      message: '2 terminals still running: quit anyway?',
      detail: 'Quitting ends them. 1 session is running too; quitting stops it mid-turn.'
    })
  })

  it('the restart to install an update asks about terminals only, as the update pill asks about busy sessions', () => {
    expect(quitQuestion({ sessions: 2, terminals: 2 }, 'update-restart')?.message).toBe('2 terminals still running: quit anyway?')
    expect(quitQuestion({ sessions: 2, terminals: 0 }, 'update-restart')).toBeNull()
  })

  it('nothing running, no question', () => {
    expect(quitQuestion({ sessions: 0, terminals: 0 }, 'quit')).toBeNull()
  })

  it('closing the window to the tray never asks', () => {
    expect(quitQuestion({ sessions: 1, terminals: 4 }, 'close-to-tray')).toBeNull()
  })
})
