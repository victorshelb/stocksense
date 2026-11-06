/** @type {import('tailwindcss').Config} */

// Every color resolves to a CSS variable (an "R G B" triple) so the whole app
// re-themes between the light "paper" look and dark mode purely from index.css,
// with no per-component edits. The `/ <alpha-value>` form keeps opacity
// utilities like `bg-slate-900/60` working.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const ramp = (prefix, shades) =>
  Object.fromEntries(shades.map((s) => [s, v(`${prefix}-${s}`)]));

const NEUTRAL = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const BRAND   = [200, 300, 400, 500, 600, 700, 800, 900, 950];
const SEM     = [300, 400, 500, 600, 700, 800, 900, 950];

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // neutral surface / text ramp
        slate: ramp('s', NEUTRAL),
        // brand (blue + indigo both map to the indigo brand ramp)
        blue: ramp('br', BRAND),
        indigo: ramp('br', BRAND),
        // gain (emerald + green share one ramp)
        emerald: ramp('gn', SEM),
        green: ramp('gn', SEM),
        // loss
        red: ramp('ls', SEM),
        // warning / gold
        amber: ramp('wn', SEM),
        // semantic shortcuts used directly in a few places
        gain: v('gn-500'),
        loss: v('ls-500'),
        neutral: v('wn-500'),
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
