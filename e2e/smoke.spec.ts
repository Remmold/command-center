import type { Page } from '@playwright/test'
import { chooseMode, expect, prompt, send, startSession, test } from './harness'

const BASIC_REPLY = 'Hello! This is a scripted reply from the fake Claude.'
const WRITE_DONE = 'Created hello.txt containing hi.'

test('a new session streams the fake reply', async ({ launched }) => {
  const { page, log } = launched
  await startSession(launched)
  await send(page, 'say hello')
  await expect(page.getByText(BASIC_REPLY)).toBeVisible()
  await expect.poll(() => log.entries().filter((e) => e.kind === 'received' && e.line?.type === 'user').length).toBe(1)
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
  await expect(page.locator('[data-chat-pane]').getByRole('button', { name: 'Plan', exact: true })).toBeVisible()
  await expect.poll(() => log.controlRequests('set_permission_mode').map((r) => r.mode)).toContain('plan')
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

test.describe('tool approval', () => {
  test.use({ script: 'approval' })

  const approval = (page: Page) => page.getByRole('group', { name: 'Approve Write' })

  test.beforeEach(async ({ launched }) => {
    const { page, log } = launched
    await startSession(launched)
    await chooseMode(page, 'Edit automatically', 'Manual')
    await expect.poll(() => log.controlRequests('set_permission_mode').map((r) => r.mode)).toContain('default')
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
