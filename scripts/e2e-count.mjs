// Run: pnpm e2e:count. Prints the UI scenarios per spec file and the total against the budget, with the same counter the guard uses.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_SCENARIOS, countScenarios } from '../e2e/budget.ts'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e')
let total = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.spec.ts')).sort()) {
  const n = countScenarios(readFileSync(join(dir, file), 'utf-8'))
  total += n
  console.log(`${file}: ${n}`)
}
console.log(`total: ${total} of ${MAX_SCENARIOS}`)
