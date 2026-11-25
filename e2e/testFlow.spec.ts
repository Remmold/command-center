import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clipboardText } from './common'
import { expect, send, startSession, test } from './harness'

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

  test('the Test tab shows the repo-named markdown, then the HTML twin of the file the reply wrote, whose click-to-copy works offline', async ({ launched }) => {
    const { page, app, workspace } = launched
    const folder = join(workspace, 'flows')
    mkdirSync(folder)
    writeFileSync(join(folder, 'e2e-workspace.md'), '# Repo flow\n\n- [ ] look at it')
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
  })
})
