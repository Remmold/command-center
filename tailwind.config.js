/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        status: {
          running: '#38bdf8',
          approval: '#f59e0b',
          turn: '#10b981',
          idle: '#52525b'
        }
      }
    }
  },
  plugins: []
}
