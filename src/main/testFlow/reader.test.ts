import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTestFlow, serveTestFlow } from './reader'

let root: string
let folder: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-test-flow-'))
  folder = join(root, 'test-flows')
  await fs.mkdir(folder)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('reading a test flow', () => {
  it('shows the HTML twin of a markdown file that has one', async () => {
    await fs.writeFile(join(folder, 'run.md'), '# Run')
    await fs.writeFile(join(folder, 'run.html'), '<h1>Run</h1>')
    const shown = await readTestFlow(folder, join(folder, 'run.md'))
    expect(shown).toMatchObject({ kind: 'html', name: 'run.html' })
    expect(shown.kind === 'html' && shown.url).toMatch(/^cc-test-flow:\/\/flow\/run\.html\?v=\d+$/)
  })

  it('shows the markdown text when there is no twin', async () => {
    await fs.writeFile(join(folder, 'run.md'), '# Run\n\n- [ ] step')
    expect(await readTestFlow(folder, join(folder, 'run.md'))).toEqual({ kind: 'md', name: 'run.md', text: '# Run\n\n- [ ] step' })
  })

  it('shows an HTML file as it is', async () => {
    await fs.writeFile(join(folder, 'explainer.html'), '<p>hi</p>')
    expect(await readTestFlow(folder, join(folder, 'explainer.html'))).toMatchObject({ kind: 'html', name: 'explainer.html' })
  })

  it('says not found for a missing file', async () => {
    expect(await readTestFlow(folder, join(folder, 'gone.md'))).toEqual({ found: false })
  })

  it('refuses a path outside the folder, in a subfolder, or of another type', async () => {
    await fs.writeFile(join(root, 'secret.md'), 'no')
    await fs.mkdir(join(folder, 'old'))
    await fs.writeFile(join(folder, 'old', 'run.md'), 'no')
    await fs.writeFile(join(folder, 'notes.txt'), 'no')
    for (const path of [join(root, 'secret.md'), join(folder, '..', 'secret.md'), join(folder, 'old', 'run.md'), join(folder, 'notes.txt'), 'run.md']) {
      expect(await readTestFlow(folder, path)).toEqual({ found: false })
    }
  })
})

describe('serving a test flow page', () => {
  it('serves an HTML file in the folder with a policy that blocks the network', async () => {
    await fs.writeFile(join(folder, 'run.html'), '<h1>Run</h1>')
    const response = await serveTestFlow(folder, 'cc-test-flow://flow/run.html?v=1')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<h1>Run</h1>')
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const policy = response.headers.get('content-security-policy') ?? ''
    expect(policy).toContain("default-src 'none'")
    expect(policy).not.toMatch(/https?:|\*/)
  })

  it('serves nothing else', async () => {
    await fs.writeFile(join(root, 'secret.html'), 'no')
    await fs.writeFile(join(folder, 'run.md'), 'no')
    for (const url of [
      'cc-test-flow://flow/..%2Fsecret.html',
      'cc-test-flow://flow/%2E%2E%5Csecret.html',
      `cc-test-flow://flow/${encodeURIComponent(join(root, 'secret.html'))}`,
      'cc-test-flow://flow/run.md',
      'cc-test-flow://flow/gone.html',
      'cc-test-flow://other/run.html'
    ]) {
      expect((await serveTestFlow(folder, url)).status, url).toBe(404)
    }
  })
})
