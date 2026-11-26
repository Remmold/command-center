/** How the app is going away; closing the window only hides it in the tray. */
export type QuitKind = 'quit' | 'update-restart' | 'close-to-tray'

export interface RunningWork {
  sessions: number
  terminals: number
}

export interface QuitQuestion {
  message: string
  detail: string
}

/** The one confirm a quit shows, or null when it goes ahead without asking. */
export function quitQuestion(running: RunningWork, kind: QuitKind): QuitQuestion | null {
  if (kind === 'close-to-tray') return null
  // The update restart asks about busy sessions itself, in the update pill.
  const sessions = kind === 'quit' ? running.sessions : 0
  const { terminals } = running
  const sessionsRunning = sessions === 1 ? '1 session is running' : `${sessions} sessions are running`
  if (terminals > 0) {
    const message = `${terminals} ${terminals === 1 ? 'terminal' : 'terminals'} still running: quit anyway?`
    if (sessions === 0) return { message, detail: 'Quitting ends them.' }
    return { message, detail: `Quitting ends them. ${sessionsRunning} too; quitting stops ${sessions === 1 ? 'it' : 'them'} mid-turn.` }
  }
  if (sessions > 0) return { message: `${sessionsRunning}.`, detail: 'Quitting stops them mid-turn.' }
  return null
}
