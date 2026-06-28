import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Primary brand — blue #3d8de2 (matches the documented theme + chart fills).
        brand: {
          50:  '#eff6fd',
          100: '#d8e9fa',
          200: '#b4d3f4',
          300: '#8bbaed',
          400: '#5ea0e6',
          500: '#3d8de2',
          600: '#2f73c0',
          700: '#285f9e',
          800: '#234e80',
          900: '#1f4269',
        },
        // Secondary accent — orange #fe841f.
        accent: {
          50:  '#fff4e9',
          100: '#ffe4cc',
          200: '#ffc999',
          300: '#ffac66',
          400: '#fe9540',
          500: '#fe841f',
          600: '#e86f0a',
          700: '#c25a08',
          800: '#9a4810',
        },
        sidebar:          '#1A1A1A',
        'sidebar-hover':  '#2D2D2D',
        'sidebar-active': '#3D3D3D',
      },
      boxShadow: {
        sm:      '0px 1px 3px 0px rgba(0, 0, 0, 0.08), 0px 1px 2px -1px rgba(0, 0, 0, 0.06)',
        DEFAULT: '0px 4px 6px -1px rgba(0, 0, 0, 0.07), 0px 2px 4px -2px rgba(0, 0, 0, 0.05)',
        md:      '0px 4px 6px -1px rgba(0, 0, 0, 0.07), 0px 2px 4px -2px rgba(0, 0, 0, 0.05)',
        lg:      '0px 10px 15px -3px rgba(0, 0, 0, 0.08), 0px 4px 6px -4px rgba(0, 0, 0, 0.04)',
        xl:      '0px 20px 25px -5px rgba(0, 0, 0, 0.08), 0px 8px 10px -6px rgba(0, 0, 0, 0.04)',
        '2xl':   '0px 25px 50px -12px rgba(0, 0, 0, 0.22)',
      },
    },
  },
  plugins: [],
};

export default config;
