/** How the app is going away; closing the window only hides it in the tray. */
export type QuitKind = 'quit' | 'update-restart' | 'close-to-tray'

/** The confirm a quit shows over running terminals, or null when it goes ahead without asking. */
export function terminalQuitQuestion(running: number, kind: QuitKind): string | null {
  if (kind === 'close-to-tray' || running <= 0) return null
  return `${running} ${running === 1 ? 'terminal' : 'terminals'} still running: quit anyway?`
}
