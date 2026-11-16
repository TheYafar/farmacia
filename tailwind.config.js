/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), surface2: c('surface2'), line: c('line'),
        fg: c('fg'), muted: c('muted'),
        accent: { DEFAULT: c('accent'), ink: c('accent-ink'), soft: c('accent-soft') },
        ok: { DEFAULT: c('ok'), soft: c('ok-soft') },
        warn: { DEFAULT: c('warn'), soft: c('warn-soft') },
        bad: { DEFAULT: c('bad'), soft: c('bad-soft') },
        info: { DEFAULT: c('info'), soft: c('info-soft') },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: { pop: '0 18px 40px -22px rgb(0 0 0 / 0.45)' },
    },
  },
  plugins: [],
};
