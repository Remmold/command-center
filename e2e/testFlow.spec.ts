import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RendererApi } from '../src/shared/types'
import { clipboardText } from './common'
import { expect, newChatIn, send, startSession, test } from './harness'

/** A page shaped as the render script writes it: inline style and script, click-to-copy rows, plus web addresses it must never reach. */
const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>run.md</title>
<link rel="stylesheet" href="https://example.com/style.css">
<style>.cmd { cursor:pointer; }</style>
<body>
<h1>TEST RUN e2e</h1>
<img src="https://example.com/pixel.png" alt="">
<a href="https://example.com/away">away</a>
<div class="cmd" onclick="cp(this)" data-cmd="pnpm dev"><code>pnpm dev</code><span class="hint">click to copy</span></div>
<div style="height:3000px"></div>
<script>
fetch('https://example.com/beacon').catch(function(){});
function cp(el) {
  var cmd = el.getAttribute('data-cmd');
  function ok() { el.querySelector('.hint').textContent = 'copied!'; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmd).then(ok, function(){ fallback(cmd); ok(); });
  } else { fallback(cmd); ok(); }
}
function fallback(cmd) {
  var ta = document.createElement('textarea');
  ta.value = cmd; document.body.appendChild(ta);
  ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
}
</script>
</body>`

test.describe('test flows', () => {
  test.use({ script: 'testFlow' })

  test('the Test tab shows the repo-named markdown, then the HTML twin of the file the reply wrote, whose click-to-copy works offline and which reloads on rewrite; the pop-out follows the focused session', async ({ launched }) => {
    const { page, app, workspace, root, log } = launched
    const folder = join(workspace, 'flows')
    mkdirSync(folder)
    writeFileSync(join(folder, 'e2e-workspace.md'), '# Repo flow\n\n- [ ] look at it')
    const otherRepo = join(root, 'other-repo')
    mkdirSync(otherRepo)
    writeFileSync(join(folder, 'other-repo.md'), '# Other repo flow')
    await page.evaluate(async (path) => {
      const { api } = globalThis as unknown as { api: RendererApi }
      await api.workspaces.addPath(path)
    }, otherRepo)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('navigation', { name: 'Settings sections' }).getByText('General', { exact: true }).click()
    const field = page.getByRole('textbox', { name: 'Test-flows folder' })
    await expect(field).toHaveValue('C:\\projects\\test-flows')
    await field.fill(folder)
    await field.press('Enter')
    const pane = page.locator('[data-chat-pane]')
    const panel = pane.getByRole('tabpanel', { name: 'Test' })
    await startSession(launched)

    await test.step('with nothing written, the file named after the repo shows as markdown', async () => {
      await pane.locator('[data-tab-strip]').getByRole('tab', { name: 'Test', exact: true }).click()
      await expect(panel.getByRole('heading', { name: 'Repo flow' })).toBeVisible()
      await expect(panel.getByText('e2e-workspace.md', { exact: true })).toBeVisible()
    })

    await test.step('the reply writes run.md and renders it; the tab shows run.html', async () => {
      writeFileSync(join(folder, 'run.md'), '# Run')
      writeFileSync(join(folder, 'run.html'), PAGE)
      await send(page, 'write the test flow')
      await expect(pane.getByText('The test flow is ready.')).toBeAttached()
      const frame = panel.frameLocator('iframe[title="run.html"]')
      await expect(frame.getByRole('heading', { name: 'TEST RUN e2e' })).toBeVisible()
      await expect(panel.getByText('run.html', { exact: true })).toBeVisible()

      await frame.getByText('pnpm dev').click()
      await expect(frame.getByText('copied!')).toBeVisible()
      await expect.poll(() => clipboardText(app)).toBe('pnpm dev')

      await frame.getByRole('link', { name: 'away' }).click()
      await expect(frame.getByRole('heading', { name: 'TEST RUN e2e' })).toBeVisible()
    })

    const frame = panel.frameLocator('iframe[title="run.html"]')
    const strip = pane.locator('[data-tab-strip]')
    const scrolled = () => frame.locator('html').evaluate((el) => el.scrollTop)

    await test.step('a rewrite of the file reloads the tab at the same scroll place', async () => {
      await frame.locator('html').evaluate((el) => (el.scrollTop = 800))
      writeFileSync(join(folder, 'run.html'), PAGE.replace('TEST RUN e2e', 'TEST RUN rewritten'))
      await expect(frame.getByRole('heading', { name: 'TEST RUN rewritten' })).toBeAttached()
      await expect.poll(scrolled).toBe(800)
    })

    await test.step('a rewrite while the Chat tab is open puts a dot on the Test tab until it opens', async () => {
      await strip.getByRole('tab', { name: 'Chat', exact: true }).click()
      writeFileSync(join(folder, 'run.html'), PAGE.replace('TEST RUN e2e', 'TEST RUN again'))
      const dot = strip.getByRole('img', { name: 'changed' })
      await expect(dot).toBeVisible()
      await strip.getByRole('tab', { name: /^Test/ }).click()
      await expect(dot).toHaveCount(0)
      await expect(frame.getByRole('heading', { name: 'TEST RUN again' })).toBeAttached()
      await expect.poll(scrolled).toBe(800)
    })

    const popPanel = await test.step('the pop-out opens showing the same file, and a second press opens no second window', async () => {
      const popOutButton = panel.getByRole('button', { name: 'Pop out' })
      const opened = app.waitForEvent('window')
      await popOutButton.click()
      const popOut = await opened
      await popOut.waitForLoadState('domcontentloaded')
      const popPanel = popOut.getByRole('tabpanel', { name: 'Test' })
      await expect(popPanel.frameLocator('iframe[title="run.html"]').getByRole('heading', { name: 'TEST RUN again' })).toBeAttached()
      await expect(popPanel.locator('[data-header-row]')).toContainText('run.html')
      await popOutButton.click()
      await expect.poll(() => app.windows().length).toBe(2)
      return popPanel
    })

    await test.step('a chat in another workspace switches the pop-out to that repo-named file', async () => {
      await page.keyboard.press('Control+t')
      await newChatIn(page, /other-repo/)
      await expect.poll(() => log.initializedIn(otherRepo)).toBe(true)
      await expect(popPanel.getByRole('heading', { name: 'Other repo flow' })).toBeVisible()
      await expect(popPanel.locator('[data-header-row]')).toContainText('other-repo.md')
    })
  })
})
