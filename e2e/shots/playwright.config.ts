import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.shots.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../node_modules/.cache/shots-results'
})
