import { execFileSync } from 'node:child_process'
import { connect } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RendererApi } from '../src/shared/types'
import { expect, sessionList, test } from './harness'

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

test('New feature on a workspace of each of two accounts makes two Features rows, each feature session started on its own account folder', async ({ launched }) => {
  const { page, root, configDir, log } = launched
  mkdirSync(join(configDir, 'skills', 'flow'), { recursive: true })
  writeFileSync(join(configDir, 'skills', 'flow', 'SKILL.md'), '# flow')
  const personalRepo = repoAt(join(root, 'personal-repo'))
  const workRepo = repoAt(join(root, 'work-repo'))

  const setup = await page.evaluate(
    async ([personal, work]) => {
      const { api } = globalThis as unknown as { api: RendererApi }
      const profile = await api.profiles.create('Work')
      const a = await api.workspaces.addPath(personal)
      const b = await api.workspaces.addPath(work)
      if (!a.ok || !b.ok) throw new Error('workspace not added')
      await api.workspaces.setProfile(b.workspace.id, profile.id)
      return { personalId: a.workspace.id, workId: b.workspace.id, workConfig: profile.configDir }
    },
    [personalRepo, workRepo]
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

  const features = sessionList(page).getByRole('region', { name: 'Features' })
  await expect(features.getByRole('button', { name: /add-a-login-page/ })).toBeVisible()
  await expect(features.getByRole('button', { name: /export-reports/ })).toBeVisible()

  const configOf = (folder: string) => log.entries().find((e) => e.kind === 'argv' && String(e.cwd).replaceAll('\\', '/').endsWith(`-worktrees/${folder}`))?.configDir
  await expect.poll(() => configOf('add-a-login-page')).toBe(configDir)
  await expect.poll(() => configOf('export-reports')).toBe(setup.workConfig)
  await expect.poll(() => log.userTexts().some((t) => t.startsWith('/flow Add a login page') && t.includes('Feature name: add-a-login-page'))).toBe(true)
})

const SERVER = "import http from 'node:http'\nhttp.createServer((_req, res) => {\n  res.setHeader('content-type', 'text/html')\n  res.end('<title>fake</title><h1>Fake feature page ' + process.env.PORT + '</h1>')\n}).listen(Number(process.env.PORT))\n"

const accepts = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })

test('Test boots the feature server and opens the pair on its page; every step Pass and Complete stops the server and moves the feature under Completed, while the other account\'s feature keeps running', async ({ launched }) => {
  const { page, app, root, configDir } = launched
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
      return { personalId: a.workspace.id, workId: b.workspace.id }
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
