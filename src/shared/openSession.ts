import { writeActionBlock, type ActionBlockKind } from './actionBlocks'

export const OPEN_SESSION_TAG = 'open-session'

const PARTS: ActionBlockKind<'feature'>['parts'] = [{ label: 'feature', oneLine: true }]

export const writeOpenSession = (feature: string): string => writeActionBlock({ tag: OPEN_SESSION_TAG, parts: PARTS, instructions: [] }, { feature })

const INSTRUCTIONS = [
  "Opening a session: when the user asks to go to, continue or look at a feature's session, write one open-session block naming the feature exactly as its heading in the feature digest:",
  writeOpenSession('<a feature name from the digest, exactly as its ## heading>'),
  'Rules for opening a session:',
  '- Name one feature from the digest. For work the digest does not list as a feature, say there is no session to open.',
  '- After the block, tell the user to press Open session on the card. It only shows that session; nothing is sent to it, and the app does not report back.'
]

/** The open-session kind: navigation only, so a card never reads Done and its outcome is never reported. */
export const OPEN_SESSION_BLOCK: ActionBlockKind<'feature'> = { tag: OPEN_SESSION_TAG, parts: PARTS, instructions: INSTRUCTIONS }

/** The feature an open-session card names: exactly one record of that exact name, else why the card cannot open it. */
export function featureNamed<F extends { name: string }>(name: string, features: readonly F[]): { kind: 'ok'; feature: F } | { kind: 'problem'; problem: string } {
  const wanted = name.trim()
  const found = features.filter((f) => f.name === wanted)
  if (found.length === 1) return { kind: 'ok', feature: found[0] }
  return { kind: 'problem', problem: found.length === 0 ? `No feature named ${wanted}` : `${found.length} features are named ${wanted}` }
}
