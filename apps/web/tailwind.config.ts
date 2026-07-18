import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#111111',
        panel: '#242424',
        line: '#3a3a3a',
        muted: '#9a9a9a',
      },
      boxShadow: {
        float: '0 18px 50px rgba(0, 0, 0, 0.38)',
      },
    },
  },
  plugins: [],
} satisfies Config
