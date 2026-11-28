/** How the app is going away; closing the window only hides it in the tray. */
export type QuitKind = 'quit' | 'update-restart' | 'close-to-tray'

export interface RunningWork {
  sessions: number
  terminals: number
  /** 3D jobs queued or running. */
  model3dJobs: number
  /** An editor turn queued or held. */
  editor: boolean
}

export interface QuitQuestion {
  message: string
  detail: string
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The one confirm a quit shows, or null when it goes ahead without asking. */
export function quitQuestion(running: RunningWork, kind: QuitKind): QuitQuestion | null {
  if (kind === 'close-to-tray') return null
  // The update restart asks about busy sessions itself, in the update pill.
  const sessions = kind === 'quit' ? running.sessions : 0
  const { terminals, model3dJobs: jobs, editor } = running
  const alsoSessions = sessions > 0 ? ` ${sessions === 1 ? '1 session is running' : `${sessions} sessions are running`} too; quitting stops ${sessions === 1 ? 'it' : 'them'} mid-turn.` : ''
  const endsEditor = editor ? 'ends the editor turn' : null
  if (terminals > 0) {
    const threeD = [jobs > 0 ? `cancels ${plural(jobs, '3D job', '3D jobs')}` : null, endsEditor].filter((p): p is string => p !== null)
    const also = threeD.length > 0 ? ` It also ${threeD.join(' and ')}.` : ''
    return { message: `${plural(terminals, 'terminal', 'terminals')} still running: quit anyway?`, detail: `Quitting ends them.${also}${alsoSessions}` }
  }
  if (jobs > 0) {
    const cancels = [`cancels ${jobs === 1 ? 'it' : 'them'}`, endsEditor].filter((p): p is string => p !== null).join(' and ')
    return { message: `${plural(jobs, '3D job', '3D jobs')} still queued or running: quit anyway?`, detail: `Quitting ${cancels}.${alsoSessions}` }
  }
  if (editor) return { message: 'The 3D editor is still open: quit anyway?', detail: `Quitting ends the editor turn.${alsoSessions}` }
  if (sessions > 0) return { message: `${sessions === 1 ? '1 session is running' : `${sessions} sessions are running`}.`, detail: 'Quitting stops them mid-turn.' }
  return null
}
