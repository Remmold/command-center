import { BASIC_REPLY } from './common'
import { expect, newChatIn, prompt, send, startSession, test } from './harness'

test('a waiting session opens in the Dashboard chat drawer, takes a reply there, Ctrl+Shift+J swaps it, it survives a Board detour, and Open in Work lands on it; a session shows the ticket it read', async ({ launched }) => {
  const { page, log, workspace } = launched
  const dashboard = page.getByTestId('view-dashboard')
  const work = page.getByTestId('view-work')
  const drawer = page.getByRole('complementary', { name: 'Chat' })
  const chats = page.locator('[data-chat-pane]')
  const replies = chats.getByText(BASIC_REPLY)
  const asked = (text: string) => chats.getByText(text, { exact: true })

  await test.step('two sessions wait on their turn, Work showing the second', async () => {
    await startSession(launched)
    await send(page, 'first question')
    await expect(replies).toBeVisible()
    const from = log.entries().length
    await page.keyboard.press('Control+t')
    await newChatIn(page, /e2e-workspace/)
    await expect.poll(() => log.initializedIn(workspace, from)).toBe(true)
    await expect(asked('first question')).toBeHidden()
    await send(page, 'second question')
    await expect(replies).toHaveCount(2)
    await expect(asked('second question')).toBeVisible()
  })

  await test.step('the longest waiting Needs you row opens its chat in the drawer, highlighted, and a reply sent there reaches Claude', async () => {
    await page.keyboard.press('Control+1')
    const row = dashboard.getByRole('region', { name: 'Needs you' }).getByRole('button').first()
    await row.click()
    await expect(drawer).toBeVisible()
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(asked('first question')).toBeVisible()
    await expect(prompt(page)).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Processes', exact: true })).toHaveCount(0)
    await prompt(page).click()
    await send(page, 'and one more')
    await expect.poll(() => log.userTexts()).toContain('and one more')
    await expect(replies).toHaveCount(3)
    await expect(asked('and one more')).toBeVisible()
    await expect(dashboard).toBeVisible()
  })

  await test.step('Work kept its own chat, and the drawer is still on the session on the way back', async () => {
    await page.keyboard.press('Control+2')
    await expect(asked('and one more')).toBeHidden()
    await expect(asked('second question')).toBeVisible()
    await page.keyboard.press('Control+1')
    await expect(drawer).toBeVisible()
    await expect(asked('and one more')).toBeVisible()
  })

  await test.step('Ctrl+Shift+J swaps the drawer to the other waiting session and stays on the Dashboard', async () => {
    await page.keyboard.press('Control+Shift+J')
    await expect(asked('second question')).toBeVisible()
    await expect(asked('and one more')).toBeHidden()
    await expect(dashboard).toBeVisible()
    await expect(work).toBeHidden()
  })

  await test.step('a Board detour keeps the drawer on that session', async () => {
    await page.keyboard.press('Control+3')
    await expect(asked('second question')).toBeHidden()
    await page.keyboard.press('Control+1')
    await expect(drawer).toBeVisible()
    await expect(asked('second question')).toBeVisible()
  })

  await test.step('Open in Work closes the drawer and shows the session in Work', async () => {
    await drawer.getByRole('button', { name: 'Open in Work' }).click()
    await expect(work).toBeVisible()
    await expect(dashboard).toBeHidden()
    await expect(asked('second question')).toBeVisible()
    await page.keyboard.press('Control+1')
    await expect(drawer).toBeHidden()
  })

  await test.step('a session that read a ticket shows it under its header, and Open on Board opens it there', async () => {
    await page.keyboard.press('Control+2')
    await send(page, 'work on the ticket')
    const strip = work.getByRole('region', { name: 'Current ticket' })
    await expect(strip).toContainText('e2e-feature #01 · First ticket')
    await expect(strip).toContainText('in-progress')
    await expect(strip).toContainText('A strip that names the ticket the session works on.')
    await strip.getByRole('button', { name: 'Open on Board' }).click()
    await expect(page.getByTestId('view-board')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Ticket' })).toContainText('First ticket')
  })
})
