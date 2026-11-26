import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASIC_REPLY, FAST_OBSERVED, transcriptLine } from './common'
import { expect, send, sessionList, startSession, test, transcriptsOf, useScript, type FakeLog } from './harness'

const OLD_SESSION = '11111111-1111-4111-8111-111111111111'
const UNNAMED_SESSION = '22222222-2222-4222-8222-222222222222'

function seedPastSessions(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const userLine = (text: string, gitBranch: string) =>
    transcriptLine('user', { role: 'user', content: [{ type: 'text', text }] }, { gitBranch })
  writeFileSync(
    join(dir, `${OLD_SESSION}.jsonl`),
    [userLine('the login is broken', 'feature/oauth'), JSON.stringify({ type: 'ai-title', aiTitle: 'Old login fix', sessionId: OLD_SESSION })].join('\n') + '\n'
  )
  writeFileSync(join(dir, `${UNNAMED_SESSION}.jsonl`), userLine('tidy the readme', 'main') + '\n')
}

const OBSERVED_ID = '0b5e7e1d-0000-4000-8000-00000000c0de'

function observedLine(type: 'user' | 'assistant', n: number, text: string): string {
  const message = type === 'user' ? { role: 'user', content: text } : { id: `msg_${n}`, role: 'assistant', model: 'claude-opus-4-1', content: [{ type: 'text', text }] }
  return transcriptLine(type, message, { uuid: `${type}-${n}`, entrypoint: 'claude-vscode' })
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

const TAKEN_ID = '7a4e0000-0000-4000-8000-0000000007a4'

function vscodeLine(type: 'user' | 'assistant', n: number, content: unknown, stopReason?: string): string {
  const message = type === 'user' ? { role: 'user', content } : { id: `msg_t${n}`, role: 'assistant', model: 'claude-opus-4-1', stop_reason: stopReason, content }
  return transcriptLine(type, message, { uuid: `t-${type}-${n}`, entrypoint: 'claude-vscode' })
}

const resumedWith = (log: FakeLog, sessionId: string): boolean =>
  log.entries().some((e) => {
    if (e.kind !== 'argv') return false
    const argv = e.argv as string[]
    return argv[argv.indexOf('--resume') + 1] === sessionId
  })

test.describe('session history and VS Code sessions in Work', () => {
  test.use({ script: 'render', env: FAST_OBSERVED })

  test('Claude names the session, a rename reaches the CLI, and Past sessions opens the picker; a VS Code session shows its header and its whole last message, stays put on a wheel past the end, and follows an appended reply; taking over another waits for its turn to end, then resumes it here', async ({ launched }) => {
    await test.step('Claude names the session, a rename reaches the CLI, and Past sessions opens the picker at this project with titles, search, back, rename and switching', async () => {
      await useScript(launched.app, 'basic')
      const { page, log } = launched
      const transcripts = transcriptsOf(launched)
      seedPastSessions(transcripts)
      await startSession(launched)
      const list = sessionList(page)

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
      await expect(page.getByText(BASIC_REPLY).nth(1)).toBeVisible()
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
      await expect(page.locator('[data-chat-pane]:visible').getByText('the login is broken')).toBeVisible()
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

    await test.step('shows its header and its whole last message, stays put on a wheel past the end, and follows an appended reply', async () => {
      const { page } = launched
      const file = join(transcriptsOf(launched), `${OBSERVED_ID}.jsonl`)
      mkdirSync(transcriptsOf(launched), { recursive: true })
      writeFileSync(file, observedTranscript())
      // A hosted chat taller than the pane, kept mounted out of sight behind the observed one.
      await useScript(launched.app, 'render')
      await startSession(launched)
      const hosted = page.locator('[data-chat-pane]')
      await send(page, 'tall answer please')
      await expect(hosted.getByText('The second part arrived.')).toBeVisible()
      await send(page, 'tall answer again')
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
      await expect(badge).toHaveAccessibleName('Account: Personal · Ultra', { timeout: 15_000 })
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

    await test.step('taking over a VS Code chat waits for the turn to end, then resumes it here in place of the VS Code view and drops it from In VS Code', async () => {
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
})
