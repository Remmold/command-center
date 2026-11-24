import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const MONACO_VS = resolve(__dirname, 'node_modules/monaco-editor/min/vs')
const MONACO_URL = '/monaco/vs/'

/** Serves Monaco's own build at ./monaco/vs (dev server and built app), so the editor needs no internet. */
function localMonaco(): Plugin {
  return {
    name: 'local-monaco',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (!path?.startsWith(MONACO_URL)) return next()
        const file = join(MONACO_VS, decodeURIComponent(path.slice(MONACO_URL.length)))
        if (!file.startsWith(MONACO_VS) || !existsSync(file) || !statSync(file).isFile()) return next()
        if (file.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript')
        else if (file.endsWith('.css')) res.setHeader('Content-Type', 'text/css')
        createReadStream(file).pipe(res)
      })
    },
    writeBundle(options) {
      cpSync(MONACO_VS, join(options.dir ?? 'out/renderer', 'monaco/vs'), { recursive: true })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/index.ts' }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: { entry: 'src/preload/index.ts' }
    }
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    plugins: [react(), localMonaco()]
  }
})
