import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        carbon: {
          q1: '#16a34a',
          q2: '#84cc16',
          q3: '#eab308',
          q4: '#f97316',
          q5: '#dc2626',
          unknown: '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
