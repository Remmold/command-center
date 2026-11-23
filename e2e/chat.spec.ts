import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASIC_REPLY, FAKE_SESSION, TINY_PNG, WRITE_DONE, clipboardText, userLines } from './common'
import { cliPermissionMode, delayClaudeStart, evaluateMain, expect, prompt, send, startSession, test } from './harness'

const modeButton = (page: Page, label: string) => page.locator('[data-chat-pane]').getByRole('button', { name: label, exact: true })

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

test('a basic chat: views, usage strip, Manual start, @ menu, attachments, prompt history, slash menu, model and effort, Shift+Tab, Remote Control, a draft across a reload, and picks made while a process starts', async ({ launched }) => {
  const { page, log, workspace } = launched
  const pane = page.locator('[data-chat-pane]')
  seedMentionWorkspace(workspace)

  await test.step('Ctrl+1/2/3 switch Dashboard, Work and Board', async () => {
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

  await test.step('the usage strip shows the fake account and its weekly bar', async () => {
    const strip = page.getByRole('list', { name: 'usage per account profile' })
    await expect(strip.getByText('someone@example.com')).toBeVisible()
    await expect(strip.getByRole('meter', { name: 'someone@example.com Weekly (7 day)', exact: true })).toHaveAttribute('aria-valuenow', '69')
    await expect(strip.getByRole('meter', { name: 'someone@example.com Weekly (7 day) time passed', exact: true })).toHaveAttribute('aria-valuenow', /^\d+$/)
  })

  await test.step('a new session starts Manual when settings.json sets no default mode', async () => {
    await startSession(launched)
    await expect(modeButton(page, 'Manual')).toBeVisible()
    expect(cliPermissionMode(log, workspace)).toBe('default')
  })

  await test.step('the @ menu lists folders but not ignored files, and quotes a path with a space', async () => {
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
    await prompt(page).fill('')
  })

  await test.step('text and PDF files go as document blocks before the prompt; an over-long prompt is refused; the reply streams on the profile config dir', async () => {
    await page.locator('[data-chat-pane] input[type="file"]').setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello notes') },
      { name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      { name: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') }
    ])
    await expect(page.getByText(/^Unsupported file type: archive\.zip\. /)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove notes.txt' })).toBeVisible()
    await send(page, 'read these')
    await expect.poll(() => userLines(log).length).toBe(1)
    expect((userLines(log)[0].line?.message as { content: unknown }).content).toEqual([
      { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello notes' }, title: 'notes.txt' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4').toString('base64') }, title: 'paper.pdf' },
      { type: 'text', text: 'read these' }
    ])

    await prompt(page).fill('x'.repeat(50_001))
    await prompt(page).press('Enter')
    await expect(page.getByText('Your prompt is 1 character over the limit of 50000 · shorten it to send')).toBeVisible()
    expect(log.userTexts()).toHaveLength(1)
    await expect(page.getByText(BASIC_REPLY)).toHaveCount(1)
    const launch = log.entries().find((e) => e.kind === 'argv' && e.cwd === workspace)
    expect(launch?.configDir).toBe(launched.configDir)
  })

  await test.step('↑/↓ recall earlier prompts and Ctrl+J adds a line', async () => {
    await send(page, 'first prompt')
    await expect(page.getByText(BASIC_REPLY)).toHaveCount(2)
    await send(page, 'second prompt')
    await expect(page.getByText(BASIC_REPLY)).toHaveCount(3)

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
    await prompt(page).fill('')
  })

  await test.step('the slash menu sends on Enter, inserts with a hint on Tab, and opens the app’s own UI', async () => {
    const menu = page.getByRole('listbox', { name: 'Actions' })
    const textsBefore = log.userTexts().length
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
    expect(log.userTexts().slice(textsBefore)).toEqual(['/compact'])
    await page.keyboard.press('Escape')
  })

  await test.step('a model and effort change send apply_flag_settings', async () => {
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

  await test.step('Shift+Tab sends set_permission_mode', async () => {
    await prompt(page).press('Shift+Tab')
    await expect(modeButton(page, 'Edit automatically')).toBeVisible()
    await expect.poll(() => log.controlRequests('set_permission_mode').map((r) => r.mode)).toContain('acceptEdits')
  })

  await test.step('/remote-control turns it on and shows the link; the menu row turns it off', async () => {
    const textsBefore = log.userTexts()
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
    expect(log.userTexts()).toEqual(textsBefore)
  })

  await test.step('an unsent draft survives the window reloading', async () => {
    await prompt(page).fill('half a thought')
    await page.reload()
    await page.keyboard.press('Control+2')
    await expect(prompt(page)).toHaveValue('half a thought')
  })

  await test.step('a mode and Remote Control picked while the process is still starting reach the CLI once it is up', async () => {
    const pane = page.locator('[data-chat-pane]:visible')
    const from = log.entries().length
    const enabledBefore = log.controlRequests('remote_control').length
    await delayClaudeStart(launched.app, 2500)
    await page.keyboard.press('Control+2')
    await page.keyboard.press('Control+t')
    await page.getByRole('option', { name: /e2e-workspace/ }).first().click()
    await pane.getByRole('button', { name: /^(Manual|Edit automatically)$/ }).click()
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click()
    await prompt(page).fill('/rc')
    await prompt(page).press('Enter')
    await expect(pane.getByRole('status', { name: 'Connecting to claude.ai/code…' })).toBeVisible()
    expect(log.initializedIn(workspace, from)).toBe(false)

    await expect.poll(() => log.initializedIn(workspace, from)).toBe(true)
    await expect.poll(() => cliPermissionMode(log, workspace)).toBe('plan')
    await expect(pane.getByRole('button', { name: 'Plan', exact: true })).toBeVisible()
    await expect(pane.getByRole('link', { name: 'Remote Control' })).toHaveAttribute('href', FAKE_SESSION)
    expect(log.controlRequests('remote_control').slice(enabledBefore).map((r) => r.enabled)).toEqual([true])
  })
})

test.describe('settings picked up at start', () => {
  test.use({ script: 'remoteControl', userSettings: { permissions: { defaultMode: 'plan' } } })

  test("a new chat starts in settings.json's default mode and turns Remote Control on when the CLI says remoteControlAtStartup", async ({ launched }) => {
    const { page, log, workspace } = launched
    await startSession(launched)
    await expect(modeButton(page, 'Plan')).toBeVisible()
    expect(cliPermissionMode(log, workspace)).toBe('plan')
    await expect(page.locator('[data-chat-pane]').getByRole('link', { name: 'Remote Control' })).toHaveAttribute('href', FAKE_SESSION)
    expect(log.controlRequests('remote_control').map((r) => r.enabled)).toEqual([true])
  })
})

test.describe('slow turns', () => {
  test.use({ script: 'slow' })

  test('a prompt sent mid-turn queues and starts after Esc; Run in background; the working line; Stop interrupts', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    const longJob = pane.getByText('Starting a long job.')
    const interrupted = page.getByText('Interrupted', { exact: true })
    await startSession(launched)

    await test.step('a prompt sent mid-turn shows queued and starts after Esc from the transcript stops the turn', async () => {
      const queued = pane.getByRole('article', { name: 'You, queued' })
      await send(page, 'run the long job')
      await expect(page.getByText('Starting a long job.')).toBeVisible()
      await expect(pane.getByRole('button', { name: 'Stop' })).toBeVisible()

      await prompt(page).fill('and then this')
      await expect(pane.getByRole('button', { name: 'Stop' })).toHaveCount(0)
      await prompt(page).press('Enter')
      await expect(queued).toHaveText('and then this')
      await expect(pane.getByRole('button', { name: 'Stop' })).toBeVisible()
      await expect.poll(() => userLines(log).length).toBe(2)
      expect(userLines(log)[1].line).toMatchObject({ uuid: expect.any(String) })
      expect(log.controlRequests('interrupt')).toHaveLength(0)

      await pane.locator('[tabindex="-1"]').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('Escape')
      await expect.poll(() => log.controlRequests('interrupt').length).toBe(1)
      await expect(queued).toHaveCount(0)
      await expect(pane.getByText('and then this')).toBeVisible()
      await expect(page.getByText('Starting a long job.')).toHaveCount(2)
    })

    await test.step('Stop sends interrupt and shows Interrupted', async () => {
      await page.getByRole('button', { name: 'stop' }).click()
      await expect.poll(() => log.controlRequests('interrupt').length).toBe(2)
      await expect(interrupted).toHaveCount(2)
      await expect(prompt(page)).toBeEditable()
      await expect(page.getByText('The long job finished.')).toHaveCount(0)
    })

    await test.step('a running Bash call blinks, offers Run in background, and the click sends background_tasks for it', async () => {
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

    await test.step('the working line shows while a turn runs and goes when it ends and after Stop', async () => {
      const line = pane.locator('[data-working-line]')
      await send(page, 'quick one')
      await expect(line).toBeVisible()
      await expect(line).toContainText(/[A-Z][a-z]+\.\.\./)
      await expect(pane.getByText('Quick reply.')).toBeVisible()
      await expect(line).toHaveCount(0)

      await send(page, 'run the long job')
      await expect(longJob).toHaveCount(3)
      await expect(line).toBeVisible()
      await pane.getByRole('button', { name: 'Stop' }).click()
      await expect(line).toHaveCount(0)
      await expect.poll(() => log.controlRequests('interrupt').length).toBe(3)
      await expect(interrupted).toHaveCount(3)
      await expect(prompt(page)).toBeEditable()
      await expect(page.getByText('The long job finished.')).toHaveCount(0)
    })
  })
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

  test('1 approves, 3 with feedback denies, 2 allows for the session and skips the next prompt', async ({ launched }) => {
    const { page, log } = launched
    const approval = page.getByRole('group', { name: 'Approve Write' })
    await startSession(launched)
    await expect(modeButton(page, 'Manual')).toBeVisible()
    expect(cliPermissionMode(log, launched.workspace)).toBe('default')

    await test.step('1 approves and the tool runs', async () => {
      await send(page, 'create hello.txt')
      await expect(approval).toBeVisible()
      await page.keyboard.press('1')
      await expect(page.getByText(WRITE_DONE)).toBeVisible()
      await expect(approval).toBeHidden()
      await expect.poll(() => log.approvalReplies()).toEqual([expect.objectContaining({ behavior: 'allow' })])
    })

    await test.step('3 with feedback denies and logs the feedback', async () => {
      await expect(prompt(page)).toBeEditable()
      await send(page, 'create hello.txt')
      await expect(approval).toBeVisible()
      await approval.getByRole('textbox', { name: 'Tell Claude what to do instead' }).fill('name it greeting.txt')
      await approval.getByRole('button', { name: /Yes/ }).first().focus()
      await page.keyboard.press('3')
      await expect(page.getByText("Understood, I won't create the file.")).toBeVisible()
      await expect.poll(() => log.approvalReplies().slice(1)).toEqual([
        expect.objectContaining({ behavior: 'deny', interrupt: false, message: expect.stringContaining('"name it greeting.txt"') })
      ])
    })

    await test.step('"allow for this session" skips the second prompt', async () => {
      await expect(prompt(page)).toBeEditable()
      await send(page, 'create hello.txt')
      await expect(approval).toBeVisible()
      await page.keyboard.press('2')
      await expect(page.getByText(WRITE_DONE)).toHaveCount(2)
      await expect(prompt(page)).toBeEditable()

      await send(page, 'create it again')
      await expect(page.getByText(WRITE_DONE)).toHaveCount(3)
      await expect(approval).toHaveCount(0)
      await expect.poll(() => log.toolPrompts()).toBe(3)
      expect(log.approvalReplies().slice(2)).toEqual([
        expect.objectContaining({ behavior: 'allow', updatedPermissions: [expect.objectContaining({ type: 'setMode', mode: 'acceptEdits' })] })
      ])
    })
  })
})

test.describe('chat rendering', () => {
  test.use({ script: 'render' })

  test('thinking, the todo checklist, copy buttons and timestamps render as in the extension; scrolling up holds the view while output arrives', async ({ launched }) => {
    const { app, page } = launched
    const pane = page.locator('[data-chat-pane]')
    await startSession(launched)

    await test.step('thinking, the todo checklist, copy buttons and timestamps', async () => {
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

    await test.step('scrolling up holds the view while output arrives; sending follows again', async () => {
      const transcript = pane.locator('[data-transcript]')
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
})

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

  test('the Media tab shows the chat’s png, webm and missing file, steps through them, jumps back to the message, and the Chat tab keeps its scroll', async ({ launched }) => {
    const { page, workspace } = launched
    mkdirSync(join(workspace, 'refs'), { recursive: true })
    mkdirSync(join(workspace, 'clips'), { recursive: true })
    writeFileSync(join(workspace, 'refs', 'shot.png'), Buffer.from(TINY_PNG, 'base64'))
    writeFileSync(join(workspace, 'clips', 'demo.webm'), await recordWebm(page))
    const pane = page.locator('[data-chat-pane]')
    const transcript = pane.locator('[data-transcript]')
    const input = pane.locator('textarea')
    const chatTab = pane.getByRole('tab', { name: 'Chat' })
    const mediaTab = pane.getByRole('tab', { name: 'Media 3' })
    const grid = pane.getByRole('tabpanel', { name: 'Media' })
    const tiles = grid.locator('[data-thumbnail]')
    await startSession(launched)

    await test.step('the Media tab replaces the transcript with the chat’s png, webm and missing file', async () => {
      await expect(pane.getByRole('tablist')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Media', exact: true })).toHaveCount(0)
      await send(page, 'show the media')
      await expect(pane.getByText('That is the reference shot.')).toBeVisible()

      await expect(chatTab).toHaveAttribute('aria-selected', 'true')
      await mediaTab.click()
      await expect(mediaTab).toHaveAttribute('aria-selected', 'true')
      await expect(grid).toBeVisible()
      await expect(transcript).toBeHidden()
      await expect(input).toBeVisible()
      await expect(page.getByRole('complementary', { name: 'Media' })).toHaveCount(0)

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
    })

    await test.step('the preview steps through them; a missing file cannot be revealed', async () => {
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
    })

    await test.step('Jump to message goes back to the Chat tab at that message', async () => {
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

    await test.step('the Chat tab keeps its scroll position and follows new output across a trip to Media', async () => {
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
})

test.describe('subagents', () => {
  test.use({ script: 'subagent' })

  test('a subagent’s messages show under its Agent call, Open transcript reads its own file, and Stop agent sends stop_task', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    const calls = pane.locator('[data-agent-call]')
    await startSession(launched)

    await test.step('a subagent’s messages show under its Agent call, and Open transcript reads its own file', async () => {
      await send(page, 'explore the repo')
      await expect(pane.getByText('Main agent: the explorer finished.')).toBeVisible()

      const call = calls.first()
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
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    })

    await test.step('Stop agent sends stop_task with the agent’s task id and the call ends Stopped', async () => {
      await send(page, 'slow agent please')
      await expect(calls).toHaveCount(2)
      const call = calls.nth(1)
      await expect(call.locator('[data-subagent-items]').getByText('Subagent is still looking.')).toBeVisible()
      await expect(call).toHaveAttribute('data-agent-status', 'working')
      await call.getByRole('button', { name: 'Stop agent' }).click()
      await expect.poll(() => log.controlRequests('stop_task').map((r) => r.task_id)).toEqual([expect.stringMatching(/^a[0-9a-f]{16}$/)])
      await expect(call).toHaveAttribute('data-agent-status', 'stopped')
      await expect(pane.getByText('Main agent: carried on after the stop.')).toBeVisible()
      await expect(pane.getByText('Subagent never says this.')).toHaveCount(0)
    })
  })
})
