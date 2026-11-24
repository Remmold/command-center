import type { EditorProps } from '@monaco-editor/react'
import { monoFont } from '../../theme/theme'

/** The Monaco setup Work's and Context's editors share. */
export function editorOptions(readOnly = false): EditorProps['options'] {
  return {
    fontSize: 13,
    fontFamily: monoFont(),
    minimap: { enabled: true },
    automaticLayout: true,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    tabSize: 2,
    renderWhitespace: 'selection',
    readOnly
  }
}
