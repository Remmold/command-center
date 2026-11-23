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
        error: theme('error'),
        warning: theme('warning'),
        success: theme('success'),
        link: theme('link'),
        code: {
          DEFAULT: theme('code'),
          fg: theme('code-fg')
        },
        diff: {
          inserted: 'rgb(var(--cc-diff-inserted))',
          removed: 'rgb(var(--cc-diff-removed))'
        },
        progress: theme('meter-ok'),
        meter: {
          ok: theme('meter-ok'),
          warn: theme('meter-warn'),
          limit: theme('meter-limit'),
          track: theme('meter-track')
        },
        chart: {
          1: theme('chart-1'),
          2: theme('chart-2'),
          3: theme('chart-3'),
          4: theme('chart-4'),
          5: theme('chart-5'),
          6: theme('chart-6'),
          7: theme('chart-7'),
          8: theme('chart-8')
        },
        account: {
          blue: theme('account-blue'),
          orange: theme('account-orange'),
          purple: theme('account-purple'),
          teal: theme('account-teal'),
          green: theme('account-green'),
          red: theme('account-red')
        },
        clay: theme('claude-clay'),
        spinner: theme('spinner'),
        scrim: theme('scrim'),
        status: {
          running: theme('status-running'),
          approval: theme('status-approval'),
          turn: theme('status-turn'),
          idle: theme('status-idle'),
          live: theme('status-live'),
          quiet: theme('status-quiet')
        }
      },
      // The extension's timeline `blink` and spinner row `fadeIn`.
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } }
      },
      animation: {
        blink: 'blink 1s linear infinite',
        'fade-in': 'fade-in 0.3s ease-in-out'
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
