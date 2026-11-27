import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mainChatReply, type MainChatScope } from '../../shared/mainChat'
import { realPathFrom } from './realPath'

let base: string
beforeEach(async () => {
  base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'real-path-')))
  await fs.mkdir(join(base, 'wt', 'inner'), { recursive: true })
  await fs.mkdir(join(base, 'secrets'))
  await fs.writeFile(join(base, 'secrets', 'a.txt'), 'x')
  await fs.writeFile(join(base, 'wt', 'inner', 'ok.md'), 'x')
  await fs.symlink(join(base, 'secrets'), join(base, 'wt', 'link'), 'junction')
})
afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

const scope = (workspaces: string[], fenced: string[] = []): MainChatScope => ({ digestFile: '', chatDir: '', worktrees: [], workspaces, testFlowsFolder: '', fenced })

describe('the main chat read boundary on a real folder tree', () => {
  const reply = (file: string) => mainChatReply('Read', { file_path: file }, scope([join(base, 'wt')]), realPathFrom(base))

  it('keeps a fenced folder unreadable inside a workspace that holds it, however its case is written', async () => {
    const fenced = (file: string) => mainChatReply('Read', { file_path: file }, scope([base], [join(base, 'secrets')]), realPathFrom(base))
    expect((await fenced(join(base, 'wt', 'inner', 'ok.md'))).behavior).toBe('allow')
    expect((await fenced(join(base, 'secrets', 'a.txt'))).behavior).toBe('deny')
    expect((await fenced(join(base, 'SECRETS', 'A.txt'))).behavior).toBe('deny')
    expect((await fenced(join(base, 'wt', 'link', 'a.txt'))).behavior).toBe('deny')
  })

  it('allows a file inside the root, however its case is written', async () => {
    expect((await reply(join(base, 'wt', 'inner', 'ok.md'))).behavior).toBe('allow')
    expect((await reply(join(base, 'WT', 'Inner', 'OK.md'))).behavior).toBe('allow')
  })

  it('refuses a junction that leads out, a .. climb, and a file that does not exist', async () => {
    expect((await reply(join(base, 'wt', 'link', 'a.txt'))).behavior).toBe('deny')
    expect((await reply(join(base, 'wt', 'inner', '..', '..', 'secrets', 'a.txt'))).behavior).toBe('deny')
    expect((await reply(join(base, 'wt', 'nope.md'))).behavior).toBe('deny')
  })
})
