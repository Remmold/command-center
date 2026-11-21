import { defineConfig } from 'vitest/config'

// Kept separate from electron.vite.config.ts so tests never boot Electron or its plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts']
  }
})
