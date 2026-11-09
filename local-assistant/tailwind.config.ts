import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0d10',
          900: '#12151a',
          800: '#1a1f27',
          700: '#262d38',
        },
        mist: {
          100: '#e8edf4',
          300: '#a8b3c4',
          500: '#6b778a',
        },
        accent: {
          DEFAULT: '#3d9a7a',
          soft: '#2a6b55',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
