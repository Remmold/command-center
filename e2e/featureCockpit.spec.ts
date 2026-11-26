import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RendererApi } from '../src/shared/types'
import { expect, sessionList, test } from './harness'

function repoAt(path: string): string {
  mkdirSync(path, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: path })
  git('init', '-b', 'main')
  writeFileSync(join(path, 'a.txt'), 'a')
  git('add', '.')
  git('commit', '-m', 'first')
  return path
}

test('New feature on a workspace of each of two accounts makes two Features rows, each feature session started on its own account folder', async ({ launched }) => {
  const { page, root, configDir, log } = launched
  mkdirSync(join(configDir, 'skills', 'flow'), { recursive: true })
  writeFileSync(join(configDir, 'skills', 'flow', 'SKILL.md'), '# flow')
  const personalRepo = repoAt(join(root, 'personal-repo'))
  const workRepo = repoAt(join(root, 'work-repo'))

  const setup = await page.evaluate(
    async ([personal, work]) => {
      const { api } = globalThis as unknown as { api: RendererApi }
      const profile = await api.profiles.create('Work')
      const a = await api.workspaces.addPath(personal)
      const b = await api.workspaces.addPath(work)
      if (!a.ok || !b.ok) throw new Error('workspace not added')
      await api.workspaces.setProfile(b.workspace.id, profile.id)
      return { personalId: a.workspace.id, workId: b.workspace.id, workConfig: profile.configDir }
    },
    [personalRepo, workRepo]
  )
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.keyboard.press('Control+2')

  const startFeature = async (workspaceId: string, description: string, name: string) => {
    await page.getByRole('button', { name: 'New feature' }).click()
    const dialog = page.getByRole('dialog', { name: 'New feature' })
    await dialog.getByRole('combobox', { name: 'Workspace' }).selectOption(workspaceId)
    await dialog.getByRole('textbox', { name: 'Feature description' }).fill(description)
    await expect(dialog.getByRole('textbox', { name: 'Feature name' })).toHaveValue(name)
    await dialog.getByRole('button', { name: 'Start feature' }).click()
    await expect(dialog).toBeHidden()
  }
  await startFeature(setup.personalId, 'Add a login page', 'add-a-login-page')
  await startFeature(setup.workId, 'Export reports', 'export-reports')

  const features = sessionList(page).getByRole('region', { name: 'Features' })
  await expect(features.getByRole('button', { name: /add-a-login-page/ })).toBeVisible()
  await expect(features.getByRole('button', { name: /export-reports/ })).toBeVisible()

  const configOf = (folder: string) => log.entries().find((e) => e.kind === 'argv' && String(e.cwd).replaceAll('\\', '/').endsWith(`-worktrees/${folder}`))?.configDir
  await expect.poll(() => configOf('add-a-login-page')).toBe(configDir)
  await expect.poll(() => configOf('export-reports')).toBe(setup.workConfig)
  await expect.poll(() => log.userTexts().some((t) => t.startsWith('/flow Add a login page') && t.includes('Feature name: add-a-login-page'))).toBe(true)
})
