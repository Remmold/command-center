// Run: pnpm release. Builds the NSIS installer and publishes it with latest.yml to a GitHub Release
// v<version> on Remmold/command-center. The token comes from `gh auth token` and lives only in the
// builder's environment.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()
if (git('status', '--porcelain')) {
  console.error('release: the working tree has changes; commit them first.')
  process.exit(1)
}
if (git('tag', '--list', `v${version}`)) {
  console.error(`release: v${version} is already tagged; run pnpm version:bump and commit first.`)
  process.exit(1)
}

const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf-8' }).trim()
if (!token) {
  console.error('release: gh auth token returned nothing; run gh auth login.')
  process.exit(1)
}

const run = (args, env = process.env) => {
  const res = spawnSync('pnpm', ['exec', ...args], { cwd: root, stdio: 'inherit', shell: true, env })
  if (res.status !== 0) process.exit(res.status ?? 1)
}
run(['electron-vite', 'build'])
run(['electron-builder', '--win', '--publish', 'always'], { ...process.env, GH_TOKEN: token })
console.log(`release: published v${version}`)
