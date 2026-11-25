import { defineConfig } from 'C:/projects/personal/command-center/node_modules/@playwright/test'
export default defineConfig({ testDir: '.', testMatch: '*.shots.ts', timeout: 600_000, expect: { timeout: 15_000 }, workers: 1, retries: 0, reporter: [['list']], outputDir: './results' })
