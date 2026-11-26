import { readPreviewConfig, type PreviewConfig } from './previewConfig'

export interface PreviewSetupInput {
  /** Where Claude writes its proposal, in the app's data folder. */
  draftFile: string
}

const SHAPE = [
  '{',
  '  "install": string,   // run once in a fresh worktree; "" when the project needs none',
  '  "servers": [{ "name": string, "command": string, "cwd": string }],',
  '  "startPage": string  // a path on the first server, starting with /',
  '}'
].join('\n')

/** The prompt of a Set up preview session: read the project and write a proposal to the draft file. */
export function buildPreviewSetupPrompt({ draftFile }: PreviewSetupInput): string {
  return [
    'Set up preview: propose how this project runs in a browser, so a feature can be tested on a preview.',
    'Read the package manifest, its scripts, and any other file that says how the project installs and serves (lockfile, docker-compose, README, framework config).',
    `Write your proposal as valid JSON to this file, and nowhere else: ${draftFile}`,
    `Shape:\n${SHAPE}`,
    [
      'Rules:',
      '1. Each server command must take its port from {port}, which the app replaces with a free port, or from the PORT variable the server also receives (use {port} where a flag is needed). One server per process: a front end and an API are two servers.',
      '2. "cwd" is a folder inside the worktree, relative to its root, "." for the root. Never an absolute path or "..".',
      '3. The only ready check is that the server\'s port accepts a connection.',
      '4. "install" is the one command that makes a fresh checkout runnable, such as the package manager\'s install.',
      '5. If the project has nothing to serve in a browser (a game, a native or command-line app), write {"noBrowser": true, "reason": "<one plain sentence>"} instead of inventing a config.'
    ].join('\n'),
    'The app reads that file and shows it as an unsaved draft for me to review. Edit no other file, start no server, and run no install.'
  ].join('\n\n')
}

export type PreviewDraftRead =
  | { kind: 'waiting' }
  | { kind: 'config'; config: PreviewConfig }
  | { kind: 'none'; reason: string }
  | { kind: 'empty' }
  | { kind: 'refused'; error: string }

/** Reads the draft file's text: text that is not JSON (yet) waits, since the file may be half written; anything else is a proposal or a refusal with its reason. */
export function readPreviewDraft(text: string): PreviewDraftRead {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { kind: 'waiting' }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { noBrowser?: unknown }).noBrowser === true) {
    const reason = (raw as { reason?: unknown }).reason
    return { kind: 'none', reason: typeof reason === 'string' ? reason.trim() : '' }
  }
  const read = readPreviewConfig(raw)
  if (!read.ok) return { kind: 'refused', error: read.error }
  if (read.config.servers.length === 0) return { kind: 'empty' }
  return { kind: 'config', config: read.config }
}

export const PREVIEW_SETUP_GIVE_UP_MS = 10 * 60_000
export const PREVIEW_EMPTY_GRACE_MS = 30_000

export type PreviewSettle =
  | { kind: 'wait' }
  | { kind: 'offer'; config: PreviewConfig }
  | { kind: 'end'; error: string | null; note: string | null; apply?: PreviewConfig }

/** What to do with a read of the draft file: keep waiting, end the setup (with what to show), or offer a proposal that landed over unsaved edits. */
export function settlePreviewDraft(read: PreviewDraftRead, ctx: { dirty: boolean; waitedMs: number; emptyForMs: number }): PreviewSettle {
  switch (read.kind) {
    case 'waiting':
      return ctx.waitedMs >= PREVIEW_SETUP_GIVE_UP_MS
        ? { kind: 'end', error: null, note: 'Claude gave no answer in 10 minutes, so the setup was stopped. Set up again to retry.' }
        : { kind: 'wait' }
    case 'empty':
      return ctx.emptyForMs < PREVIEW_EMPTY_GRACE_MS
        ? { kind: 'wait' }
        : { kind: 'end', error: "Claude's proposal has no servers; a project with nothing to serve says {\"noBrowser\": true}.", note: null }
    case 'refused':
      return { kind: 'end', error: `Claude's proposal was refused: ${read.error}`, note: null }
    case 'none':
      return { kind: 'end', error: null, note: read.reason ? `No browser needed: ${read.reason}` : 'No browser needed: this project has nothing to serve.' }
    case 'config':
      return ctx.dirty ? { kind: 'offer', config: read.config } : { kind: 'end', error: null, note: "Claude's proposal is loaded below, not saved. Check it, then Save.", apply: read.config }
  }
}
