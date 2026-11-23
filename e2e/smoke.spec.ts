import type { ElectronApplication, Page } from '@playwright/test'
import type { RendererApi } from '../src/shared/types'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cliPermissionMode, delayClaudeStart, evaluateMain, expect, newChatIn, prompt, send, startSession, test, transcriptsOf, type FakeLog } from './harness'

const BASIC_REPLY = 'Hello! This is a scripted reply from the fake Claude.'
const WRITE_DONE = 'Created hello.txt containing hi.'

test('a new session streams the fake reply', async ({ launched }) => {
  const { page, log } = launched
  await startSession(launched)
  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()
  await expect.poll(() => log.entries().filter((e) => e.kind === 'received' && e.line?.type === 'user').length).toBe(1)
  const launch = log.entries().find((e) => e.kind === 'argv' && e.cwd === launched.workspace)
  expect(launch?.configDir).toBe(launched.configDir)
})

test('Ctrl+1/2/3 switch Dashboard, Work and Board', async ({ launched }) => {
  const { page } = launched
  const tab = (name: string) => page.getByRole('tab', { name, exact: true })
  const views = {
    Dashboard: page.getByTestId('view-dashboard'),
    Work: page.getByTestId('view-work'),
    Board: page.getByTestId('view-board')
  }
  const expectOnly = async (name: keyof typeof views) => {
    await expect(tab(name)).toHaveAttribute('aria-selected', 'true')
    for (const [other, view] of Object.entries(views)) {
      if (other === name) await expect(view).toBeVisible()
      else await expect(view).toBeHidden()
    }
  }
  await page.keyboard.press('Control+2')
  await expectOnly('Work')
  await page.keyboard.press('Control+3')
  await expectOnly('Board')
  await page.keyboard.press('Control+1')
  await expectOnly('Dashboard')
})

test('the usage strip shows the fake account and its weekly bar', async ({ launched }) => {
  const { page } = launched
  const strip = page.getByRole('list', { name: 'usage per account profile' })
  await expect(strip.getByText('someone@example.com')).toBeVisible()
  await expect(strip.getByRole('meter', { name: 'someone@example.com Weekly (7 day)', exact: true })).toHaveAttribute('aria-valuenow', '69')
  await expect(strip.getByRole('meter', { name: 'someone@example.com Weekly (7 day) time passed', exact: true })).toHaveAttribute('aria-valuenow', /^\d+$/)
})

test('Shift+Tab sends set_permission_mode', async ({ launched }) => {
  const { page, log } = launched
  await startSession(launched)
  await prompt(page).press('Shift+Tab')
  await expect(page.locator('[data-chat-pane]').getByRole('button', { name: 'Edit automatically', exact: true })).toBeVisible()
  await expect.poll(() => log.controlRequests('set_permission_mode').map((r) => r.mode)).toContain('acceptEdits')
})

test.describe('the mode a new session starts in', () => {
  const modeButton = (page: Page, label: string) => page.locator('[data-chat-pane]').getByRole('button', { name: label, exact: true })

  test('is Manual when settings.json sets no default mode', async ({ launched }) => {
    const { page, log, workspace } = launched
    await startSession(launched)
    await expect(modeButton(page, 'Manual')).toBeVisible()
    expect(cliPermissionMode(log, workspace)).toBe('default')
  })

  test.describe('with permissions.defaultMode in settings.json', () => {
    test.use({ userSettings: { permissions: { defaultMode: 'plan' } } })

    test("is the settings' mode", async ({ launched }) => {
      const { page, log, workspace } = launched
      await startSession(launched)
      await expect(modeButton(page, 'Plan')).toBeVisible()
      expect(cliPermissionMode(log, workspace)).toBe('plan')
    })
  })

  test('picked while the process is still starting, reaches the CLI', async ({ launched }) => {
    const { app, page, log, workspace } = launched
    await delayClaudeStart(app, 2000)
    await page.keyboard.press('Control+2')
    await page.keyboard.press('Control+t')
    await newChatIn(page, /e2e-workspace/)
    await page.locator('[data-chat-pane]').getByRole('button', { name: /^(Manual|Edit automatically)$/ }).click()
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click()
    expect(log.initializedIn(workspace)).toBe(false)
    await expect.poll(() => log.initializedIn(workspace)).toBe(true)
    await expect.poll(() => cliPermissionMode(log, workspace)).toBe('plan')
    await expect(modeButton(page, 'Plan')).toBeVisible()
  })
})

test('a model and effort change send apply_flag_settings', async ({ launched }) => {
  const { page, log } = launched
  await startSession(launched)
  const pill = page.locator('[data-chat-pane] [title="Switch model"]')
  const settings = () => log.controlRequests('apply_flag_settings').map((r) => r.settings as Record<string, unknown>)

  await pill.click()
  await page.getByRole('menuitemradio', { name: /^Sonnet 5\.5/ }).click()
  await expect.poll(settings).toContainEqual({ model: 'sonnet' })
  await expect(page.getByText('Set model to Sonnet 5.5')).toBeVisible()

  await pill.click()
  await page.getByRole('dialog', { name: 'Select a model' }).getByRole('button', { name: /^Effort/ }).click()
  await expect.poll(settings).toContainEqual({ effortLevel: 'high' })
  await expect(page.getByText('Set effort to High')).toBeVisible()
})

test.describe('slow turn', () => {
  test.use({ script: 'slow' })

  test('Stop sends interrupt and shows Interrupted', async ({ launched }) => {
    const { page, log } = launched
    await startSession(launched)
    await send(page, 'run the long job')
    await expect(page.getByText('Starting a long job.')).toBeVisible()
    await page.getByRole('button', { name: 'stop' }).click()
    await expect.poll(() => log.controlRequests('interrupt').length).toBe(1)
    await expect(page.getByText('Interrupted', { exact: true })).toBeVisible()
    await expect(prompt(page)).toBeEditable()
    await expect(page.getByText('The long job finished.')).toHaveCount(0)
  })

  test('a prompt sent mid-turn shows queued and starts after Esc from the transcript stops the turn', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    const queued = pane.getByRole('article', { name: 'You, queued' })
    const userLines = () => log.entries().filter((e) => e.kind === 'received' && e.line?.type === 'user')
    await startSession(launched)
    await send(page, 'run the long job')
    await expect(page.getByText('Starting a long job.')).toBeVisible()
    await expect(pane.getByRole('button', { name: 'Stop' })).toBeVisible()

    await prompt(page).fill('and then this')
    await expect(pane.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    await prompt(page).press('Enter')
    await expect(queued).toHaveText('and then this')
    await expect(pane.getByRole('button', { name: 'Stop' })).toBeVisible()
    await expect.poll(() => userLines().length).toBe(2)
    expect(userLines()[1].line).toMatchObject({ uuid: expect.any(String) })
    expect(log.controlRequests('interrupt')).toHaveLength(0)

    await pane.locator('[tabindex="-1"]').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Escape')
    await expect.poll(() => log.controlRequests('interrupt').length).toBe(1)
    await expect(queued).toHaveCount(0)
    await expect(pane.getByText('and then this')).toBeVisible()
    await expect(page.getByText('Starting a long job.')).toHaveCount(2)
  })
})

test.describe('working indicator', () => {
  test.use({ script: 'slow' })

  test('the working line shows while a turn runs and goes when it ends and after Stop', async ({ launched }) => {
    const { page } = launched
    const pane = page.locator('[data-chat-pane]')
    const line = pane.locator('[data-working-line]')
    await startSession(launched)
    await send(page, 'quick one')
    await expect(line).toBeVisible()
    await expect(line).toContainText(/[A-Z][a-z]+\.\.\./)
    await expect(pane.getByText('Quick reply.')).toBeVisible()
    await expect(line).toHaveCount(0)

    await send(page, 'run the long job')
    await expect(pane.getByText('Starting a long job.')).toBeVisible()
    await expect(line).toBeVisible()
    await pane.getByRole('button', { name: 'Stop' }).click()
    await expect(line).toHaveCount(0)
  })

  test('a running Bash call blinks, offers Run in background, and the click sends background_tasks for it', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)
    await send(page, 'build it')
    const row = pane.locator('[data-timeline-row]', { hasText: 'pnpm build' })
    await expect(row.getByRole('img', { name: 'running' })).toBeVisible()
    const action = row.getByRole('button', { name: 'Run in background' })
    await expect(action).toBeVisible()
    await action.click()
    await expect.poll(() => log.controlRequests('background_tasks')).toEqual([{ subtype: 'background_tasks', tool_use_id: expect.stringMatching(/^toolu_fake/) }])
    await expect(pane.getByText('The build is done.')).toBeVisible()
    await expect(row.getByRole('img', { name: 'succeeded' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Run in background' })).toHaveCount(0)
    await expect(pane.locator('[data-working-line]')).toHaveCount(0)
  })
})

test.describe('auto-update', () => {
  test.use({ script: 'slow', env: { CC_UPDATE_IDLE_MS: '1500' } })

  type Fake = { restartRequests: number; checks: number; deliver: (version: string) => void }
  /** The main process's fake updater; Playwright sends the function's source, so it must not close over anything. */
  const fakeCount = (app: ElectronApplication, key: 'restartRequests' | 'checks'): Promise<number> =>
    evaluateMain(app, (_electron, k: string) => (globalThis as unknown as { __ccFakeUpdater: Record<string, number> }).__ccFakeUpdater[k], key)
  const deliverUpdate = (app: ElectronApplication, version: string): Promise<void> =>
    evaluateMain(app, (_electron, v: string) => (globalThis as unknown as { __ccFakeUpdater: Fake }).__ccFakeUpdater.deliver(v), version)
  const restartRequests = (app: ElectronApplication): Promise<number> => fakeCount(app, 'restartRequests')

  test('an update that arrives mid-turn waits for the chat; once it is idle the restart is requested after the timer', async ({ launched }) => {
    const { app, page } = launched
    const pill = page.getByRole('button', { name: 'Restart to update' })
    await startSession(launched)
    await send(page, 'run the long job')
    await expect(page.getByText('Starting a long job.')).toBeVisible()
    await expect(pill).toHaveCount(0)

    await deliverUpdate(app, '9.9.9')
    await expect(pill).toBeVisible()
    await page.waitForTimeout(2500)
    expect(await restartRequests(app)).toBe(0)

    await pill.click()
    const dialog = page.getByRole('dialog', { name: 'Restart to update' })
    await expect(dialog.getByText('1 chat is working. Restart anyway?')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    expect(await restartRequests(app)).toBe(0)

    await page.locator('[data-chat-pane]').getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByText('Interrupted', { exact: true })).toBeVisible()
    await expect(pill).toBeVisible()
    await expect.poll(() => restartRequests(app), { timeout: 10_000 }).toBe(1)
  })

  test('Settings → General shows the version and the last check, and Check now checks again', async ({ launched }) => {
    const { app, page } = launched
    const checks = (): Promise<number> => fakeCount(app, 'checks')
    await expect.poll(checks).toBe(1)
    await page.keyboard.press('Control+,')
    await page.getByRole('button', { name: 'General' }).click()
    const updates = page.getByRole('region', { name: 'Updates' })
    await expect(updates.getByText('Current version')).toBeVisible()
    await expect(updates.getByText(/^Last checked /)).toBeVisible()
    await updates.getByRole('button', { name: 'Check now' }).click()
    await expect.poll(checks).toBe(2)
  })
})

test('an unsent draft survives the window reloading', async ({ launched }) => {
  const { page } = launched
  await startSession(launched)
  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()
  await prompt(page).fill('half a thought')
  await page.reload()
  await page.keyboard.press('Control+2')
  await expect(prompt(page)).toHaveValue('half a thought')
})

test('↑/↓ recall earlier prompts and Ctrl+J adds a line', async ({ launched }) => {
  const { page } = launched
  await startSession(launched)
  await send(page, 'first prompt')
  await expect(page.getByText(BASIC_REPLY)).toHaveCount(1)
  await send(page, 'second prompt')
  await expect(page.getByText(BASIC_REPLY)).toHaveCount(2)

  await prompt(page).fill('draft')
  await prompt(page).press('Home')
  await prompt(page).press('ArrowUp')
  await expect(prompt(page)).toHaveValue('second prompt')
  await prompt(page).press('ArrowUp')
  await expect(prompt(page)).toHaveValue('first prompt')
  await prompt(page).press('End')
  await prompt(page).press('ArrowDown')
  await expect(prompt(page)).toHaveValue('second prompt')
  await prompt(page).press('End')
  await prompt(page).press('ArrowDown')
  await expect(prompt(page)).toHaveValue('draft')

  await prompt(page).fill('')
  await prompt(page).pressSequentially('a')
  await prompt(page).press('Control+j')
  await prompt(page).pressSequentially('b')
  await expect(prompt(page)).toHaveValue(['a', 'b'].join(String.fromCharCode(10)))
  await expect(page.getByTestId('view-work')).toBeVisible()
})

test('the slash menu sends on Enter, inserts with a hint on Tab, and opens the app’s own UI', async ({ launched }) => {
  const { page, log } = launched
  const menu = page.getByRole('listbox', { name: 'Actions' })
  await startSession(launched)

  await prompt(page).pressSequentially('/comp')
  await expect(menu.getByRole('option', { name: '/compact' })).toHaveAttribute('aria-selected', 'true')
  await prompt(page).press('Enter')
  await expect.poll(() => log.userTexts()).toContain('/compact')
  await expect(prompt(page)).toHaveValue('')
  await expect(menu).toHaveCount(0)

  await prompt(page).pressSequentially('/mod')
  await prompt(page).press('Tab')
  await expect(prompt(page)).toHaveValue('/model ')
  await expect(page.locator('[data-argument-hint]')).toHaveText('<model>')

  await prompt(page).fill('')
  await prompt(page).pressSequentially('/model')
  await prompt(page).press('Enter')
  await expect(page.getByRole('dialog', { name: 'Select a model' })).toBeVisible()
  await page.keyboard.press('Escape')

  await prompt(page).pressSequentially('/context')
  await prompt(page).press('Enter')
  const context = page.getByRole('dialog', { name: 'Context usage' })
  await expect(context.getByText('22.1k / 1.0M tokens (2%)')).toBeVisible()
  await expect(context.getByText('~\\.claude\\CLAUDE.md')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(context).toHaveCount(0)

  await prompt(page).pressSequentially('/usage')
  await prompt(page).press('Enter')
  await expect(page.getByRole('dialog', { name: 'Account & Usage' })).toBeVisible()
  expect(log.userTexts()).toEqual(['/compact'])
})

test.describe('a full context', () => {
  test.use({ script: 'context' })

  test('the context pie shows from the start, refreshes after a turn and sends /compact when clicked', async ({ launched }) => {
    const { page, log } = launched
    await startSession(launched)
    const pie = page.getByRole('button', { name: '72% context used — click to compact' })
    await expect(pie).toBeVisible()
    await send(page, 'hello')
    await expect(page.getByText('This chat is getting long.')).toBeVisible()
    await expect.poll(() => log.controlRequests('get_context_usage').length).toBe(2)
    await expect(pie).toHaveAttribute('title', '28% of context remaining until auto-compact.\nClick to compact now.')
    await pie.click()
    await expect.poll(() => log.userTexts()).toEqual(['hello', '/compact'])
  })
})

test.describe('tool approval', () => {
  test.use({ script: 'approval' })

  const approval = (page: Page) => page.getByRole('group', { name: 'Approve Write' })

  test.beforeEach(async ({ launched }) => {
    const { page, log } = launched
    await startSession(launched)
    await expect(page.locator('[data-chat-pane]').getByRole('button', { name: 'Manual', exact: true })).toBeVisible()
    expect(cliPermissionMode(log, launched.workspace)).toBe('default')
  })

  test('1 approves and the tool runs', async ({ launched }) => {
    const { page, log } = launched
    await send(page, 'create hello.txt')
    await expect(approval(page)).toBeVisible()
    await page.keyboard.press('1')
    await expect(page.getByText(WRITE_DONE)).toBeVisible()
    await expect(approval(page)).toBeHidden()
    await expect.poll(() => log.approvalReplies()).toEqual([expect.objectContaining({ behavior: 'allow' })])
  })

  test('3 with feedback denies and logs the feedback', async ({ launched }) => {
    const { page, log } = launched
    await send(page, 'create hello.txt')
    await expect(approval(page)).toBeVisible()
    await approval(page).getByRole('textbox', { name: 'Tell Claude what to do instead' }).fill('name it greeting.txt')
    await approval(page).getByRole('button', { name: /Yes/ }).first().focus()
    await page.keyboard.press('3')
    await expect(page.getByText("Understood, I won't create the file.")).toBeVisible()
    await expect.poll(() => log.approvalReplies()).toEqual([
      expect.objectContaining({ behavior: 'deny', interrupt: false, message: expect.stringContaining('"name it greeting.txt"') })
    ])
  })

  test('"allow for this session" skips the second prompt', async ({ launched }) => {
    const { page, log } = launched
    await send(page, 'create hello.txt')
    await expect(approval(page)).toBeVisible()
    await page.keyboard.press('2')
    await expect(page.getByText(WRITE_DONE)).toHaveCount(1)
    await expect(prompt(page)).toBeEditable()

    await send(page, 'create it again')
    await expect(page.getByText(WRITE_DONE)).toHaveCount(2)
    await expect(approval(page)).toHaveCount(0)
    await expect.poll(() => log.toolPrompts()).toBe(1)
    expect(log.approvalReplies()).toEqual([
      expect.objectContaining({ behavior: 'allow', updatedPermissions: [expect.objectContaining({ type: 'setMode', mode: 'acceptEdits' })] })
    ])
  })
})

/** The system clipboard, with Windows line ends turned back into the plain newlines the app copied. */
async function clipboardText(app: ElectronApplication): Promise<string> {
  return (await evaluateMain(app, ({ clipboard }) => clipboard.readText(), undefined)).replace(/\r\n/g, '\n')
}

test.describe('chat rendering', () => {
  test.use({ script: 'render' })

  test('thinking, the todo checklist, copy buttons and timestamps render as in the extension', async ({ launched }) => {
    const { app, page } = launched
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)
    await send(page, 'plan the work')
    await expect(pane.getByText('All planned.')).toBeVisible()

    await expect(pane.getByText(/^Thought for \ds$/)).toBeVisible()

    const lists = pane.getByRole('button', { name: /Update Todos/ })
    await expect(lists).toHaveCount(2)
    await expect(lists.nth(0)).toHaveAttribute('aria-expanded', 'false')
    await expect(lists.nth(1)).toHaveAttribute('aria-expanded', 'true')
    const items = pane.locator('li[data-state]')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveAttribute('data-state', 'checked')
    await expect(items.nth(1)).toHaveAttribute('data-state', 'mixed')

    await pane.locator('pre').hover()
    await pane.getByRole('button', { name: 'Copy code to clipboard' }).click()
    await expect.poll(() => clipboardText(app)).toBe("console.log('copied')")

    await pane.getByText('All planned.').hover()
    await pane.getByRole('button', { name: 'Copy response to clipboard' }).click()
    await expect.poll(() => clipboardText(app)).toBe("Here is the snippet:\n\n```js\nconsole.log('copied')\n```\n\nAll planned.")

    await expect(pane.locator('[data-message-stamp]').first()).toHaveText(/^\d{1,2}:\d{2} [AP]M$/)
    await expect(pane.getByRole('separator').first()).toHaveText(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/)
  })

  test('scrolling up holds the view while output arrives; sending follows again', async ({ launched }) => {
    const { page } = launched
    const pane = page.locator('[data-chat-pane]')
    const transcript = pane.locator('[data-transcript]')
    await startSession(launched)
    await page.setViewportSize({ width: 900, height: 420 })
    await send(page, 'a long answer')
    await expect(pane.getByText('End of the first part.')).toBeVisible()

    await transcript.evaluate((el) => (el.scrollTop = 0))
    await expect(pane.getByText('The second part arrived.')).toBeAttached({ timeout: 10_000 })
    expect(await transcript.evaluate((el) => el.scrollTop)).toBe(0)

    await send(page, 'another long answer')
    await expect(pane.getByText('End of the first part.').nth(1)).toBeVisible()
    await expect
      .poll(() => transcript.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
      .toBeLessThan(50)
  })
})

/** A git workspace with an ignored file, a folder with a space in its name and a source file. */
function seedMentionWorkspace(workspace: string): void {
  execFileSync('git', ['init', '-q'], { cwd: workspace })
  writeFileSync(join(workspace, '.gitignore'), 'secret.log\n')
  writeFileSync(join(workspace, 'secret.log'), 'hidden')
  mkdirSync(join(workspace, 'my folder'))
  writeFileSync(join(workspace, 'my folder', 'notes.md'), '# notes')
  mkdirSync(join(workspace, 'src'))
  writeFileSync(join(workspace, 'src', 'app.ts'), 'export {}')
}

test.describe('mentions and attachments', () => {
  test('the @ menu lists folders but not ignored files, and quotes a path with a space', async ({ launched }) => {
    const { page } = launched
    seedMentionWorkspace(launched.workspace)
    await startSession(launched)
    const menu = page.getByRole('listbox', { name: 'Suggestions' })

    await prompt(page).fill('@')
    await expect(menu.getByRole('option', { name: 'my folder/' })).toBeVisible()
    await expect(menu.getByRole('option', { name: 'src/' })).toBeVisible()
    await expect(menu.getByRole('option', { name: /secret\.log/ })).toHaveCount(0)

    await prompt(page).fill('@secret')
    await expect(menu.getByText('No files found')).toBeVisible()

    await prompt(page).fill('@notes')
    await expect(menu.getByRole('option', { name: /notes\.md/ })).toBeVisible()
    await prompt(page).press('Enter')
    await expect(prompt(page)).toHaveValue('@"my folder/notes.md"  ')
    await expect(menu).toHaveCount(0)
  })

  test('text and PDF files go as document blocks before the prompt; an over-long prompt is refused', async ({ launched }) => {
    const { page, log } = launched
    await startSession(launched)
    await page.locator('[data-chat-pane] input[type="file"]').setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello notes') },
      { name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      { name: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') }
    ])
    await expect(page.getByText(/^Unsupported file type: archive\.zip\. /)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove notes.txt' })).toBeVisible()
    await send(page, 'read these')
    await expect.poll(() => log.entries().filter((e) => e.kind === 'received' && e.line?.type === 'user').length).toBe(1)
    const user = log.entries().find((e) => e.kind === 'received' && e.line?.type === 'user')
    expect((user?.line?.message as { content: unknown }).content).toEqual([
      { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello notes' }, title: 'notes.txt' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4').toString('base64') }, title: 'paper.pdf' },
      { type: 'text', text: 'read these' }
    ])

    await prompt(page).fill('x'.repeat(50_001))
    await prompt(page).press('Enter')
    await expect(page.getByText('Your prompt is 1 character over the limit of 50000 · shorten it to send')).toBeVisible()
    expect(log.userTexts()).toHaveLength(1)
  })
})

const OLD_SESSION = '11111111-1111-4111-8111-111111111111'
const UNNAMED_SESSION = '22222222-2222-4222-8222-222222222222'

function seedPastSessions(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const userLine = (text: string, gitBranch: string) =>
    JSON.stringify({ type: 'user', gitBranch, message: { role: 'user', content: [{ type: 'text', text }] } })
  writeFileSync(
    join(dir, `${OLD_SESSION}.jsonl`),
    [userLine('the login is broken', 'feature/oauth'), JSON.stringify({ type: 'ai-title', aiTitle: 'Old login fix', sessionId: OLD_SESSION })].join('\n') + '\n'
  )
  writeFileSync(join(dir, `${UNNAMED_SESSION}.jsonl`), userLine('tidy the readme', 'main') + '\n')
}

test.describe('session history', () => {
  test('Claude names the session, a rename reaches the CLI, and Past sessions opens the picker at this project with titles, search, back, rename and switching', async ({ launched }) => {
    const { page, log } = launched
    const transcripts = transcriptsOf(launched)
    seedPastSessions(transcripts)
    await startSession(launched)
    const list = page.getByRole('navigation', { name: 'Sessions' })

    await send(page, 'fix the login bug today please')
    await expect(list.getByText('Fix the login bug today', { exact: true })).toBeVisible()
    expect(log.controlRequests('generate_session_title')).toEqual([
      { subtype: 'generate_session_title', description: 'fix the login bug today please', persist: true }
    ])

    await list.getByText('Fix the login bug today', { exact: true }).dblclick()
    await list.getByRole('textbox', { name: 'Session title' }).fill('Auth work')
    await list.getByRole('textbox', { name: 'Session title' }).press('Enter')
    await expect(list.getByText('Auth work', { exact: true })).toBeVisible()
    await expect.poll(() => log.controlRequests('rename_session')).toHaveLength(1)
    expect(log.controlRequests('rename_session')[0]).toMatchObject({ title: 'Auth work', source: 'host', session_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    await send(page, 'and add a test')
    await expect(page.getByText('Hello! This is a scripted reply from the fake Claude.').nth(1)).toBeVisible()
    await expect(list.getByText('Auth work', { exact: true })).toBeVisible()
    expect(log.controlRequests('generate_session_title')).toHaveLength(1)

    const openPast = async () => {
      await page.getByRole('button', { name: 'Session list actions' }).click()
      await page.getByRole('menuitem', { name: /Past sessions/ }).click()
      return page.getByRole('dialog', { name: 'Open a workspace' })
    }
    let past = await openPast()
    const filter = past.getByRole('combobox', { name: 'Open a workspace' })
    await expect(past.getByText('e2e-workspace', { exact: true })).toBeVisible()
    await expect(past.getByRole('option').first()).toHaveAccessibleName('New chat')
    const rows = past.getByRole('option', { name: /now/ })
    await expect(rows).toHaveCount(2)
    await expect(past.getByRole('option', { name: /^Old login fix feature\/oauth now/ })).toBeVisible()
    await expect(past.getByRole('option', { name: /^tidy the readme main now/ })).toBeVisible()

    await filter.fill('OAUTH')
    await expect(rows).toHaveCount(1)
    await filter.fill('login')
    await expect(past.locator('mark')).toHaveText('login')
    await filter.fill('')
    await filter.press('Backspace')
    await expect(past.getByRole('option', { name: /e2e-workspace/ })).toBeVisible()
    await expect(past.getByRole('option', { name: 'New chat' })).toHaveCount(0)
    await past.getByRole('combobox', { name: 'Open a workspace' }).press('Enter')
    await expect(past.getByRole('option', { name: 'New chat' })).toBeVisible()

    await past.getByRole('option', { name: /^tidy the readme/ }).hover()
    await past.getByRole('option', { name: /^tidy the readme/ }).getByRole('button', { name: 'Rename session' }).click()
    await past.getByRole('textbox', { name: 'Session title' }).fill('Readme tidy')
    await past.getByRole('textbox', { name: 'Session title' }).press('Enter')
    await expect(past.getByRole('option', { name: /^Readme tidy main now/ })).toBeVisible()
    await expect
      .poll(() => readFileSync(join(transcripts, `${UNNAMED_SESSION}.jsonl`), 'utf-8').trim().split('\n').at(-1))
      .toBe(JSON.stringify({ type: 'custom-title', sessionId: UNNAMED_SESSION, customTitle: 'Readme tidy' }))

    await past.getByRole('option', { name: /^Old login fix/ }).click()
    await expect(past).toHaveCount(0)
    await expect(list.getByText('Old login fix', { exact: true })).toBeVisible()
    await send(page, 'carry on')
    await expect.poll(() => log.entries().some((e) => e.kind === 'argv' && (e.argv as string[]).includes(OLD_SESSION))).toBe(true)
    expect(log.controlRequests('generate_session_title')).toHaveLength(1)

    await page.keyboard.press('Control+l')
    past = page.getByRole('dialog', { name: 'Open a workspace' })
    await expect(past.getByRole('img', { name: /^Open in this window/ })).toHaveCount(1)
    await expect(past.getByRole('option', { name: /Old login fix/ }).getByRole('img', { name: /^Open in this window/ })).toBeVisible()
    await past.getByRole('option', { name: /Old login fix/ }).click()
    await expect(past).toHaveCount(0)
    await expect(list.getByText('Old login fix', { exact: true })).toHaveCount(1)
    await page.keyboard.press('Control+t')
    await expect(page.getByRole('dialog', { name: 'Open a workspace' }).getByRole('option').first()).toHaveAccessibleName(/^e2e-workspace/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Open a workspace' })).toHaveCount(0)
  })
})

test.describe('accounts from an existing folder', () => {
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
})

function folderUri(path: string): string {
  const [drive, ...rest] = path.split(/[\\/]/)
  return `file:///${drive.toLowerCase().replace(':', '%3A')}/${rest.map(encodeURIComponent).join('/')}`
}

test.describe('accounts VS Code uses', () => {
  test('the Dashboard points at the suggestion, one click adopts the Work folder and moves the workspace, and new chats and workspaces use it', async ({ launched }) => {
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
})

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test.describe('transcript look', () => {
  test.use({ script: 'look' })

  test('an MCP call reads "Server [tool]" with an OUT box, compaction and thinking read as in the extension, and an image path opens the preview', async ({ launched }) => {
    const { page, workspace } = launched
    mkdirSync(join(workspace, 'refs'), { recursive: true })
    writeFileSync(join(workspace, 'refs', 'shot.png'), Buffer.from(TINY_PNG, 'base64'))
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)
    await send(page, 'render the references')
    await expect(pane.getByText('Rendered')).toBeVisible()

    const meshy = pane.locator('[data-timeline-row]', { hasText: 'Meshy [meshy_check_balance]' })
    await expect(meshy).toHaveCount(1)
    const out = meshy.locator('[data-tool-section="out"]')
    await expect(out).toContainText('"balance":1932')
    await expect(out).toHaveAttribute('aria-expanded', 'false')
    await out.click()
    await expect(out).toHaveAttribute('aria-expanded', 'true')
    await expect(meshy.locator('[data-tool-section="in"]')).toHaveCount(0)
    await expect(pane.getByText('Blender [execute_blender_code]')).toBeVisible()
    await expect(pane.getByText('mcp__meshy__meshy_check_balance')).toHaveCount(0)

    await expect(pane.getByText(/^Thought for \ds$/)).toHaveCount(2)

    await pane.locator('[data-compaction]').getByRole('button', { name: 'Compacted chat · auto · 974k tokens freed' }).click()
    await expect(pane.getByText('Summary: checked the Meshy balance.')).toBeVisible()

    const read = pane.locator('[data-timeline-row]', { hasText: /^Read/ })
    await read.getByRole('link', { name: 'shot.png' }).click()
    const preview = page.getByRole('dialog', { name: 'shot.png' })
    await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)

    await pane.getByRole('link', { name: 'the reference' }).click()
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Close preview' }).click()
    await expect(preview).toHaveCount(0)
  })
})

/** A one-second webm, recorded from a canvas inside the app, so the test needs no video tool or download. */
async function recordWebm(page: Page): Promise<Buffer> {
  // A string, since this project compiles the tests against Node's types, not the DOM's.
  const base64 = await page.evaluate<string>(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 48
    const context = canvas.getContext('2d')
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' })
    const chunks = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    const stopped = new Promise((resolve) => (recorder.onstop = resolve))
    recorder.start()
    for (let frame = 0; frame < 20; frame++) {
      context.fillStyle = 'hsl(' + frame * 18 + ', 70%, 50%)'
      context.fillRect(0, 0, 64, 48)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    recorder.stop()
    await stopped
    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })()`)
  return Buffer.from(base64, 'base64')
}

test.describe('media tab', () => {
  test.use({ script: 'media' })

  test('the Media tab replaces the transcript with the chat’s png, webm and missing file, steps through them in the preview, and jumps back to the message', async ({ launched }) => {
    const { page, workspace } = launched
    mkdirSync(join(workspace, 'refs'), { recursive: true })
    mkdirSync(join(workspace, 'clips'), { recursive: true })
    writeFileSync(join(workspace, 'refs', 'shot.png'), Buffer.from(TINY_PNG, 'base64'))
    writeFileSync(join(workspace, 'clips', 'demo.webm'), await recordWebm(page))
    const pane = page.locator('[data-chat-pane]')
    const transcript = pane.locator('[data-transcript]')
    const input = pane.locator('textarea')
    await startSession(launched)
    await expect(pane.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Media', exact: true })).toHaveCount(0)
    await send(page, 'show the media')
    await expect(pane.getByText('That is the reference shot.')).toBeVisible()

    const chatTab = pane.getByRole('tab', { name: 'Chat' })
    const mediaTab = pane.getByRole('tab', { name: 'Media 3' })
    await expect(chatTab).toHaveAttribute('aria-selected', 'true')
    await mediaTab.click()
    await expect(mediaTab).toHaveAttribute('aria-selected', 'true')
    const grid = pane.getByRole('tabpanel', { name: 'Media' })
    await expect(grid).toBeVisible()
    await expect(transcript).toBeHidden()
    await expect(input).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Media' })).toHaveCount(0)

    const tiles = grid.locator('[data-thumbnail]')
    await expect(tiles).toHaveCount(3)
    await expect(tiles.nth(0).getByRole('button', { name: 'shot.png' }).locator('img')).toHaveAttribute('src', /^cc-media:\/\/file\//)
    await expect(tiles.nth(1).locator('video')).toHaveCount(1)
    await expect(tiles.nth(2)).toContainText('gone.gif')
    await expect(tiles.nth(2)).toContainText('File not found')
    await expect.poll(() => tiles.nth(0).locator('img').evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth)).toBe(1)
    await expect.poll(() => tiles.nth(1).locator('video').evaluate((v) => (v as unknown as { readyState: number }).readyState)).toBeGreaterThan(0)
    const shotPath = process.env.MEDIA_TAB_SHOT
    if (shotPath) {
      const png = await evaluateMain(launched.app, async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'), undefined)
      writeFileSync(shotPath, Buffer.from(png, 'base64'))
    }

    await tiles.nth(0).getByRole('button', { name: 'shot.png' }).click()
    const preview = page.getByRole('dialog', { name: 'shot.png' })
    await expect(preview.locator('img')).toHaveAttribute('src', /^cc-media:/)
    await page.getByRole('button', { name: 'Next' }).click()
    const video = page.getByRole('dialog', { name: 'demo.webm' }).locator('video')
    await expect(video).toHaveCount(1)
    await expect.poll(() => video.evaluate((v) => (v as unknown as { readyState: number }).readyState)).toBeGreaterThan(0)
    await page.keyboard.press('ArrowLeft')
    await expect(preview).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)

    await tiles.nth(2).click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Copy path' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Reveal in Explorer' })).toBeDisabled()
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+Shift+M')
    await expect(chatTab).toHaveAttribute('aria-selected', 'true')
    await expect(transcript).toBeVisible()
    await expect(grid).toHaveCount(0)
    for (let i = 1; i <= 4; i++) {
      await send(page, `more ${i}`)
      await expect(pane.getByText('Line eight of a long reply.')).toHaveCount(i)
    }
    const shotMessage = pane.locator('[data-item-id]', { hasText: 'That is the reference shot.' })
    await expect(shotMessage).not.toBeInViewport()
    await page.keyboard.press('Control+Shift+M')
    await expect(grid).toBeVisible()
    await tiles.nth(0).hover()
    await tiles.nth(0).getByRole('button', { name: 'Jump to message' }).click()
    await expect(chatTab).toHaveAttribute('aria-selected', 'true')
    await expect(grid).toHaveCount(0)
    await expect(shotMessage).toBeInViewport()
  })

  test('the Chat tab keeps its scroll position and follows new output across a trip to Media', async ({ launched }) => {
    const { page } = launched
    const pane = page.locator('[data-chat-pane]')
    const transcript = pane.locator('[data-transcript]')
    await startSession(launched)
    await send(page, 'show the media')
    await expect(pane.getByText('That is the reference shot.')).toBeVisible()
    for (let i = 1; i <= 4; i++) {
      await send(page, `more ${i}`)
      await expect(pane.getByText('Line eight of a long reply.')).toHaveCount(i)
    }
    const top = () => transcript.evaluate((el) => (el as unknown as { scrollTop: number }).scrollTop)
    const gap = () => transcript.evaluate((el) => {
      const box = el as unknown as { scrollTop: number; scrollHeight: number; clientHeight: number }
      return box.scrollHeight - box.clientHeight - box.scrollTop
    })
    await transcript.evaluate((el) => ((el as unknown as { scrollTop: number }).scrollTop = 120))
    await expect.poll(top).toBe(120)
    // A remounted transcript would be a new element without this mark.
    await transcript.evaluate((el) => ((el as unknown as { dataset: Record<string, string> }).dataset.kept = 'yes'))

    await page.keyboard.press('Control+Shift+M')
    await expect(transcript).toBeHidden()
    await page.keyboard.press('Control+Shift+M')
    await expect(transcript).toBeVisible()
    expect(await top()).toBe(120)
    await expect(transcript).toHaveAttribute('data-kept', 'yes')

    await transcript.evaluate((el) => {
      const box = el as unknown as { scrollTop: number; scrollHeight: number }
      box.scrollTop = box.scrollHeight
    })
    await expect.poll(gap).toBeLessThan(2)
    await page.keyboard.press('Control+Shift+M')
    await expect(transcript).toBeHidden()
    await send(page, 'more 5')
    await expect(pane.getByText('Line eight of a long reply.')).toHaveCount(5)
    await page.keyboard.press('Control+Shift+M')
    await expect(transcript).toBeVisible()
    await expect.poll(gap).toBeLessThan(2)
  })
})

test.describe('subagents', () => {
  test.use({ script: 'subagent' })

  test('a subagent’s messages show under its Agent call, and Open transcript reads its own file', async ({ launched }) => {
    const { page } = launched
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)
    await send(page, 'explore the repo')
    await expect(pane.getByText('Main agent: the explorer finished.')).toBeVisible()

    const call = pane.locator('[data-agent-call]')
    await expect(call).toHaveAttribute('data-agent-status', 'finished')
    const row = call.getByRole('button', { name: /Agent Find the config/ })
    await expect(row).toContainText('Finished')
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.click()
    const inside = call.locator('[data-subagent-items]')
    await expect(inside.getByText('Subagent says the config lives in settings.ts.')).toBeVisible()
    await expect(inside.locator('[data-timeline-row]', { hasText: /^Read/ }).getByRole('link', { name: 'settings.ts' })).toBeVisible()
    await expect(pane.getByText('Subagent says the config lives in settings.ts.')).toHaveCount(1)
    await expect(pane.getByRole('button', { name: 'Copy response to clipboard' })).toHaveCount(1)

    await call.getByRole('button', { name: 'Open transcript' }).click()
    const dialog = page.getByRole('dialog', { name: 'Find the config' })
    await expect(dialog.getByText('Finished · general-purpose · foreground')).toBeVisible()
    await expect(dialog.getByText('Subagent says the config lives in settings.ts.')).toBeVisible()
    await expect(dialog.getByText('Find where the config is read.')).toBeVisible()
  })

  test('Stop agent sends stop_task with the agent’s task id and the call ends Stopped', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)
    await send(page, 'slow agent please')
    const call = pane.locator('[data-agent-call]')
    await expect(call.locator('[data-subagent-items]').getByText('Subagent is still looking.')).toBeVisible()
    await expect(call).toHaveAttribute('data-agent-status', 'working')
    await call.getByRole('button', { name: 'Stop agent' }).click()
    await expect.poll(() => log.controlRequests('stop_task').map((r) => r.task_id)).toEqual([expect.stringMatching(/^a[0-9a-f]{16}$/)])
    await expect(call).toHaveAttribute('data-agent-status', 'stopped')
    await expect(pane.getByText('Main agent: carried on after the stop.')).toBeVisible()
    await expect(pane.getByText('Subagent never says this.')).toHaveCount(0)
  })
})

test.describe('Remote Control', () => {
  const FAKE_SESSION = /^https:\/\/claude\.ai\/code\/session_01Fake[0-9a-f]+$/

  test('/remote-control turns it on and shows the link; the menu row turns it off', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)
    await expect(pane.getByRole('link', { name: 'Remote Control' })).toHaveCount(0)

    await prompt(page).fill('/remote-control')
    await prompt(page).press('Enter')
    const pill = pane.getByRole('link', { name: 'Remote Control' })
    await expect(pill).toHaveAttribute('href', FAKE_SESSION)
    await expect(pill).toHaveAttribute('title', 'Remote Control is active · Click to open claude.ai/code · Run /remote-control to turn off')
    await expect(pane.getByText('Remote Control is active · Continue here, on your phone, or at')).toBeVisible()
    const link = pane.getByRole('link', { name: 'claude.ai/code' })
    expect(await link.getAttribute('href')).toBe(await pill.getAttribute('href'))

    await prompt(page).pressSequentially('/remote')
    await page.getByRole('listbox', { name: 'Actions' }).getByRole('option', { name: /\/remote-control/ }).click()
    await expect(pane.getByText('Remote Control disabled.')).toBeVisible()
    await expect(pill).toHaveCount(0)
    await expect.poll(() => log.controlRequests('remote_control').map((r) => r.enabled)).toEqual([true, false])
    expect(log.userTexts()).toEqual([])
  })

  test('turned on while the process is still starting, reaches the CLI once it is up', async ({ launched }) => {
    const { app, page, log, workspace } = launched
    await delayClaudeStart(app, 2000)
    await page.keyboard.press('Control+2')
    await page.keyboard.press('Control+t')
    await newChatIn(page, /e2e-workspace/)
    await prompt(page).fill('/rc')
    await prompt(page).press('Enter')
    const pane = page.locator('[data-chat-pane]')
    await expect(pane.getByRole('status', { name: 'Connecting to claude.ai/code…' })).toBeVisible()
    expect(log.initializedIn(workspace)).toBe(false)
    await expect(pane.getByRole('link', { name: 'Remote Control' })).toHaveAttribute('href', FAKE_SESSION)
    expect(log.controlRequests('remote_control').map((r) => r.enabled)).toEqual([true])
  })

  test.describe('with remoteControlAtStartup', () => {
    test.use({ script: 'remoteControl' })

    test('a new chat turns it on by itself once the CLI says so', async ({ launched }) => {
      const { page, log } = launched
      await startSession(launched)
      await expect(page.locator('[data-chat-pane]').getByRole('link', { name: 'Remote Control' })).toHaveAttribute('href', FAKE_SESSION)
      expect(log.controlRequests('remote_control').map((r) => r.enabled)).toEqual([true])
    })
  })
})

const OBSERVED_ID = '0b5e7e1d-0000-4000-8000-00000000c0de'

function observedLine(type: 'user' | 'assistant', n: number, text: string): string {
  const message = type === 'user' ? { role: 'user', content: text } : { id: `msg_${n}`, role: 'assistant', model: 'claude-opus-4-1', content: [{ type: 'text', text }] }
  return JSON.stringify({ type, uuid: `${type}-${n}`, entrypoint: 'claude-vscode', timestamp: new Date().toISOString(), message })
}

/** A VS Code transcript long enough to scroll, with the record types the reader skips between messages. */
function observedTranscript(): string {
  const lines = [JSON.stringify({ type: 'ai-title', aiTitle: 'Observed scroll check', sessionId: OBSERVED_ID })]
  for (let n = 0; n < 30; n++) {
    lines.push(observedLine('user', n, `Question ${n}?`))
    lines.push(JSON.stringify({ type: 'data-flow-records', v: 1, sessionId: OBSERVED_ID, records: [{ n }] }))
    lines.push(observedLine('assistant', n, `Answer ${n}.\n\nA second paragraph so the transcript grows.`))
  }
  lines.push(observedLine('assistant', 30, 'The final reply starts here.\n\nIts middle paragraph.\n\nThe last line of the final reply.'))
  for (let n = 0; n < 20; n++) lines.push(JSON.stringify({ type: 'data-flow-records', v: 1, sessionId: OBSERVED_ID, records: [{ n }] }))
  return lines.join('\n') + '\n'
}

test.describe('a VS Code session in Work', () => {
  test.use({ script: 'render' })

  test('shows its header and its whole last message, stays put on a wheel past the end, and follows an appended reply', async ({ launched }) => {
    const { page } = launched
    const file = join(transcriptsOf(launched), `${OBSERVED_ID}.jsonl`)
    mkdirSync(transcriptsOf(launched), { recursive: true })
    writeFileSync(file, observedTranscript())
    // A hosted chat taller than the pane, kept mounted out of sight behind the observed one.
    await startSession(launched)
    const hosted = page.locator('[data-chat-pane]')
    await send(page, 'long answer please')
    await expect(hosted.getByText('The second part arrived.')).toBeVisible()
    await send(page, 'long answer again')
    await expect(hosted.getByText('The second part arrived.')).toHaveCount(2)

    const row = page.getByTitle(/^Observed scroll check .* in VS Code \(read-only\)$/)
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.click()
    const pane = page.getByRole('region', { name: 'observed session' })
    const last = pane.getByText('The last line of the final reply.')
    await expect(last).toBeVisible()
    await pane.hover()
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 600)

    const header = page.getByText('read-only · reply in VS Code')
    await expect(header).toBeInViewport()
    const badge = page.getByRole('note', { name: /^Account: / })
    await expect(badge).toHaveAttribute('title', /Unknown account: no running VS Code session/)
    mkdirSync(join(launched.configDir, 'sessions'), { recursive: true })
    writeFileSync(join(launched.configDir, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: OBSERVED_ID, status: 'idle', updatedAt: Date.now() }))
    await expect(badge).toHaveAccessibleName('Account: someone@example.com · Claude Ultra', { timeout: 15_000 })
    await expect(badge).toHaveAttribute('title', /From the running VS Code session/)
    const scroller = pane.locator('.overflow-y-auto').first()
    const fits = async (): Promise<boolean> => {
      const [box, line, head] = await Promise.all([scroller.boundingBox(), last.boundingBox(), header.boundingBox()])
      return !!box && !!line && !!head && head.y >= 0 && line.y >= box.y && line.y + line.height <= box.y + box.height
    }
    await expect.poll(fits).toBe(true)
    await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)

    appendFileSync(file, JSON.stringify({ type: 'data-flow-records', v: 1, sessionId: OBSERVED_ID, records: [] }) + '\n')
    appendFileSync(file, observedLine('assistant', 31, 'A reply appended while you watch.') + '\n')
    await expect(pane.getByText('A reply appended while you watch.')).toBeInViewport()
    await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
    await expect(header).toBeInViewport()
  })
})

const TAKEN_ID = '7a4e0000-0000-4000-8000-0000000007a4'

function vscodeLine(type: 'user' | 'assistant', n: number, content: unknown, stopReason?: string): string {
  const message = type === 'user' ? { role: 'user', content } : { id: `msg_t${n}`, role: 'assistant', model: 'claude-opus-4-1', stop_reason: stopReason, content }
  return JSON.stringify({ type, uuid: `t-${type}-${n}`, entrypoint: 'claude-vscode', timestamp: new Date().toISOString(), message })
}

const resumedWith = (log: FakeLog, sessionId: string): boolean =>
  log.entries().some((e) => {
    if (e.kind !== 'argv') return false
    const argv = e.argv as string[]
    return argv[argv.indexOf('--resume') + 1] === sessionId
  })

test.describe('taking over a VS Code chat', () => {
  test('waits for the turn to end, then resumes it here in place of the VS Code view and drops it from In VS Code', async ({ launched }) => {
    const { page, log } = launched
    const dir = transcriptsOf(launched)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${TAKEN_ID}.jsonl`)
    writeFileSync(
      file,
      [
        JSON.stringify({ type: 'ai-title', aiTitle: 'Build check', sessionId: TAKEN_ID }),
        vscodeLine('user', 0, 'Build it?'),
        vscodeLine('assistant', 1, [{ type: 'tool_use', id: 'toolu_build', name: 'Bash', input: { command: 'pnpm build' } }], 'tool_use')
      ].join('\n') + '\n'
    )
    await page.keyboard.press('Control+2')
    const row = page.getByTitle(/^Build check .* in VS Code \(read-only\)$/)
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.click()
    await page.getByRole('button', { name: 'Take over', exact: true }).click()
    await expect(page.getByText('Taking over when done…')).toBeVisible()
    await page.waitForTimeout(2500)
    expect(resumedWith(log, TAKEN_ID)).toBe(false)

    appendFileSync(file, vscodeLine('user', 2, [{ type: 'tool_result', tool_use_id: 'toolu_build', content: 'built' }]) + '\n')
    appendFileSync(file, vscodeLine('assistant', 3, [{ type: 'text', text: 'The build passed.' }], 'end_turn') + '\n')
    await expect.poll(() => resumedWith(log, TAKEN_ID)).toBe(true)
    const pane = page.locator('[data-chat-pane]:visible')
    await expect(pane.getByText('The build passed.')).toBeVisible()
    await expect(pane.getByText(/The VS Code panel for this chat is now out of date/)).toBeVisible()
    await expect(page.getByText('Build check is now in Command Center')).toBeVisible()
    await expect(page.getByRole('region', { name: 'observed session' })).toHaveCount(0)
    await expect(row).toHaveCount(0)
  })
})

test.describe('grouped by account', () => {
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
    await newChatIn(page, /work-repo/)
    await expect.poll(() => log.initializedIn(workRepo)).toBe(true)
    await send(page, 'say hello')
    await expect(page.getByText(BASIC_REPLY)).toBeVisible()

    const list = page.getByRole('navigation', { name: 'Sessions' })
    const homeSection = list.getByRole('region', { name: homeLabel })
    const workSection = list.getByRole('region', { name: workLabel })
    await expect(homeSection.getByRole('region', { name: 'Idle' })).toBeVisible()
    await expect(workSection.getByRole('region', { name: 'Needs you' })).toBeVisible()
    const workHeader = workSection.getByRole('button', { name: workLabel })
    await expect(workHeader).toContainText('1')
    await expect(list.getByRole('region').first()).toHaveAttribute('aria-label', homeLabel)

    await workHeader.click()
    await expect(workSection.getByRole('region', { name: 'Needs you' })).toBeHidden()
    await expect(workHeader).toContainText('1')
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
})

test.describe('repo icons found in the repo', () => {
  test('the app icon is chosen automatically, the picker lists both, and a pick stays after Detect again', async ({ launched }) => {
    const { app, page, root } = launched
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

test.describe('zoom and the session list', () => {
  const zoomPercent = (app: ElectronApplication): Promise<number> =>
    evaluateMain(app, ({ BrowserWindow }) => Math.round(BrowserWindow.getAllWindows()[0].webContents.getZoomFactor() * 100), null)

  test('starts at 110%, steps one level per key from the prompt box and a shell, resets with Ctrl+0 and is kept across a restart', async ({ launched }) => {
    const { app, page } = launched
    await expect.poll(() => zoomPercent(app)).toBe(110)
    await startSession(launched)

    await prompt(page).focus()
    await page.keyboard.press('Control+=')
    await expect.poll(() => zoomPercent(app)).toBe(132)
    await page.keyboard.press('Control+-')
    await page.keyboard.press('Control+-')
    await expect.poll(() => zoomPercent(app)).toBe(92)
    await expect(prompt(page)).toHaveValue('')
    await page.keyboard.press('Control+0')
    await expect.poll(() => zoomPercent(app)).toBe(110)

    await page.keyboard.press('Control+`')
    const terminal = page.locator('.xterm-helper-textarea').first()
    await expect(terminal).toBeAttached()
    await terminal.focus()
    await page.keyboard.press('Control+=')
    await expect.poll(() => zoomPercent(app)).toBe(132)
    await page.keyboard.press('Control+b')
    await expect(page.getByRole('navigation', { name: 'Sessions' })).toBeHidden()
    await page.keyboard.press('Control+b')
    await expect(page.getByRole('navigation', { name: 'Sessions' })).toBeVisible()

    await page.keyboard.press('Control+,')
    await page.getByRole('navigation', { name: 'Settings sections' }).getByText('General', { exact: true }).click()
    await expect(page.getByText('132%')).toBeVisible()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(page.getByText('158%')).toBeVisible()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect(page.getByText('132%')).toBeVisible()

    const again = await launched.relaunch()
    await expect.poll(() => zoomPercent(again.app)).toBe(132)
    const clickViewMenu = (label: string) =>
      evaluateMain(again.app, ({ Menu }, name: string) => {
        const view = Menu.getApplicationMenu()?.items.find((i) => i.label === 'View')
        view?.submenu?.items.find((i) => i.label === name)?.click()
      }, label)
    await clickViewMenu('Zoom Out')
    await expect.poll(() => zoomPercent(again.app)).toBe(110)
    await clickViewMenu('Zoom In')
    await expect.poll(() => zoomPercent(again.app)).toBe(132)
    await clickViewMenu('Actual Size')
    await expect.poll(() => zoomPercent(again.app)).toBe(110)
  })

  test('Ctrl+B hides and shows the session list, Alt+1 and Ctrl+Shift+J still open rows while it is hidden, and it stays hidden across a restart', async ({ launched }) => {
    const { page, log } = launched
    await startSession(launched)
    await send(page, 'say hello')
    await expect(page.getByText(BASIC_REPLY)).toBeVisible()
    const list = page.getByRole('navigation', { name: 'Sessions' })
    const show = page.getByRole('button', { name: 'Show sessions' })
    await expect(list).toBeVisible()

    await page.keyboard.press('Control+b')
    await expect(list).toBeHidden()
    await expect(show).toBeVisible()
    const reply = page.locator('[data-chat-pane]').getByText(BASIC_REPLY)
    const openAnother = async () => {
      await page.keyboard.press('Control+t')
      await newChatIn(page, /e2e-workspace/)
      await expect(reply).toBeHidden()
    }
    await openAnother()
    await page.keyboard.press('Alt+1')
    await expect(reply).toBeVisible()
    await openAnother()
    await page.keyboard.press('Control+Shift+J')
    await expect(reply).toBeVisible()

    await show.click()
    await expect(list).toBeVisible()
    await list.getByRole('button', { name: 'Hide sessions' }).click()
    await expect(list).toBeHidden()

    const again = await launched.relaunch()
    await again.page.keyboard.press('Control+2')
    await expect(again.page.getByRole('button', { name: 'Show sessions' })).toBeVisible()
    await expect(again.page.getByRole('navigation', { name: 'Sessions' })).toBeHidden()
    await again.page.keyboard.press('Control+b')
    await expect(again.page.getByRole('navigation', { name: 'Sessions' })).toBeVisible()
    expect(log.entries().filter((e) => e.kind === 'received' && e.line?.type === 'user').length).toBe(1)
  })
})

test.describe('the account a chat runs on', () => {
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
    await expect(workUsage.getByText(/^Week 69% · (on track|ahead by \d+%) · resets /)).toBeVisible({ timeout: 15_000 })
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
})
