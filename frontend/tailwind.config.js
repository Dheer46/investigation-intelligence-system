/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          950: '#0a0e14',
          900: '#10151f',
          800: '#161d2b',
          700: '#212a3d',
        },
        // Trust blue - the one accent color used for primary actions and
        // "this is the important thing" emphasis. Everything else stays
        // neutral so the palette doesn't compete with itself.
        trust: {
          400: '#5b9bf5',
          500: '#3b7de0',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        alert: {
          high: '#e5604f',
          medium: '#d99a3f',
          low: '#3fb37f',
        },
      },
      fontSize: {
        // A calmer type scale with slightly more generous line-heights than
        // Tailwind's defaults, for a less "cramped terminal" feel.
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.875rem', { lineHeight: '1.6' }],
        base: ['1rem', { lineHeight: '1.65' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.25rem', { lineHeight: '1.5' }],
        '2xl': ['1.5rem', { lineHeight: '1.4' }],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
