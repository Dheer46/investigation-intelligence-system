/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        // A deliberately distinct palette from the investigator dashboard's
        // blue/ink theme - this is a different application with a different
        // tone (formal, administrative, "official record" rather than
        // "working tool"). Deep navy + warm gold, restrained and legible.
        gov: {
          950: '#0b1220',
          900: '#101a2e',
          800: '#17233b',
          700: '#223250',
          600: '#334568',
        },
        seal: {
          400: '#e0bf6f',
          500: '#c9a24a',
          600: '#ab8636',
          700: '#8a6a29',
        },
        crest: {
          500: '#8a2f3b',
          600: '#732530',
        },
        paper: '#f3efe4',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
