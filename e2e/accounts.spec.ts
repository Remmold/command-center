import type { RendererApi } from '../src/shared/types'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator } from '@playwright/test'
import { BASIC_REPLY } from './common'
import { delayClaudeStart, evaluateMain, expect, newChatIn, send, startSession, test } from './harness'

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
  const { app, page } = launched
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await test.step('the Dashboard points at the suggestion, one click adopts the Work folder and moves the workspace, and new chats and workspaces use it; a new chat there starts on the model and effort picked there', async () => {
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

    await startSession(launched)
    expect(launched.log.entries().filter((e) => e.kind === 'argv' && e.cwd === workspace).map((e) => e.configDir)).toEqual([work])

    const pane = page.locator('[data-chat-pane]:visible')
    const modelPill = pane.locator('[title="Switch model"]')
    const effortPill = pane.getByRole('button', { name: /^Effort: / })
    await modelPill.click()
    await page.getByRole('menuitemradio', { name: /^Sonnet 5\.5/ }).click()
    await expect(modelPill).toHaveText('Sonnet 5.5')
    await effortPill.click()
    await page.getByRole('dialog', { name: 'Effort' }).getByRole('button', { name: /^Effort/ }).click()
    await expect(effortPill).toHaveAccessibleName('Effort: High')
    await page.keyboard.press('Escape')
    const from = launched.log.entries().length
    await delayClaudeStart(app, 1000)
    await page.keyboard.press('Control+t')
    await newChatIn(page, /e2e-workspace/)
    await expect(modelPill).toHaveText('Sonnet 5.5')
    await expect(effortPill).toHaveAccessibleName('Effort: High')
    expect(launched.log.initializedIn(workspace, from)).toBe(false)
    await expect.poll(() => launched.log.initializedIn(workspace, from)).toBe(true)
    await delayClaudeStart(app, 0)
    const argv = (launched.log.entries().slice(from).find((e) => e.kind === 'argv')?.argv ?? []) as string[]
    expect(argv.join(' ')).toContain('--model sonnet --effort high')
    expect(readdirSync(work)).not.toContain('settings.json')

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

test('Work shows a one-line header per account with a waiting badge, the Board groups By account, Settings lists workspaces under their account', async ({ launched }) => {
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

  const homeLabel = 'Personal · Claude Ultra'
  const workLabel = 'Work · Claude Ultra'
  await startSession(launched)
  await page.keyboard.press('Control+t')
  await newChatIn(page, /work-repo/)
  await expect.poll(() => log.initializedIn(workRepo)).toBe(true)
  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()

  const list = page.getByRole('navigation', { name: 'Sessions' })
  const homeSection = list.getByRole('region', { name: 'Personal · Ultra' })
  const workSection = list.getByRole('region', { name: 'Work · Ultra' })
  const workWaiting = workSection.getByRole('listitem').filter({ has: page.getByRole('img', { name: 'Your turn' }) })
  await expect(homeSection.getByRole('listitem').getByRole('img', { name: 'Idle' })).toBeVisible()
  await expect(workWaiting).toBeVisible()
  await expect(workWaiting.getByRole('button').first()).toHaveClass(/inset_2px/)
  const workHeader = workSection.getByRole('button', { name: /^Work · Ultra/ })
  await expect(workHeader).not.toContainText('waiting')
  await expect(list.getByRole('region').first()).toHaveAttribute('aria-label', 'Personal · Ultra')

  await expect(homeSection.getByRole('region', { name: 'Ungrouped' }).getByRole('listitem')).toHaveCount(1)
  const repoHeader = workSection.getByRole('region', { name: 'Ungrouped' }).getByRole('button', { name: /^Ungrouped/ })
  await expect(repoHeader).toHaveText(/Ungrouped$/)
  await repoHeader.click()
  await expect(workWaiting).toBeHidden()
  await expect(repoHeader).toHaveText(/Ungrouped1 waiting1$/)
  await expect(repoHeader.getByTitle('1 chat in Ungrouped is waiting on you')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('work-repo')
  await expect(workWaiting).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('')
  await expect(workWaiting).toBeHidden()

  await workHeader.click()
  await expect(workHeader.getByTitle('1 chat in Work is waiting on you')).toHaveText('1 waiting')
  await page.keyboard.press('Alt+1')
  await expect(homeSection.getByRole('listitem').getByRole('button').first()).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Control+Shift+J')
  await expect(workWaiting).toBeVisible()
  await expect(repoHeader).toHaveText(/Ungrouped$/)

  await page.keyboard.press('Control+3')
  await page.getByRole('tab', { name: 'By account' }).click()
  const board = page.getByTestId('view-board')
  await expect(board.getByRole('region', { name: homeLabel }).getByText('Home ticket')).toBeVisible()
  await expect(board.getByRole('region', { name: workLabel }).getByText('Work ticket')).toBeVisible()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Workspaces', { exact: true }).click()
  await expect(page.getByRole('region', { name: workLabel }).getByRole('listitem', { name: 'work-repo' })).toBeVisible()
  await expect(page.getByRole('region', { name: homeLabel }).getByRole('listitem', { name: 'e2e-workspace' })).toBeVisible()

  await test.step('own groups: made from the account menu, a chat dragged into one, a group dragged above another, a drop on another account refused, Alt+Shift+Up into the group above, all kept after a reload', async () => {
    await page.keyboard.press('Control+2')
    const homeChat = homeSection.getByRole('listitem')
    const groupNames = () => homeSection.locator('section').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const header = (name: string) => homeSection.getByRole('region', { name }).locator('[data-section-header]')
    const drag = async (from: Locator, to: Locator, half: 'top' | 'bottom') => {
      const a = (await from.boundingBox())!
      const b = (await to.boundingBox())!
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
      await page.mouse.down()
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 6, { steps: 2 })
      await page.mouse.move(b.x + b.width / 2, b.y + b.height * (half === 'top' ? 0.25 : 0.75), { steps: 4 })
      await page.mouse.up()
    }
    await homeSection.getByRole('button', { name: /^Personal · Ultra/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'New group' }).click()
    await homeSection.getByRole('textbox', { name: 'Group name' }).fill('Today')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'New group', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Personal', exact: true }).click()
    await homeSection.getByRole('textbox', { name: 'Group name' }).fill('Later')
    await page.keyboard.press('Enter')
    await expect.poll(groupNames).toEqual(['Ungrouped', 'Today', 'Later'])

    await drag(homeChat, header('Today'), 'top')
    await expect(homeSection.getByRole('region', { name: 'Today' }).getByRole('listitem')).toHaveCount(1)
    await drag(header('Later'), header('Today'), 'top')
    await expect.poll(groupNames).toEqual(['Later', 'Today'])
    await drag(homeChat, workWaiting, 'top')
    await expect(workSection.getByRole('listitem')).toHaveCount(1)
    await expect(homeSection.getByRole('region', { name: 'Today' }).getByRole('listitem')).toHaveCount(1)
    await homeChat.getByRole('button').first().focus()
    await page.keyboard.press('Alt+Shift+ArrowUp')
    await expect(homeSection.getByRole('region', { name: 'Later' }).getByRole('listitem')).toHaveCount(1)
    await expect(homeChat.getByRole('button').first()).toBeFocused()

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.keyboard.press('Control+2')
    await expect(homeSection.getByRole('region', { name: 'Later' }).getByRole('listitem')).toHaveCount(1)
    await expect.poll(groupNames).toEqual(['Later', 'Today'])
  })
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
  await newChatIn(page, /e2e-workspace/)
  await expect(workBadge).toContainText('pending')
  await expect.poll(() => log.initializedIn(workspace)).toBe(true)
  await expect(workBadge).not.toContainText('pending')
  await delayClaudeStart(app, 0)
  await expect(workBadge).toHaveAccessibleName('Account: Work · Claude Team')
  await expect(workBadge).toHaveAttribute('title', /Email: me@work\.example\nOrganization: Work AB\nConfig folder: .*claude-work\nReported by Claude/)

  const workPill = page.getByRole('button', { name: /^Account & usage for (Work|me@work\.example)$/ })
  const homePill = page.getByRole('button', { name: 'Account & usage for Personal' })
  await expect(workPill).toHaveAttribute('aria-current', 'true')
  await expect(homePill).not.toHaveAttribute('aria-current', 'true')
  await expect(homePill).toHaveCSS('opacity', '0.5')

  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()

  await page.evaluate(() => (globalThis as unknown as { api: RendererApi }).api.usage.refresh('p-work'))
  const list = page.getByRole('navigation', { name: 'Sessions' })
  const workHeader = list.getByRole('button', { name: /^Work · Team/ })
  await expect(workHeader.getByRole('meter', { name: 'Work Weekly (7 day)' })).toHaveAttribute('aria-valuenow', '69', { timeout: 15_000 })
  await expect(workHeader).toContainText('69%')
  await expect(workHeader).toHaveAttribute('title', /^Work · Claude Team\nme@work\.example\nWeekly \(7 day\): 69% used · \d+% of the week passed · (on track|ahead of pace by \d+%) · resets /)
  await workHeader.click()
  await expect(workHeader.getByRole('meter', { name: 'Work Weekly (7 day)' })).toBeVisible()
  await workHeader.click()

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
  await expect(page.getByText('Running on Work; this workspace is set to Personal')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Account: Work/ })).toHaveAttribute('title', /This workspace is now set to another account/)

  await moveWorkspaceTo(work)
  await expect(page.getByText(/^Running on/)).toBeHidden()
  await moveWorkspaceTo(configDir)
  await page.getByRole('button', { name: 'Restart on Personal' }).click()
  await expect.poll(() => resumedOn(configDir)).toBe(true)
  await expect(page.getByRole('button', { name: 'Account: Personal · Claude Ultra' })).not.toContainText('pending')
  await expect(page.getByText(/^Running on/)).toBeHidden()

  await moveWorkspaceTo(work)
  await expect(page.getByText('Running on Personal; this workspace is set to Work')).toBeVisible()
  await page.getByRole('button', { name: 'Restart on Work' }).click()
  await expect.poll(() => resumedOn(work)).toBe(true)
  await expect(workBadge).not.toContainText('pending')
  await expect(page.getByText(/^Running on/)).toBeHidden()
})
