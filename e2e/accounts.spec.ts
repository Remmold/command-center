import type { RendererApi } from '../src/shared/types'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASIC_REPLY } from './common'
import { delayClaudeStart, evaluateMain, expect, send, startSession, test } from './harness'

test('a VS Code profile’s folder is offered, adopted logged in, never written to, and only forgotten on Remove', async ({ launched }) => {
  const { app, page, log, vscodeUserDir, root } = launched
  const work = join(root, 'claude-work')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, '.credentials.json'), '{}')
  writeFileSync(join(work, 'marker.txt'), 'mine')
  mkdirSync(join(vscodeUserDir, 'profiles', 'abc123'), { recursive: true })
  writeFileSync(
    join(vscodeUserDir, 'profiles', 'abc123', 'settings.json'),
    `{\n  // Work\n  "claudeCode.environmentVariables": [{ "name": "CLAUDE_CONFIG_DIR", "value": ${JSON.stringify(work)} },],\n}`
  )
  mkdirSync(join(vscodeUserDir, 'globalStorage'), { recursive: true })
  writeFileSync(join(vscodeUserDir, 'globalStorage', 'storage.json'), JSON.stringify({ userDataProfiles: [{ location: 'abc123', name: 'Work' }] }))
  const side = join(root, 'claude-side')
  mkdirSync(side, { recursive: true })

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Accounts', { exact: true }).click()
  const accounts = page.getByRole('region', { name: 'Account profiles' })
  const existing = page.getByRole('region', { name: 'Existing folders' })
  const row = (text: string) => accounts.getByRole('listitem').filter({ hasText: text })
  await expect(existing.getByText('Found in VS Code profile Work')).toBeVisible()
  await existing.getByRole('button', { name: 'Add' }).click()
  await expect(row('Work · logged in · existing folder')).toBeVisible()
  await expect(existing).toBeHidden()
  await expect.poll(() => log.entries().some((e) => e.kind === 'argv' && e.configDir === work)).toBe(true)

  const pickFolder = (folder: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
    }, folder)
  await pickFolder(work)
  await page.getByRole('button', { name: 'Use existing folder…' }).click()
  await expect(page.getByText('Work already uses this folder.')).toBeVisible()
  await pickFolder(side)
  await page.getByRole('button', { name: 'Use existing folder…' }).click()
  await expect(row('claude-side · not logged in · existing folder')).toBeVisible()

  let confirmText = ''
  page.once('dialog', (d) => {
    confirmText = d.message()
    void d.accept()
  })
  await row('Work ·').getByRole('button', { name: 'Remove' }).click()
  await expect(row('Work ·')).toBeHidden()
  expect(confirmText).toContain(`the folder ${work} stays on disk, untouched`)
  expect(readdirSync(work).sort()).toEqual(['.credentials.json', 'marker.txt'])
  expect(readdirSync(side)).toEqual([])
  await expect(existing.getByText('Found in VS Code profile Work')).toBeVisible()
})

function folderUri(path: string): string {
  const [drive, ...rest] = path.split(/[\\/]/)
  return `file:///${drive.toLowerCase().replace(':', '%3A')}/${rest.map(encodeURIComponent).join('/')}`
}

test('VS Code’s accounts are adopted in one click and new chats and workspaces use them; a repo’s own icon is found, and a pick stays after Detect again', async ({ launched }) => {
  const { vscodeUserDir, root, workspace } = launched
  const work = join(root, 'claude-work')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, '.credentials.json'), '{}')
  const second = join(root, 'second-repo')
  mkdirSync(second, { recursive: true })
  const settingsFile = join(vscodeUserDir, 'profiles', 'abc123', 'settings.json')
  const storageFile = join(vscodeUserDir, 'globalStorage', 'storage.json')
  mkdirSync(join(settingsFile, '..'), { recursive: true })
  mkdirSync(join(storageFile, '..'), { recursive: true })
  writeFileSync(settingsFile, JSON.stringify({ 'claudeCode.environmentVariables': [{ name: 'CLAUDE_CONFIG_DIR', value: work }] }))
  writeFileSync(
    storageFile,
    JSON.stringify({
      userDataProfiles: [{ location: 'abc123', name: 'Work' }],
      profileAssociations: { workspaces: { [folderUri(workspace)]: 'abc123', [folderUri(second)]: 'abc123', 'file:///c%3A/elsewhere': '__default__profile__' } }
    })
  )
  const vscodeBefore = [readFileSync(settingsFile, 'utf-8'), readFileSync(storageFile, 'utf-8')]
  const { app, page } = await launched.relaunch()
  const relaunched = { ...launched, app, page }

  await test.step('the Dashboard points at the suggestion, one click adopts the Work folder and moves the workspace, and new chats and workspaces use it', async () => {
    await page.getByRole('button', { name: 'Review in Settings' }).click()
    const banner = page.getByRole('region', { name: 'VS Code accounts' })
    await expect(banner).toHaveText(/VS Code uses the Work account for e2e-workspace\./)
    await banner.getByRole('button', { name: 'Use the same accounts' }).click()
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      'Chats already open keep their account; new chats and resumed ones use Work.'
    )
    await expect(banner).toBeHidden()
    await expect(page.getByRole('region', { name: 'Account profiles' }).getByRole('listitem').filter({ hasText: 'Work · logged in · existing folder' })).toBeVisible()
    expect(readdirSync(work)).toEqual(['.credentials.json'])
    expect([readFileSync(settingsFile, 'utf-8'), readFileSync(storageFile, 'utf-8')]).toEqual(vscodeBefore)

    await startSession(relaunched)
    expect(launched.log.entries().filter((e) => e.kind === 'argv' && e.cwd === workspace).map((e) => e.configDir)).toEqual([work])

    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
    }, second)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Workspaces', { exact: true }).click()
    await page.getByRole('button', { name: 'Add workspace' }).click()
    const workList = page.getByRole('region', { name: 'Workspaces' }).getByRole('region', { name: /^Work · / })
    await expect(workList.getByRole('listitem', { name: 'second-repo' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'VS Code accounts' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review in Settings' })).toHaveCount(0)
  })

  await test.step('the app icon is chosen automatically, the picker lists both, and a pick stays after Detect again', async () => {
    const repo = join(root, 'icons-repo')
    mkdirSync(join(repo, 'public'), { recursive: true })
    mkdirSync(join(repo, 'brand'), { recursive: true })
    writeFileSync(join(repo, 'public', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#3b82f6"/></svg>')
    const png = await evaluateMain(app, ({ nativeImage }, size: number) => {
      const pixels = Buffer.alloc(size * size * 4)
      for (let i = 0; i < pixels.length; i += 4) pixels.set([0x20, 0xa0, 0xe0, 0xff], i)
      return nativeImage.createFromBitmap(pixels, { width: size, height: size }).toPNG().toString('base64')
    }, 1024)
    writeFileSync(join(repo, 'brand', 'app-icon-1024.png'), Buffer.from(png, 'base64'))
    const before = readdirSync(repo, { recursive: true }).sort()

    await page.evaluate(async (path) => {
      const { api } = globalThis as unknown as { api: RendererApi }
      await api.workspaces.addPath(path)
    }, repo)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Workspaces', { exact: true }).click()
    const row = page.getByRole('listitem', { name: 'icons-repo' })
    await expect(row.locator('img')).toHaveCount(1)

    await row.getByRole('button', { name: 'edit icon and name of icons-repo' }).click()
    const picker = page.getByRole('dialog', { name: 'repo icon' })
    const found = picker.getByRole('group', { name: 'found in this repo' })
    await expect(found.getByRole('button')).toHaveCount(2)
    await expect(found.getByRole('button', { name: 'brand/app-icon-1024.png (automatic)' })).toHaveAttribute('aria-pressed', 'true')
    await expect(picker.getByText('Automatic: brand/app-icon-1024.png')).toBeVisible()
    if (process.env.CC_ICON_PICKER_SHOT) await page.screenshot({ path: process.env.CC_ICON_PICKER_SHOT })

    await found.getByRole('button', { name: 'public/favicon.svg' }).click()
    await expect(found.getByRole('button', { name: 'public/favicon.svg (picked)' })).toHaveAttribute('aria-pressed', 'true')
    await picker.getByRole('button', { name: 'Detect again' }).click()
    await expect(picker.getByRole('button', { name: 'Detect again' })).toBeEnabled()
    await expect(found.getByRole('button', { name: 'public/favicon.svg (picked)' })).toBeVisible()
    await expect(picker.getByText('Picked: public/favicon.svg')).toBeVisible()
    expect(readdirSync(repo, { recursive: true }).sort()).toEqual(before)
  })
})

test('Work shows a section per account with a waiting badge, the Board groups By account, Settings lists workspaces under their account', async ({ launched }) => {
  const { page, log, root, workspace } = launched
  const work = join(root, 'claude-work')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, '.credentials.json'), '{}')
  const workRepo = join(root, 'work-repo')
  const ticket = (repo: string, feature: string, title: string) => {
    mkdirSync(join(repo, '.scratch', feature, 'issues'), { recursive: true })
    writeFileSync(join(repo, '.scratch', feature, 'issues', '01-t.md'), `# 01: ${title}\n\n**Blocked by:** None\n\n**Status:** ready-for-agent\n`)
  }
  ticket(workspace, 'home-feature', 'Home ticket')
  ticket(workRepo, 'work-feature', 'Work ticket')
  const userData = join(root, 'user-data')
  writeFileSync(join(userData, 'profiles.json'), JSON.stringify([{ id: 'p-work', name: 'Work', createdAt: 1, configDir: work }]))
  await page.evaluate(async (path) => {
    const { api } = globalThis as unknown as { api: RendererApi }
    const added = await api.workspaces.addPath(path)
    if (added.ok) await api.workspaces.setProfile(added.workspace.id, 'p-work')
  }, workRepo)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const homeLabel = 'someone@example.com · Claude Ultra'
  const workLabel = 'Work · Claude Ultra'
  await startSession(launched)
  await page.keyboard.press('Control+t')
  await page.getByRole('option', { name: /work-repo/ }).first().click()
  await expect.poll(() => log.initializedIn(workRepo)).toBe(true)
  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()

  const list = page.getByRole('navigation', { name: 'Sessions' })
  const homeSection = list.getByRole('region', { name: homeLabel })
  const workSection = list.getByRole('region', { name: workLabel })
  await expect(homeSection.getByRole('region', { name: 'Idle' })).toBeVisible()
  await expect(workSection.getByRole('region', { name: 'Needs you' })).toBeVisible()
  const workHeader = workSection.getByRole('button', { name: workLabel })
  await expect(workHeader).not.toContainText('waiting')
  await expect(list.getByRole('region').first()).toHaveAttribute('aria-label', homeLabel)

  await workHeader.click()
  await expect(workSection.getByRole('region', { name: 'Needs you' })).toBeHidden()
  await expect(workHeader.getByTitle('1 chat in Work is waiting on you')).toHaveText('1 waiting')
  await page.keyboard.press('Alt+1')
  await page.keyboard.press('Control+Shift+J')
  await expect(workSection.getByRole('region', { name: 'Needs you' })).toBeVisible()

  await page.keyboard.press('Control+3')
  await page.getByRole('tab', { name: 'By account' }).click()
  const board = page.getByTestId('view-board')
  await expect(board.getByRole('region', { name: homeLabel }).getByText('Home ticket')).toBeVisible()
  await expect(board.getByRole('region', { name: workLabel }).getByText('Work ticket')).toBeVisible()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Workspaces', { exact: true }).click()
  await expect(page.getByRole('region', { name: workLabel }).getByRole('listitem', { name: 'work-repo' })).toBeVisible()
  await expect(page.getByRole('region', { name: homeLabel }).getByRole('listitem', { name: 'e2e-workspace' })).toBeVisible()
})

test('a Work chat shows the Work badge and pill, moving its workspace warns, and Restart resumes on the workspace account', async ({ launched }) => {
  const { app, page, log, root, configDir, workspace } = launched
  const work = join(root, 'claude-work')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, '.credentials.json'), '{}')
  writeFileSync(join(work, 'fake-account.json'), JSON.stringify({ email: 'me@work.example', organization: 'Work AB', subscriptionType: 'Claude Team' }))
  writeFileSync(join(root, 'user-data', 'profiles.json'), JSON.stringify([{ id: 'p-work', name: 'Work', createdAt: 1, configDir: work }]))
  await page.evaluate(async () => {
    const { api } = globalThis as unknown as { api: RendererApi }
    await api.workspaces.setProfile('e2e-workspace', 'p-work')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const workBadge = page.getByRole('button', { name: /^Account: Work( |$)/ })
  await delayClaudeStart(app, 2500)
  await page.keyboard.press('Control+2')
  await page.keyboard.press('Control+t')
  await page.getByRole('option', { name: /e2e-workspace/ }).first().click()
  await expect(workBadge).toContainText('pending')
  await expect.poll(() => log.initializedIn(workspace)).toBe(true)
  await expect(workBadge).not.toContainText('pending')
  await delayClaudeStart(app, 0)
  await expect(workBadge).toHaveAccessibleName('Account: Work · Claude Team')
  await expect(workBadge).toHaveAttribute('title', /Email: me@work\.example\nOrganization: Work AB\nConfig folder: .*claude-work\nReported by Claude/)

  const workPill = page.getByRole('button', { name: /^Account & usage for (Work|me@work\.example)$/ })
  const homePill = page.getByRole('button', { name: 'Account & usage for someone@example.com' })
  await expect(workPill).toHaveAttribute('aria-current', 'true')
  await expect(homePill).not.toHaveAttribute('aria-current', 'true')
  await expect(homePill).toHaveCSS('opacity', '0.5')

  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()

  await page.evaluate(() => (globalThis as unknown as { api: RendererApi }).api.usage.refresh('p-work'))
  const list = page.getByRole('navigation', { name: 'Sessions' })
  const workUsage = list.getByRole('list', { name: /^Usage for (Work|me@work.example)$/ })
  await expect(workUsage.getByText('Week 69%', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(workUsage.getByText(/^(on track|ahead of pace by \d+%)$/)).toBeVisible()
  await expect(workUsage.getByRole('meter', { name: /Weekly \(7 day\) time passed$/ })).toBeVisible()
  await list.getByRole('button', { name: /^Work · Claude Team/ }).click()
  await expect(workUsage).toBeVisible()
  await list.getByRole('button', { name: /^Work · Claude Team/ }).click()

  const moveWorkspaceTo = async (configFolder: string) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Workspaces', { exact: true }).click()
    await page.getByRole('button', { name: 'account profile for e2e-workspace' }).click()
    await page.getByTitle(configFolder, { exact: true }).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+2')
  }
  const starts = () => log.entries().filter((e) => e.kind === 'argv' && e.cwd === workspace)
  const resumedOn = (folder: string) => {
    const last = starts().at(-1)
    const argv = (last?.argv ?? []) as string[]
    return last?.configDir === folder && argv.includes('--resume')
  }

  await moveWorkspaceTo(configDir)
  await expect(page.getByText('Running on Work; this workspace is set to someone@example.com')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Account: Work/ })).toHaveAttribute('title', /This workspace is now set to another account/)

  await moveWorkspaceTo(work)
  await expect(page.getByText(/^Running on/)).toBeHidden()
  await moveWorkspaceTo(configDir)
  await page.getByRole('button', { name: 'Restart on someone@example.com' }).click()
  await expect.poll(() => resumedOn(configDir)).toBe(true)
  await expect(page.getByRole('button', { name: 'Account: someone@example.com · Claude Ultra' })).not.toContainText('pending')
  await expect(page.getByText(/^Running on/)).toBeHidden()

  await moveWorkspaceTo(work)
  await expect(page.getByText('Running on someone@example.com; this workspace is set to Work')).toBeVisible()
  await page.getByRole('button', { name: 'Restart on Work' }).click()
  await expect.poll(() => resumedOn(work)).toBe(true)
  await expect(workBadge).not.toContainText('pending')
  await expect(page.getByText(/^Running on/)).toBeHidden()
})
