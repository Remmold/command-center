// Run: pnpm release. Builds the NSIS installer locally, then publishes it with its blockmap and
// latest.yml as GitHub Release v<version> on Remmold/command-center through the gh CLI.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const tag = `v${version}`

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()
const fail = (message) => {
  console.error(`release: ${message}`)
  process.exit(1)
}

if (git('status', '--porcelain')) fail('the working tree has changes; commit them first.')
git('fetch', '--tags', '--quiet', 'origin')
if (git('tag', '--list', tag)) fail(`${tag} is already tagged; run pnpm version:bump and commit first.`)
if (git('rev-parse', 'HEAD') !== git('rev-parse', '@{u}')) fail('HEAD is not pushed; push it first.')

const dist = spawnSync('pnpm', ['dist'], { cwd: root, stdio: 'inherit', shell: true })
if (dist.status !== 0) process.exit(dist.status ?? 1)

// electron-builder names the local file with spaces, but latest.yml points at the hyphenated name
// GitHub would give it, so the assets are uploaded under that name.
const productName = 'Command Center' // productName in electron-builder.yml
const localExe = join(root, 'release', `${productName} Setup ${version}.exe`)
const latest = join(root, 'release', 'latest.yml')
if (!existsSync(localExe) || !existsSync(`${localExe}.blockmap`)) fail(`no installer for ${version} in release/.`)
if (!readFileSync(latest, 'utf-8').includes(`version: ${version}`)) fail(`release/latest.yml is not for ${version}.`)

const assetName = `${productName.replace(/ /g, '-')}-Setup-${version}.exe`
const staging = mkdtempSync(join(tmpdir(), 'cc-release-'))
try {
  copyFileSync(localExe, join(staging, assetName))
  copyFileSync(`${localExe}.blockmap`, join(staging, `${assetName}.blockmap`))
  copyFileSync(latest, join(staging, 'latest.yml'))
  git('tag', tag)
  git('push', 'origin', tag)
  execFileSync(
    'gh',
    [
      'release', 'create', tag, '--verify-tag', '--title', version, '--notes', `Command Center ${version}`,
      join(staging, assetName), join(staging, `${assetName}.blockmap`), join(staging, 'latest.yml')
    ],
    { cwd: root, stdio: 'inherit' }
  )
} finally {
  rmSync(staging, { recursive: true, force: true })
}
console.log(`release: published ${tag}`)
