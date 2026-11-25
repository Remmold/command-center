import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findTestFlows } from '../../shared/testFlow'
import type { AssistantMessageItem } from '../../shared/chatItems'
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

const shown = async (...paths: string[]) => (await readTestFlow(folder, paths)).view

describe('reading a test flow', () => {
  it('shows the HTML twin of a markdown file that has one', async () => {
    await fs.writeFile(join(folder, 'run.md'), '# Run')
    await fs.writeFile(join(folder, 'run.html'), '<h1>Run</h1>')
    const view = await shown(join(folder, 'run.md'))
    expect(view).toMatchObject({ kind: 'html', name: 'run.html' })
    expect(view.kind === 'html' && view.url).toMatch(/^cc-test-flow:\/\/flow\/run\.html\?v=\d+$/)
  })

  it('shows the markdown text when there is no twin', async () => {
    await fs.writeFile(join(folder, 'run.md'), '# Run\n\n- [ ] step')
    expect(await shown(join(folder, 'run.md'))).toEqual({ kind: 'md', name: 'run.md', text: '# Run\n\n- [ ] step' })
  })

  it('shows an HTML file as it is', async () => {
    await fs.writeFile(join(folder, 'explainer.html'), '<p>hi</p>')
    expect(await shown(join(folder, 'explainer.html'))).toMatchObject({ kind: 'html', name: 'explainer.html' })
  })

  it('says not found for a missing file', async () => {
    expect(await shown(join(folder, 'gone.md'))).toEqual({ found: false })
  })

  it('refuses a path outside the folder, in a subfolder, or of another type', async () => {
    await fs.writeFile(join(root, 'secret.md'), 'no')
    await fs.mkdir(join(folder, 'old'))
    await fs.writeFile(join(folder, 'old', 'run.md'), 'no')
    await fs.writeFile(join(folder, 'notes.txt'), 'no')
    for (const path of [join(root, 'secret.md'), join(folder, '..', 'secret.md'), join(folder, 'old', 'run.md'), join(folder, 'notes.txt'), 'run.md']) {
      expect(await shown(path)).toEqual({ found: false })
    }
  })
})

describe('reading the first candidate that exists', () => {
  function shell(id: string, command: string): AssistantMessageItem {
    const content = [{ type: 'tool_use' as const, id: `${id}-call`, name: 'Bash', input: { command } }]
    return { kind: 'assistant', id, content, raw: { type: 'assistant', message: { id, role: 'assistant', content } } } as AssistantMessageItem
  }

  it('skips a newer pick that only a probe named, showing the earlier write as its HTML twin', async () => {
    await fs.writeFile(join(folder, 'command-center.md'), '# Run')
    await fs.writeFile(join(folder, 'command-center.html'), '<h1>Run</h1>')
    const items = [
      shell('a', `python render_test_flow.py "${join(folder, 'command-center.md')}"`),
      shell('b', `test -f "${join(folder, 'command-center-test-flow.md')}" && echo yes`)
    ]
    const picks = findTestFlows({ items, folder, repoName: 'command-center' })
    expect(picks.map((p) => p.path)).toEqual([join(folder, 'command-center-test-flow.md'), join(folder, 'command-center.md')])
    expect(await shown(...picks.map((p) => p.path))).toMatchObject({ kind: 'html', name: 'command-center.html' })
  })

  it('watches the newer candidates that do not exist yet and the shown file, not the older ones', async () => {
    await fs.writeFile(join(folder, 'run.md'), '# Run')
    await fs.writeFile(join(folder, 'old.md'), '# Old')
    const read = await readTestFlow(folder, [join(folder, 'next.md'), join(root, 'outside.md'), join(folder, 'run.md'), join(folder, 'old.md')])
    expect(read.view).toMatchObject({ kind: 'md', name: 'run.md' })
    expect(read.watch.map((w) => w.path)).toEqual([join(folder, 'next.html'), join(folder, 'next.md'), join(folder, 'run.html'), join(folder, 'run.md')])
  })

  it('watches every candidate when none exists', async () => {
    const read = await readTestFlow(folder, [join(folder, 'explainer.html'), join(folder, 'repo.md')])
    expect(read.view).toEqual({ found: false })
    expect(read.watch.map((w) => w.path)).toEqual([join(folder, 'explainer.html'), join(folder, 'repo.html'), join(folder, 'repo.md')])
  })
})

describe('serving a test flow page', () => {
  it('serves an HTML file in the folder with a policy that blocks the network', async () => {
    await fs.writeFile(join(folder, 'run.html'), '<h1>Run</h1>')
    const response = await serveTestFlow(folder, 'cc-test-flow://flow/run.html?v=1')
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body.startsWith('<h1>Run</h1>')).toBe(true)
    expect(body.slice('<h1>Run</h1>'.length)).toMatch(/^<script>[^<]*cc-page-scroll[^<]*e\.source !== parent[^<]*<\/script>$/)
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
