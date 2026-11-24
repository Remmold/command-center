import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASIC_REPLY, FAKE_SESSION, TINY_PNG, WRITE_DONE, clipboardText, userLines } from './common'
import { cliPermissionMode, delayClaudeStart, evaluateMain, expect, newChatIn, prompt, send, startSession, test, useScript } from './harness'

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

/** A 6 s clip with a cut at 3 s and a tone, made by ffmpeg itself; null without ffmpeg. */
function ffmpegClip(workspace: string): string | null {
  const clip = join(workspace, '..', 'clip.mp4')
  try {
    execFileSync('ffmpeg', [
      ...['-hide_banner', '-loglevel', 'error', '-y'],
      ...['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3', '-f', 'lavfi', '-i', 'smptebars=size=320x240:rate=25:duration=3'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a'],
      ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]
    ])
    return clip
  } catch {
    return null
  }
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
    await expect(strip.getByText('Personal', { exact: true })).toBeVisible()
    await expect(strip.getByRole('meter', { name: 'Personal Weekly (7 day)', exact: true })).toHaveAttribute('aria-valuenow', '69')
    await expect(strip.getByRole('meter', { name: 'Personal Weekly (7 day) time passed', exact: true })).toHaveAttribute('aria-valuenow', /^\d+$/)
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

  await test.step('a pasted image, text and PDF files and a video go before the prompt and show in its bubble, the image as a thumbnail that opens the preview; an over-long prompt is refused; the reply streams on the profile config dir', async () => {
    const fileInput = page.locator('[data-chat-pane] input[type="file"]')
    const clip = ffmpegClip(workspace)
    if (clip) {
      const dropped = await page.evaluateHandle((base64) => {
        type Transfer = { items: { add: (file: unknown) => void } }
        const transfer = new (globalThis as unknown as { DataTransfer: new () => Transfer }).DataTransfer()
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        transfer.items.add(new File([bytes], 'clip.mp4', { type: 'video/mp4' }))
        return transfer
      }, readFileSync(clip).toString('base64'))
      await prompt(page).dispatchEvent('drop', { dataTransfer: dropped })
      const chip = page.getByRole('button', { name: /^clip\.mp4: / })
      await expect(page.getByRole('group', { name: 'Speech model' })).toBeVisible()
      await expect(page.getByText('0:06 · waiting for the speech model', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /Frames only/ }).click()
      await expect(chip).toHaveAccessibleName(/^clip\.mp4: 0:06 · 5 frames · ≈\d+ tokens$/)
      await chip.click()
      await expect(page.getByRole('region', { name: 'clip.mp4 details' }).getByRole('img', { name: 'Sheet 1: 0:00, 0:01, 0:03, 0:04, 0:05' })).toBeVisible()
    } else {
      test.info().annotations.push({ type: 'skipped', description: 'ffmpeg not on PATH: no video attached' })
    }
    await fileInput.setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello notes') },
      { name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      { name: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') }
    ])
    await expect(page.getByText(/^Unsupported file type: archive\.zip\. /)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove notes.txt' })).toBeVisible()
    await prompt(page).evaluate((textarea, base64) => {
      type Transfer = { items: { add: (file: unknown) => void } }
      const transfer = new (globalThis as unknown as { DataTransfer: new () => Transfer }).DataTransfer()
      transfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'pasted.png', { type: 'image/png' }))
      const Clipboard = (globalThis as unknown as { ClipboardEvent: new (type: string, init: object) => object }).ClipboardEvent
      ;(textarea as unknown as { dispatchEvent: (e: object) => void }).dispatchEvent(new Clipboard('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
    }, TINY_PNG)
    await expect(page.getByRole('button', { name: 'Remove pasted.png' })).toBeVisible()
    await send(page, 'read these')
    await expect.poll(() => userLines(log).length).toBe(1)
    const videoBlocks = clip
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: expect.stringMatching(/^\/9j\//) } },
          {
            type: 'text',
            text: ['Video: clip.mp4 · 0:06 · 5 frames on 1 sheet', 'Sheet 1: 0:00 · 0:01 · 0:03 · 0:04 · 0:05', 'No transcript: transcription is off.'].join('\n')
          }
        ]
      : []
    expect((userLines(log)[0].line?.message as { content: unknown }).content).toEqual([
      { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello notes' }, title: 'notes.txt' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4').toString('base64') }, title: 'paper.pdf' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: TINY_PNG } },
      ...videoBlocks,
      { type: 'text', text: 'read these' }
    ])
    if (clip) await expect.poll(() => readdirSync(join(launched.root, 'user-data', 'video-temp'))).toEqual([])
    const bubble = page.locator('[data-user-prompt]').filter({ hasText: 'read these' })
    await expect(bubble.getByRole('img', { name: 'pasted.png' })).toHaveAttribute('src', /^data:image\/(png|jpeg);base64,/)
    await expect(bubble.getByText('paper.pdf')).toBeVisible()
    await expect(bubble).not.toContainText('attached]_')
    await bubble.getByRole('button', { name: 'Open pasted.png' }).click()
    const preview = page.getByRole('dialog', { name: 'pasted.png' })
    await expect(preview.getByRole('img', { name: 'pasted.png' })).toHaveAttribute('src', `data:image/png;base64,${TINY_PNG}`)
    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)

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
    await expect(page.getByRole('dialog', { name: 'Select a model' }).getByRole('button', { name: /^Effort/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(pill).toHaveText('Sonnet 5.5')
    const effortPill = page.locator('[data-chat-pane]').getByRole('button', { name: /^Effort: / })
    await effortPill.focus()
    await page.keyboard.press('Enter')
    const effortPopover = page.getByRole('dialog', { name: 'Effort' })
    await expect(effortPopover.getByRole('slider', { name: 'Effort level' })).toBeFocused()
    await effortPopover.getByRole('button', { name: /^Effort/ }).click()
    await expect.poll(settings).toContainEqual({ effortLevel: 'high' })
    await expect(page.getByText('Set effort to High')).toBeVisible()
    await expect(effortPill).toHaveAccessibleName('Effort: High')
    await page.keyboard.press('Escape')
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
    await newChatIn(page, /e2e-workspace/)
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

test.describe('slow turns', () => {
  test.use({ script: 'slow' })

  test('a prompt sent mid-turn queues and starts after Esc; Run in background; the working line; Stop interrupts; then chats picked up from settings.json and with a full context', async ({ launched }) => {
    const { page, log, workspace } = launched
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

    const newChat = async (): Promise<void> => {
      const from = log.entries().length
      await page.keyboard.press('Control+2')
      await page.keyboard.press('Control+t')
      await newChatIn(page, /e2e-workspace/)
      await expect.poll(() => log.initializedIn(workspace, from)).toBe(true)
    }

    await test.step("a new chat starts in settings.json's default mode and turns Remote Control on when the CLI says remoteControlAtStartup", async () => {
      const pane = page.locator('[data-chat-pane]:visible')
      writeFileSync(join(launched.configDir, 'settings.json'), JSON.stringify({ permissions: { defaultMode: 'plan' } }))
      await useScript(launched.app, 'remoteControl')
      const enabledBefore = log.controlRequests('remote_control').length
      await newChat()
      await expect(pane.getByRole('button', { name: 'Plan', exact: true })).toBeVisible()
      expect(cliPermissionMode(log, workspace)).toBe('plan')
      await expect(pane.getByRole('link', { name: 'Remote Control' })).toHaveAttribute('href', FAKE_SESSION)
      expect(log.controlRequests('remote_control').slice(enabledBefore).map((r) => r.enabled)).toEqual([true])
    })

    await test.step('a full context: the context pie shows from the start, refreshes after a turn and sends /compact when clicked', async () => {
      await useScript(launched.app, 'context')
      const usageBefore = log.controlRequests('get_context_usage').length
      const textsBefore = log.userTexts().length
      await newChat()
      const pie = page.getByRole('button', { name: '72% context used — click to compact' })
      await expect(pie).toBeVisible()
      await send(page, 'hello')
      await expect(page.getByText('This chat is getting long.')).toBeVisible()
      await expect.poll(() => log.controlRequests('get_context_usage').length - usageBefore).toBe(2)
      await expect(pie).toHaveAttribute('title', '28% of context remaining until auto-compact.\nClick to compact now.')
      await pie.click()
      await expect.poll(() => log.userTexts().slice(textsBefore)).toEqual(['hello', '/compact'])
    })
  })
})

test.describe('tool approval', () => {
  test.use({ script: 'approval' })

  test('1 approves, 3 with feedback denies, 2 allows for the session; the approval inbox and question cards answer through the same replies', async ({ launched }) => {
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

    const FORMATS = 'Which formats should the export offer?'
    const LAYOUT = 'Which layout should the report use?'
    const answered = (answers: Record<string, string>) =>
      expect.objectContaining({ behavior: 'allow', updatedInput: { questions: expect.any(Array), answers }, updatedPermissions: [] })

    await test.step('Ctrl+Shift+A answers two waiting chats oldest first with their own prompts, then closes with All clear', async () => {
      await page.keyboard.press('Control+t')
      await newChatIn(page, /e2e-workspace/)
      await send(page, 'create hello.txt')
      await expect(approval).toBeVisible()
      await page.keyboard.press('Control+t')
      await newChatIn(page, /e2e-workspace/)
      await send(page, 'ask about the export')
      await expect(page.locator('[data-chat-pane]').getByRole('group', { name: 'Questions from Claude' })).toBeVisible()
      await expect(page.getByRole('button', { name: '2 approvals' })).toBeVisible()

      await page.keyboard.press('Control+Shift+A')
      const inbox = page.getByRole('dialog', { name: /^Approvals/ })
      const rows = inbox.getByRole('list', { name: 'Waiting approvals' }).getByRole('listitem')
      await expect(rows).toHaveCount(2)
      await expect(rows.nth(0)).toContainText('Write')
      await expect(rows.nth(1)).toContainText('Question')
      await expect(inbox.getByRole('group', { name: 'Approve Write' })).toBeVisible()
      await expect(inbox.getByText("I'll create hello.txt for you.")).toBeVisible()
      await page.keyboard.press('1')
      await expect.poll(() => log.approvalReplies().length).toBe(4)
      expect(log.approvalReplies()[3]).toMatchObject({ behavior: 'allow', updatedInput: expect.objectContaining({ content: 'hi' }) })

      await expect(rows).toHaveCount(1)
      const card = inbox.getByRole('group', { name: 'Questions from Claude' })
      await card.getByRole('checkbox', { name: 'CSV' }).click()
      await card.getByRole('checkbox', { name: 'JSON' }).click()
      await card.getByRole('checkbox', { name: 'Other' }).click()
      await card.getByRole('textbox', { name: 'Type your answer…' }).fill('XML')
      await expect(card.getByRole('button', { name: /Submit answers/ })).toBeDisabled()
      await card.getByRole('checkbox', { name: 'CSV' }).focus()
      await page.keyboard.press('ArrowRight')
      await expect(card.getByRole('radio', { name: 'Table' })).toBeFocused()
      await expect(card.getByRole('region', { name: 'Preview: Table' })).toContainText('Invoice')
      await page.keyboard.press('ArrowDown')
      await expect(card.getByRole('region', { name: 'Preview: Cards' })).toContainText('Total 40.00')
      await page.keyboard.press('Enter')
      await page.keyboard.press('1')
      await expect(inbox).toHaveCount(0)
      await expect(page.getByRole('status', { name: 'Notifications' }).getByText('All clear')).toBeVisible()
      await expect.poll(() => log.approvalReplies().length).toBe(5)
      expect(log.approvalReplies()[4]).toEqual(answered({ [FORMATS]: 'CSV, JSON, XML', [LAYOUT]: 'Cards' }))
      await expect(page.getByRole('button', { name: /approvals?$/ })).toHaveCount(0)
    })

    await test.step('O opens the chat at its question, whose own card answers by clicks and then reads Answered', async () => {
      await expect(prompt(page)).toBeEditable()
      await send(page, 'ask again')
      const card = page.locator('[data-chat-pane]').getByRole('group', { name: 'Questions from Claude' })
      await expect(card).toBeVisible()
      await page.keyboard.press('Control+Shift+A')
      await expect(page.getByRole('dialog', { name: /^Approvals/ })).toBeVisible()
      await page.keyboard.press('o')
      await expect(page.getByRole('dialog', { name: /^Approvals/ })).toHaveCount(0)
      await card.getByRole('checkbox', { name: 'PDF' }).click()
      await card.getByRole('tab', { name: 'Layout' }).click()
      await card.getByRole('radio', { name: 'Table' }).click()
      await card.getByRole('button', { name: /Submit answers/ }).click()
      await expect.poll(() => log.approvalReplies().length).toBe(6)
      expect(log.approvalReplies()[5]).toEqual(answered({ [FORMATS]: 'PDF', [LAYOUT]: 'Table' }))
      await expect(page.locator('[data-chat-pane]').getByText('Answered · 2 questions').last()).toBeVisible()
    })
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

test.describe('chat rendering', () => {
  test.use({ script: 'render' })

  test('thinking, todos, copy buttons and timestamps render as in the extension; scrolling up holds the view while output arrives; MCP calls, compaction and an image path read as in the extension; the Media tab', async ({ launched }) => {
    const { app, page, log, workspace } = launched
    const pane = page.locator('[data-chat-pane]')
    mkdirSync(join(workspace, 'refs'), { recursive: true })
    mkdirSync(join(workspace, 'clips'), { recursive: true })
    writeFileSync(join(workspace, 'refs', 'shot.png'), Buffer.from(TINY_PNG, 'base64'))
    writeFileSync(join(workspace, 'clips', 'demo.webm'), await recordWebm(page))
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

    /** Starts a chat on `script` in its own pane; later steps read only the visible pane. */
    const newChatOn = async (script: 'look' | 'media'): Promise<void> => {
      await useScript(app, script)
      const from = log.entries().length
      await page.keyboard.press('Control+t')
      await newChatIn(page, /e2e-workspace/)
      await expect.poll(() => log.initializedIn(workspace, from)).toBe(true)
    }
    const shown = page.locator('[data-chat-pane]:visible')

    await test.step('an MCP call reads "Server [tool]" with an OUT box, compaction and thinking read as in the extension, and an image path opens the preview', async () => {
      await newChatOn('look')
      await send(page, 'render the references')
      await expect(shown.getByText('Rendered')).toBeVisible()

      const meshy = shown.locator('[data-timeline-row]', { hasText: 'Meshy [meshy_check_balance]' })
      await expect(meshy).toHaveCount(1)
      const out = meshy.locator('[data-tool-section="out"]')
      await expect(out).toContainText('"balance":1932')
      await expect(out).toHaveAttribute('aria-expanded', 'false')
      await out.click()
      await expect(out).toHaveAttribute('aria-expanded', 'true')
      await expect(meshy.locator('[data-tool-section="in"]')).toHaveCount(0)
      await expect(shown.getByText('Blender [execute_blender_code]')).toBeVisible()
      await expect(shown.getByText('mcp__meshy__meshy_check_balance')).toHaveCount(0)

      await expect(shown.getByText(/^Thought for \ds$/)).toHaveCount(2)

      await shown.locator('[data-compaction]').getByRole('button', { name: 'Compacted chat · auto · 974k tokens freed' }).click()
      await expect(shown.getByText('Summary: checked the Meshy balance.')).toBeVisible()

      const read = shown.locator('[data-timeline-row]', { hasText: /^Read/ })
      await read.getByRole('link', { name: 'shot.png' }).click()
      const preview = page.getByRole('dialog', { name: 'shot.png' })
      await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
      await page.keyboard.press('Escape')
      await expect(preview).toHaveCount(0)

      await shown.getByRole('link', { name: 'the reference' }).click()
      await expect(preview).toBeVisible()
      await preview.getByRole('button', { name: 'Close preview' }).click()
      await expect(preview).toHaveCount(0)
    })

    const transcript = shown.locator('[data-transcript]')
    const chatTab = shown.getByRole('tab', { name: 'Chat' })
    const mediaTab = shown.getByRole('tab', { name: 'Media 3' })
    const grid = shown.getByRole('tabpanel', { name: 'Media' })
    const tiles = grid.locator('[data-thumbnail]')

    await test.step('the Media tab replaces the transcript with the chat’s png, webm and missing file', async () => {
      await newChatOn('media')
      await expect(shown.getByRole('tablist')).toHaveCount(0)
      await send(page, 'show the media')
      await expect(shown.getByText('That is the reference shot.')).toBeVisible()

      await expect(chatTab).toHaveAttribute('aria-selected', 'true')
      await mediaTab.click()
      await expect(mediaTab).toHaveAttribute('aria-selected', 'true')
      await expect(grid).toBeVisible()
      await expect(transcript).toBeHidden()
      await expect(shown.locator('textarea')).toBeVisible()

      await expect(tiles).toHaveCount(3)
      await expect(tiles.nth(0).getByRole('button', { name: 'shot.png' }).locator('img')).toHaveAttribute('src', /^cc-media:\/\/file\//)
      await expect(tiles.nth(1).locator('video')).toHaveCount(1)
      await expect(tiles.nth(2)).toContainText('gone.gif')
      await expect(tiles.nth(2)).toContainText('File not found')
      await expect.poll(() => tiles.nth(0).locator('img').evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth)).toBe(1)
      await expect.poll(() => tiles.nth(1).locator('video').evaluate((v) => (v as unknown as { readyState: number }).readyState)).toBeGreaterThan(0)
      const shotPath = process.env.MEDIA_TAB_SHOT
      if (shotPath) {
        const png = await evaluateMain(app, async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'), undefined)
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
        await expect(shown.getByText('Line eight of a long reply.')).toHaveCount(i)
      }
      const shotMessage = shown.locator('[data-item-id]', { hasText: 'That is the reference shot.' })
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
      await expect(shown.getByText('Line eight of a long reply.')).toHaveCount(5)
      await page.keyboard.press('Control+Shift+M')
      await expect(transcript).toBeVisible()
      await expect.poll(gap).toBeLessThan(2)
    })
  })
})

test.describe('subagents', () => {
  test.use({ script: 'subagent' })

  test('Agent calls stay compact rows; the Agents tab lists and follows them live; the still-working bar; Stop agent sends stop_task', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    const calls = pane.locator('[data-agent-call]')
    const strip = pane.locator('[data-tab-strip]')
    const agentsTab = strip.getByRole('tab', { name: /^Agents \d+$/ })
    const chatTab = strip.getByRole('tab', { name: 'Chat', exact: true })
    const list = pane.getByRole('list', { name: 'Agents' })
    const view = pane.locator('[data-agent-view]')
    const transcript = pane.locator('[data-transcript]')
    await startSession(launched)

    await test.step('two background agents: compact rows, a bar after the turn, the Agents tab, a live view, and the transcript does not grow', async () => {
      await send(page, 'background agents please')
      await expect(pane.getByText('Main agent: both agents work in the background.')).toBeVisible()
      await expect(pane.locator('[data-working-line]')).toHaveCount(0)
      const bar = pane.locator('[data-agents-still-working]')
      await expect(bar).toContainText(/\d agents? still working/)
      await expect(page.getByRole('navigation', { name: 'Sessions' }).getByRole('img', { name: 'Running' })).toHaveCount(1)
      await expect(calls).toHaveCount(2)
      const rowsBefore = await transcript.locator('[data-timeline-row]').count()
      const logsRow = calls.nth(1)
      await expect(logsRow.getByRole('button', { name: /^Agent Watch the logs/ })).toContainText('Working')
      await expect(logsRow.locator('[data-agent-now]')).toHaveText('now: Watching the logs.')
      await expect(transcript.getByText('Watching the logs.')).toHaveCount(0)

      await expect(agentsTab).toHaveAccessibleName('Agents 2')
      await agentsTab.click()
      const logs = list.getByRole('button', { name: /Watch the logs/ })
      await expect(logs).toContainText('now: Bash pnpm test --run')
      // Once the routes agent is done the order holds: the working one on top.
      await expect(calls.nth(0)).toHaveAttribute('data-agent-status', 'finished')
      await expect(list.getByRole('button').first()).toContainText('Watch the logs')
      await list.getByRole('button', { name: /Scan the routes/ }).focus()
      await page.keyboard.press('ArrowUp')
      await expect(logs).toBeFocused()
      await logs.click()
      await expect(view.getByText('Watching the logs.')).toBeVisible()
      await expect(view.getByText('Logs are quiet.')).toHaveCount(0)
      await expect(view.getByText('Logs are quiet.')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(view).toHaveCount(0)
      await expect(list).toBeVisible()

      await chatTab.click()
      await expect(bar).toHaveCount(0, { timeout: 15_000 })
      await expect(pane.locator('[data-agents-done]')).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Sessions' }).getByRole('img', { name: 'Running' })).toHaveCount(0)
      await expect(calls.nth(0).locator('[data-agent-now]')).toHaveText('No dead routes.')
      expect(await transcript.locator('[data-timeline-row]').count()).toBe(rowsBefore)
    })

    await test.step('a finished foreground agent: its row opens its live view with its own messages, the task folds out, Back returns', async () => {
      await send(page, 'explore the repo')
      await expect(pane.getByText('Main agent: the explorer finished.')).toBeVisible()
      const call = calls.nth(2)
      await expect(call).toHaveAttribute('data-agent-status', 'finished')
      await expect(transcript.getByText('Subagent says the config lives in settings.ts.')).toHaveCount(0)
      await call.getByRole('button', { name: 'task' }).click()
      await expect(call.getByText('Find where the config is read.')).toBeVisible()
      await call.getByRole('button', { name: /^Agent Find the config/ }).click()
      await expect(view.getByText('Subagent says the config lives in settings.ts.')).toBeVisible()
      await expect(view.locator('[data-timeline-row]', { hasText: /^Read/ }).getByRole('link', { name: 'settings.ts' })).toBeVisible()
      await view.getByRole('button', { name: 'Back' }).click()
      await expect(list.getByRole('listitem')).toHaveCount(3)
      await chatTab.click()
    })

    await test.step('Stop agent in the live view sends stop_task with the agent’s task id and the call ends Stopped', async () => {
      await send(page, 'slow agent please')
      await expect(calls).toHaveCount(4)
      const call = calls.nth(3)
      await expect(call).toHaveAttribute('data-agent-status', 'working')
      await call.getByRole('button', { name: /^Agent Wait around/ }).click()
      await expect(view.getByText('Subagent is still looking.')).toBeVisible()
      await view.getByRole('button', { name: 'Stop agent' }).click()
      await expect.poll(() => log.controlRequests('stop_task').map((r) => r.task_id)).toEqual([expect.stringMatching(/^a[0-9a-f]{16}$/)])
      await expect(view.getByRole('button', { name: 'Stop agent' })).toHaveCount(0)
      await chatTab.click()
      await expect(call).toHaveAttribute('data-agent-status', 'stopped')
      await expect(pane.getByText('Main agent: carried on after the stop.')).toBeVisible()
      await expect(pane.getByText('Subagent never says this.')).toHaveCount(0)
    })
  })
})
