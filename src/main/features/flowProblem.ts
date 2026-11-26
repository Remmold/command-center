import { promises as fs } from 'node:fs'
import { join } from 'node:path'

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/** Why a Claude folder cannot run `/flow` (no skill or command of that name), or null. */
export async function flowProblem(profile: { name: string; configDir: string; adopted: boolean }): Promise<string | null> {
  const offered = (await exists(join(profile.configDir, 'skills', 'flow', 'SKILL.md'))) || (await exists(join(profile.configDir, 'commands', 'flow.md')))
  if (offered) return null
  const why = profile.adopted
    ? 'It is an existing folder the app only reads, so it gets no shared skills.'
    : 'The default account has no /flow skill to share into it.'
  return `The ${profile.name} account cannot run /flow: ${profile.configDir} has no flow skill. ${why}`
}
