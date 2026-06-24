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
        brand: {
          50:  '#eff7ff',
          100: '#dbeeff',
          200: '#bfd7f8',
          300: '#93bbf0',
          400: '#6aa3e8',
          500: '#5498e8',
          600: '#3d8de2',
          700: '#2a78cc',
          800: '#1e5ea4',
          900: '#154478',
        },
        accent: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fcd9a8',
          500: '#f97e1a',
          600: '#fe841f',
          700: '#e9700a',
          800: '#c45808',
        },
        sidebar:          '#1b3558',
        'sidebar-hover':  '#24426e',
        'sidebar-active': '#2d5180',
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
