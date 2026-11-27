import { execFileSync } from 'node:child_process'
import { connect } from 'node:net'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RendererApi } from '../src/shared/types'
import { chatPane, expect, sessionList, test, useScript } from './harness'

function repoAt(path: string, files: Record<string, string> = {}): string {
  mkdirSync(path, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: path })
  git('init', '-b', 'main')
  writeFileSync(join(path, 'a.txt'), 'a')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(path, name), text)
  git('add', '.')
  git('commit', '-m', 'first')
  return path
}

const SERVER = "import http from 'node:http'\nhttp.createServer((_req, res) => {\n  res.setHeader('content-type', 'text/html')\n  res.end('<title>fake</title><h1>Fake feature page ' + process.env.PORT + '</h1>')\n}).listen(Number(process.env.PORT))\n"

const accepts = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })

test('New feature on a workspace of each of two accounts makes two Features rows, each feature session started on its own account folder; Test boots the feature server and opens the pair on its page; every step Pass and Complete stops the server and moves the feature under Completed, while the other account\'s feature keeps running', async ({ launched }) => {
  const { page, app, root, configDir, log } = launched
  mkdirSync(join(configDir, 'skills', 'flow'), { recursive: true })
  writeFileSync(join(configDir, 'skills', 'flow', 'SKILL.md'), '# flow')
  const personalRepo = repoAt(join(root, 'personal-repo'), { 'server.mjs': SERVER })
  const workRepo = repoAt(join(root, 'work-repo'), { 'server.mjs': SERVER })
  const flows = join(root, 'flows')
  mkdirSync(flows)
  const preview = { install: '', startPage: '/', servers: [{ name: 'web', command: 'node server.mjs', cwd: '.', ready: 'port' }] }

  const setup = await page.evaluate(
    async ([personal, work, folder, config]) => {
      const { api } = globalThis as unknown as { api: RendererApi }
      const profile = await api.profiles.create('Work')
      const a = await api.workspaces.addPath(personal)
      const b = await api.workspaces.addPath(work)
      if (!a.ok || !b.ok) throw new Error('workspace not added')
      await api.workspaces.setProfile(b.workspace.id, profile.id)
      await api.previewConfig.save(a.workspace.id, config)
      await api.previewConfig.save(b.workspace.id, config)
      await api.testFlow.setFolder(folder)
      return { personalId: a.workspace.id, workId: b.workspace.id, workConfig: profile.configDir }
    },
    [personalRepo, workRepo, flows, preview] as const
  )
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.keyboard.press('Control+2')

  const startFeature = async (workspaceId: string, description: string, name: string) => {
    await page.getByRole('button', { name: 'New feature' }).click()
    const dialog = page.getByRole('dialog', { name: 'New feature' })
    await dialog.getByRole('combobox', { name: 'Workspace' }).selectOption(workspaceId)
    await dialog.getByRole('textbox', { name: 'Feature description' }).fill(description)
    await expect(dialog.getByRole('textbox', { name: 'Feature name' })).toHaveValue(name)
    await dialog.getByRole('button', { name: 'Start feature' }).click()
    await expect(dialog).toBeHidden()
  }
  await startFeature(setup.personalId, 'Add a login page', 'add-a-login-page')
  await startFeature(setup.workId, 'Export reports', 'export-reports')

  const rows = sessionList(page).getByRole('region', { name: 'Features' })
  await expect(rows.getByRole('button', { name: /add-a-login-page/ })).toBeVisible()
  await expect(rows.getByRole('button', { name: /export-reports/ })).toBeVisible()
  const configOf = (folder: string) => log.entries().find((e) => e.kind === 'argv' && String(e.cwd).replaceAll('\\', '/').endsWith(`-worktrees/${folder}`))?.configDir
  await expect.poll(() => configOf('add-a-login-page')).toBe(configDir)
  await expect.poll(() => configOf('export-reports')).toBe(setup.workConfig)
  await expect.poll(() => log.userTexts().some((t) => t.startsWith('/flow Add a login page') && t.includes('Feature name: add-a-login-page'))).toBe(true)

  const written = await page.evaluate(async (flowsFolder) => {
    const { api } = globalThis as unknown as { api: RendererApi }
    const [features, workspaces] = await Promise.all([api.features.list(), api.workspaces.list()])
    return features.map((f) => ({ name: f.name, repoName: workspaces.find((w) => w.id === f.workspaceId)!.repoName, folder: flowsFolder }))
  }, flows)
  for (const { name, repoName } of written) {
    mkdirSync(join(flows, repoName), { recursive: true })
    writeFileSync(join(flows, repoName, `${name}.md`), `Test results: ${join(flows, repoName, `${name}.results.txt`)}\n\n- [ ] Open the page\n- [ ] See the heading\n`)
  }

  const features = sessionList(page).getByRole('region', { name: 'Features' })
  const rowOf = (name: string) => features.getByRole('listitem').filter({ has: page.getByRole('button', { name: new RegExp(name) }) })
  const portOf = (name: string) => page.evaluate(async (n) => (await (globalThis as unknown as { api: RendererApi }).api.features.list()).find((f) => f.name === n)!.ports[0], name)
  const windowAt = async (match: (url: string) => boolean) => {
    await expect.poll(() => app.windows().some((w) => match(w.url()))).toBe(true)
    return app.windows().find((w) => match(w.url()))!
  }

  await expect(rowOf('add-a-login-page')).toContainText('Testing')
  await expect(rowOf('export-reports')).toContainText('Testing')
  await rowOf('add-a-login-page').getByRole('button', { name: 'Test', exact: true }).click()
  await rowOf('export-reports').getByRole('button', { name: 'Test', exact: true }).click()

  await expect.poll(() => portOf('add-a-login-page')).toBeDefined()
  await expect.poll(() => portOf('export-reports')).toBeDefined()
  const loginPort = await portOf('add-a-login-page')
  const reportsPort = await portOf('export-reports')
  expect(loginPort).not.toBe(reportsPort)
  const loginPreview = await windowAt((u) => u.startsWith(`http://localhost:${loginPort}`))
  await windowAt((u) => u.startsWith(`http://localhost:${reportsPort}`))
  await expect(loginPreview.getByRole('heading', { name: `Fake feature page ${loginPort}` })).toBeVisible()
  const loginFlow = await windowAt((u) => u.includes('feature=add-a-login-page'))
  await windowAt((u) => u.includes('feature=export-reports'))

  await loginFlow.getByRole('button', { name: 'Pass step 1' }).click()
  await loginFlow.getByRole('button', { name: 'Pass step 2' }).click()
  await expect(loginFlow.getByRole('status')).toContainText('2 pass · 0 fail · 0 waiting')
  await expect(rowOf('add-a-login-page')).toContainText('all Pass')
  await rowOf('add-a-login-page').getByRole('button', { name: 'Complete', exact: true }).click()

  await expect(features.getByRole('button', { name: 'Completed' })).toBeVisible()
  await features.getByRole('button', { name: 'Completed' }).click()
  await expect(features.getByRole('button', { name: 'Re-open' })).toBeVisible()
  await expect.poll(() => accepts(loginPort)).toBe(false)
  await expect.poll(() => app.windows().some((w) => w.url().includes('add-a-login-page') || w.url().startsWith(`http://localhost:${loginPort}`))).toBe(false)
  expect(await accepts(reportsPort)).toBe(true)
  expect(app.windows().some((w) => w.url().includes('feature=export-reports'))).toBe(true)
  await expect(rowOf('export-reports')).toContainText('Testing')
})

test('The main chat proposes a feature; Go on the card starts it with brief.md in its worktree and a first prompt that names it, then the main chat starts afresh in place, naming the feature, with only the read tools and every workspace to read', async ({ launched }) => {
  const { page, app, root, configDir, log } = launched
  mkdirSync(join(configDir, 'skills', 'flow'), { recursive: true })
  writeFileSync(join(configDir, 'skills', 'flow', 'SKILL.md'), '# flow')
  const repo = repoAt(join(root, 'proposal-repo'))
  await useScript(app, 'proposal')
  await page.evaluate(async (path) => {
    const { api } = globalThis as unknown as { api: RendererApi }
    const added = await api.workspaces.addPath(path)
    if (!added.ok) throw new Error('workspace not added')
  }, repo)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.keyboard.press('Control+2')

  await sessionList(page).getByRole('button', { name: /Main chat/ }).click()
  const card = chatPane(page).locator('[data-action-card="feature-proposal"]')
  await expect(card).toHaveAttribute('data-action-state', 'live')
  const field = (name: string) => card.locator(`[data-action-field="${name}"]`)
  await expect(field('workspace')).toHaveText('proposal-repo')
  await expect(field('name')).toHaveText('add-export')
  await expect(field('description')).toHaveText('Export the report as CSV')
  await expect(field('starting brief')).toContainText('exportCsv(report)')

  await card.getByRole('button', { name: 'Go' }).click()

  const worktree = join(root, 'proposal-repo-worktrees', 'add-export')
  const brief = join(worktree, '.scratch', 'add-export', 'brief.md')
  await expect.poll(() => existsSync(brief)).toBe(true)
  expect(readFileSync(brief, 'utf-8')).toContain('exportCsv(report)')
  await expect.poll(() => log.userTexts().some((t) => t.startsWith('/flow Export the report as CSV') && t.includes('Starting brief:') && t.includes(brief))).toBe(true)

  // A successful Go starts the main chat afresh in the same pane: the old transcript and its card go, a notice leads to the feature.
  const notice = chatPane(page).locator('[data-main-chat-notice]')
  await expect(notice).toContainText('Started add-export in proposal-repo')
  await expect(chatPane(page).getByText('Fresh main chat. add-export continues in its own session')).toBeVisible()
  await expect(chatPane(page).locator('[data-action-card="feature-proposal"]')).toHaveCount(0)
  expect(log.userTexts().some((t) => t.startsWith('[Command Center]'))).toBe(false)
  const fresh = log.userTexts().filter((t) => t.startsWith('You are the main chat of Command Center'))
  expect(fresh).toHaveLength(2)
  expect(fresh[1]).toContain('Just started: the feature add-export in workspace proposal-repo')

  const mainStarts = log.entries().filter((e) => e.kind === 'argv' && (e.argv as string[]).some((a) => a.startsWith('--append-system-prompt=')))
  expect(mainStarts).toHaveLength(2)
  const args = mainStarts[1].argv as string[]
  expect(args).not.toContain('--resume')
  expect(args).toContain('--tools=Read,Grep,Glob')
  expect(args).toContain('--strict-mcp-config')
  expect((mainStarts[1].addDirs as string[]).map((d) => d.toLowerCase())).toEqual(expect.arrayContaining([repo.toLowerCase(), worktree.toLowerCase()]))

  // An open-session card shows the feature's session as the Features group does, and the app sends the chat nothing.
  const jump = chatPane(page).locator('[data-action-card="open-session"]')
  await expect(jump).toHaveAttribute('data-action-state', 'live')
  await expect(jump.locator('[data-action-field="feature"]')).toHaveText('add-export')
  await jump.getByRole('button', { name: 'Open session' }).click()
  await expect(chatPane(page).locator('[data-main-chat-notice]')).toHaveCount(0)
  await expect(chatPane(page).getByText('Hello! This is a scripted reply from the fake Claude.')).toBeVisible()
  expect(log.userTexts().some((t) => t.startsWith('[Command Center]'))).toBe(false)

  await sessionList(page).getByRole('button', { name: /Main chat/ }).click()
  await notice.getByRole('button', { name: 'Open session' }).click()
  await expect(notice.getByRole('alert')).toHaveCount(0)
})
