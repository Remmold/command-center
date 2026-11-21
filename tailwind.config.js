/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        progress: '#10b981',
        meter: {
          ok: '#10b981',
          warn: '#f59e0b',
          limit: '#f87171'
        },
        status: {
          running: '#38bdf8',
          approval: '#f59e0b',
          turn: '#10b981',
          idle: '#52525b',
          live: '#10b981',
          quiet: '#52525b'
        }
      }
    }
  },
  plugins: []
}
