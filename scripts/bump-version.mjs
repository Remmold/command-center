// Run: pnpm version:bump (0.1.N → 0.1.N+1 in package.json)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const text = readFileSync(file, 'utf-8')
const pkg = JSON.parse(text)
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version)
if (!match) throw new Error(`package.json version "${pkg.version}" is not major.minor.patch`)
const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
writeFileSync(file, text.replace(`"version": "${pkg.version}"`, `"version": "${next}"`))
console.log(`${pkg.version} -> ${next}`)
