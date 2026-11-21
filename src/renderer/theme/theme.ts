import type { ITheme } from '@xterm/xterm'

type ThemeVar = 'editor' | 'sidebar' | 'widget' | 'fg' | 'accent' | 'list-hover' | 'list-selected' | 'input'

function rootValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** A theme colour from theme.css as #rrggbb, for libraries that take hex strings. */
export function themeHex(name: ThemeVar): string {
  const channels = rootValue(`--cc-${name}`).split(/\s+/).map(Number)
  return '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join('')
}

export function monoFont(): string {
  return rootValue('--cc-font-mono')
}

export function xtermTheme(): ITheme {
  return {
    background: themeHex('editor'),
    foreground: themeHex('fg'),
    cursor: themeHex('fg'),
    selectionBackground: themeHex('list-selected')
  }
}

export const MONACO_THEME = 'command-center-dark'

interface MonacoThemeHost {
  editor: {
    defineTheme(
      name: string,
      data: { base: 'vs-dark'; inherit: boolean; rules: []; colors: Record<string, string> }
    ): void
  }
}

export function defineMonacoTheme(monaco: MonacoThemeHost): void {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': themeHex('editor'),
      'editor.foreground': themeHex('fg'),
      'editorGutter.background': themeHex('editor'),
      'editor.lineHighlightBackground': themeHex('list-hover'),
      'editorWidget.background': themeHex('widget'),
      'input.background': themeHex('input'),
      focusBorder: themeHex('accent')
    }
  })
}
