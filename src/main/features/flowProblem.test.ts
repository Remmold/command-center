import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { flowProblem } from './flowProblem'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const folder = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'cc-flow-'))
  dirs.push(d)
  return d
}

describe('flowProblem', () => {
  it('accepts a folder with the flow skill', async () => {
    const configDir = folder()
    mkdirSync(join(configDir, 'skills', 'flow'), { recursive: true })
    writeFileSync(join(configDir, 'skills', 'flow', 'SKILL.md'), '# flow')
    expect(await flowProblem({ name: 'Work', configDir, adopted: false })).toBeNull()
  })
  it('refuses an adopted folder without it, naming the reason', async () => {
    const configDir = folder()
    expect(await flowProblem({ name: 'VS Code', configDir, adopted: true })).toMatch(/VS Code account cannot run \/flow.*only reads/)
  })
})
