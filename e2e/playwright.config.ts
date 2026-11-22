import { defineConfig } from '@playwright/test'
import { workerCrashWarning } from './guard'

const warning = process.env.TEST_WORKER_INDEX === undefined ? workerCrashWarning(process.version, process.platform) : undefined
if (warning) console.warn(`\n${warning}\n`)

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../node_modules/.cache/e2e-results'
})
