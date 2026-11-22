import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cliPermissionMode, delayClaudeStart, expect, prompt, send, startSession, test, transcriptsOf } from './harness'

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
  await expect(strip.getByRole('meter', { name: 'someone@example.com Weekly (7 day)' })).toHaveAttribute('aria-valuenow', '69')
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
    await page.getByRole('option', { name: /e2e-workspace/ }).first().click()
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
  return (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r\n/g, '\n')
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
  test('Claude names the session, a rename reaches the CLI, and past sessions show titles, search and rename', async ({ launched }) => {
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
      await page.getByRole('option', { name: /e2e-workspace/ }).first().click()
      return page.getByRole('dialog', { name: 'Past conversations' })
    }
    let past = await openPast()
    const rows = past.getByRole('list', { name: 'Sessions' }).getByRole('button', { name: /now$/ })
    await expect(rows).toHaveCount(2)
    await expect(past.getByRole('button', { name: 'Old login fix now' })).toBeVisible()
    await expect(past.getByRole('button', { name: 'tidy the readme now' })).toBeVisible()

    await past.getByRole('searchbox', { name: 'Search sessions' }).fill('OAUTH')
    await expect(rows).toHaveCount(1)
    await past.getByRole('searchbox', { name: 'Search sessions' }).fill('login')
    await expect(past.locator('mark')).toHaveText('login')
    await past.getByRole('searchbox', { name: 'Search sessions' }).fill('')

    await past.getByRole('button', { name: 'tidy the readme now' }).hover()
    await past.getByRole('listitem').filter({ hasText: 'tidy the readme' }).getByRole('button', { name: 'Rename session' }).click()
    await past.getByRole('textbox', { name: 'Session title' }).fill('Readme tidy')
    await past.getByRole('textbox', { name: 'Session title' }).press('Enter')
    await expect(past.getByRole('button', { name: 'Readme tidy now' })).toBeVisible()
    await expect
      .poll(() => readFileSync(join(transcripts, `${UNNAMED_SESSION}.jsonl`), 'utf-8').trim().split('\n').at(-1))
      .toBe(JSON.stringify({ type: 'custom-title', sessionId: UNNAMED_SESSION, customTitle: 'Readme tidy' }))

    await past.getByRole('button', { name: 'Old login fix now' }).click()
    await expect(past).toHaveCount(0)
    await expect(list.getByText('Old login fix', { exact: true })).toBeVisible()
    await send(page, 'carry on')
    await expect.poll(() => log.entries().some((e) => e.kind === 'argv' && (e.argv as string[]).includes(OLD_SESSION))).toBe(true)
    expect(log.controlRequests('generate_session_title')).toHaveLength(1)

    past = await openPast()
    await expect(past.getByRole('img', { name: /^Open in this window/ })).toHaveCount(1)
    await expect(past.getByRole('listitem').filter({ hasText: 'Old login fix' }).getByRole('img', { name: /^Open in this window/ })).toBeVisible()
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
