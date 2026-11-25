// Run: node tools/record-cli/sanitize.mjs <raw .jsonl> <fixture .jsonl> <workspace dir used for the recording>
// Turns a record.mjs log into a fixture: drops initialize and the init line, swaps personal paths and the session id.
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { resolve } from 'node:path'

const [src, dst, workspaceArg] = process.argv.slice(2)
if (!src || !dst || !workspaceArg) {
  console.error('usage: node tools/record-cli/sanitize.mjs <raw .jsonl> <fixture .jsonl> <workspace dir>')
  process.exit(2)
}

const WORKSPACE = String.raw`C:\work\demo`
const HOME = String.raw`C:\home`
const SESSION = '00000000-0000-4000-8000-000000000000'
const slug = (path) => path.replace(/[^a-zA-Z0-9]/g, '-')

const workspace = resolve(workspaceArg)
const home = homedir()
const user = userInfo().username
const entries = readFileSync(src, 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
const sessionId = entries.find((e) => e.line.session_id)?.line.session_id
const initId = entries.find((e) => e.line.type === 'control_request' && e.line.request?.subtype === 'initialize')?.line.request_id

const keep = entries.filter(({ line }) => {
  if (line.type === 'control_request' && line.request?.subtype === 'initialize') return false
  if (line.type === 'control_response' && line.response?.request_id === initId) return false
  if (line.type === 'system' && line.subtype === 'init') return false
  return true
})

const pairs = [
  [slug(workspace), slug(WORKSPACE)],
  [workspace, WORKSPACE],
  [workspace.replaceAll('\\', '/'), WORKSPACE.replaceAll('\\', '/')],
  [home, HOME],
  [home.replaceAll('\\', '/'), HOME.replaceAll('\\', '/')],
  ...(sessionId ? [[sessionId, SESSION]] : [])
]
const swap = (value) => {
  if (typeof value === 'string') return pairs.reduce((s, [from, to]) => s.replaceAll(from, to), value)
  if (Array.isArray(value)) return value.map(swap)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v)]))
  return value
}

const text = keep.map(({ direction, line }) => JSON.stringify({ direction, line: swap(line) })).join('\n') + '\n'
const leak = new RegExp(`${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|andreas`, 'i').exec(text)
if (leak) {
  console.error(`sanitize: personal data left ("${text.slice(Math.max(0, leak.index - 40), leak.index + 40)}"); add a replacement and rerun`)
  process.exit(1)
}
writeFileSync(dst, text)
console.log(`sanitize: ${keep.length} of ${entries.length} lines kept in ${dst}`)
