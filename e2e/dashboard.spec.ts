import { BASIC_REPLY } from './common'
import { expect, newChatIn, prompt, send, startSession, test } from './harness'

test('a waiting session opens in the Dashboard chat drawer, takes a reply there, survives a Board detour, and Open in Work lands on it', async ({ launched }) => {
  const { page, log, workspace } = launched
  const dashboard = page.getByTestId('view-dashboard')
  const work = page.getByTestId('view-work')
  const drawer = page.getByRole('complementary', { name: 'Chat' })
  const replies = page.locator('[data-chat-pane]').getByText(BASIC_REPLY)

  await test.step('one session waits on its turn while Work shows another', async () => {
    await startSession(launched)
    await send(page, 'say hello')
    await expect(replies).toBeVisible()
    const from = log.entries().length
    await page.keyboard.press('Control+t')
    await newChatIn(page, /e2e-workspace/)
    await expect.poll(() => log.initializedIn(workspace, from)).toBe(true)
    await expect(replies).toBeHidden()
  })

  await test.step('its Needs you row opens its chat in the drawer, highlighted, and a reply sent there reaches Claude', async () => {
    await page.keyboard.press('Control+1')
    const row = dashboard.getByRole('region', { name: 'Needs you' }).getByRole('button').first()
    await row.click()
    await expect(drawer).toBeVisible()
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(replies).toBeVisible()
    await expect(prompt(page)).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Processes', exact: true })).toHaveCount(0)
    await prompt(page).click()
    await send(page, 'and one more')
    await expect.poll(() => log.userTexts()).toContain('and one more')
    await expect(replies).toHaveCount(2)
    await expect(replies.nth(1)).toBeVisible()
    await expect(dashboard).toBeVisible()
  })

  await test.step("Work kept its own chat, and the drawer is still on the session after a Board detour", async () => {
    await page.keyboard.press('Control+2')
    await expect(replies.first()).toBeHidden()
    await page.keyboard.press('Control+3')
    await page.keyboard.press('Control+1')
    await expect(drawer).toBeVisible()
    await expect(replies.nth(1)).toBeVisible()
  })

  await test.step('Open in Work closes the drawer and shows the session in Work', async () => {
    await drawer.getByRole('button', { name: 'Open in Work' }).click()
    await expect(work).toBeVisible()
    await expect(dashboard).toBeHidden()
    await expect(replies.nth(1)).toBeVisible()
    await page.keyboard.press('Control+1')
    await expect(drawer).toBeHidden()
  })
})
