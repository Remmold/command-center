/** Colours resolve to the CSS variables in src/renderer/theme/theme.css. */
const theme = (name) => `rgb(var(--cc-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        editor: theme('editor'),
        sidebar: theme('sidebar'),
        titlebar: theme('titlebar'),
        widget: theme('widget'),
        subtle: theme('border'),
        strong: theme('border-strong'),
        fg: theme('fg'),
        muted: theme('muted'),
        faint: theme('faint'),
        accent: {
          DEFAULT: theme('accent'),
          hover: theme('accent-hover'),
          fg: theme('accent-fg')
        },
        focus: theme('focus'),
        'list-hover': theme('list-hover'),
        'list-selected': theme('list-selected'),
        input: theme('input'),
        diff: {
          inserted: 'rgb(var(--cc-diff-inserted))',
          removed: 'rgb(var(--cc-diff-removed))'
        },
        progress: theme('meter-ok'),
        meter: {
          ok: theme('meter-ok'),
          warn: theme('meter-warn'),
          limit: theme('meter-limit')
        },
        status: {
          running: theme('status-running'),
          approval: theme('status-approval'),
          turn: theme('status-turn'),
          idle: theme('status-idle'),
          live: theme('status-live'),
          quiet: theme('status-quiet')
        }
      },
      fontSize: {
        sm: ['13px', '20px']
      },
      fontFamily: {
        sans: 'var(--cc-font-ui)',
        mono: 'var(--cc-font-mono)'
      }
    }
  },
  plugins: []
}
