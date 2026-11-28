import { describe, expect, it } from 'vitest'
import { quitQuestion } from './quitConfirm'

const none = { sessions: 0, terminals: 0, model3dJobs: 0, editor: false }

describe('asking before a quit', () => {
  it('a real quit with running terminals asks, naming how many', () => {
    expect(quitQuestion({ ...none, sessions: 0, terminals: 3 }, 'quit')).toEqual({ message: '3 terminals still running: quit anyway?', detail: 'Quitting ends them.' })
    expect(quitQuestion({ ...none, sessions: 0, terminals: 1 }, 'quit')?.message).toBe('1 terminal still running: quit anyway?')
  })

  it('a real quit with running sessions asks as before', () => {
    expect(quitQuestion({ ...none, sessions: 2, terminals: 0 }, 'quit')).toEqual({ message: '2 sessions are running.', detail: 'Quitting stops them mid-turn.' })
    expect(quitQuestion({ ...none, sessions: 1, terminals: 0 }, 'quit')?.message).toBe('1 session is running.')
  })

  it('running terminals and sessions together make one question', () => {
    expect(quitQuestion({ ...none, sessions: 1, terminals: 2 }, 'quit')).toEqual({
      message: '2 terminals still running: quit anyway?',
      detail: 'Quitting ends them. 1 session is running too; quitting stops it mid-turn.'
    })
  })

  it('the restart to install an update asks about terminals only, as the update pill asks about busy sessions', () => {
    expect(quitQuestion({ ...none, sessions: 2, terminals: 2 }, 'update-restart')?.message).toBe('2 terminals still running: quit anyway?')
    expect(quitQuestion({ ...none, sessions: 2, terminals: 0 }, 'update-restart')).toBeNull()
  })

  it('nothing running, no question', () => {
    expect(quitQuestion({ ...none, sessions: 0, terminals: 0 }, 'quit')).toBeNull()
  })

  it('closing the window to the tray never asks', () => {
    expect(quitQuestion({ ...none, sessions: 1, terminals: 4 }, 'close-to-tray')).toBeNull()
  })

  it('3D jobs queued or running and an editor turn ask too, as cancelled on quit', () => {
    expect(quitQuestion({ ...none, model3dJobs: 2 }, 'quit')).toEqual({ message: '2 3D jobs still queued or running: quit anyway?', detail: 'Quitting cancels them.' })
    expect(quitQuestion({ ...none, model3dJobs: 1, editor: true }, 'quit')).toEqual({
      message: '1 3D job still queued or running: quit anyway?',
      detail: 'Quitting cancels it and ends the editor turn.'
    })
    expect(quitQuestion({ ...none, editor: true }, 'quit')).toEqual({ message: 'The 3D editor is still open: quit anyway?', detail: 'Quitting ends the editor turn.' })
  })

  it('3D work goes into the one question next to sessions and terminals', () => {
    expect(quitQuestion({ ...none, sessions: 1, model3dJobs: 2 }, 'quit')).toEqual({
      message: '2 3D jobs still queued or running: quit anyway?',
      detail: 'Quitting cancels them. 1 session is running too; quitting stops it mid-turn.'
    })
    expect(quitQuestion({ ...none, sessions: 2, terminals: 1, model3dJobs: 1, editor: true }, 'quit')).toEqual({
      message: '1 terminal still running: quit anyway?',
      detail: 'Quitting ends them. It also cancels 1 3D job and ends the editor turn. 2 sessions are running too; quitting stops them mid-turn.'
    })
  })

  it('the restart to install an update asks about 3D work too, and closing to the tray never does', () => {
    expect(quitQuestion({ ...none, sessions: 2, editor: true }, 'update-restart')?.message).toBe('The 3D editor is still open: quit anyway?')
    expect(quitQuestion({ ...none, model3dJobs: 3, editor: true }, 'close-to-tray')).toBeNull()
  })
})
