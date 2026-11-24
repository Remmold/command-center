import { loader } from '@monaco-editor/react'

// The app works offline: Monaco loads from the copy the build serves at ./monaco/vs, never from a CDN.
loader.config({ paths: { vs: new URL('./monaco/vs', document.baseURI).href } })
