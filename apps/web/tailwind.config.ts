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
          50:  '#FEF4F2',
          100: '#FDDCD6',
          200: '#F9B8AB',
          300: '#F09080',
          400: '#E86D55',
          500: '#E8533A',
          600: '#CC3E27',
          700: '#AD2D18',
          800: '#8B1D0F',
          900: '#6E1108',
        },
        accent: {
          50:  '#FEF4F2',
          100: '#FDDCD6',
          200: '#F9B8AB',
          500: '#E8533A',
          600: '#CC3E27',
          700: '#AD2D18',
          800: '#8B1D0F',
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
