/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          bgLight: '#FAFAFA',
          bgDark: '#09090B',
          cardLight: '#FFFFFF',
          cardDark: '#18181B',
          borderLight: '#E4E4E7',
          borderDark: '#27272A',
          textLight: '#18181B',
          textDark: '#FAFAFA',
          mutedLight: '#71717A',
          mutedDark: '#A1A1AA',
        },
        accent: {
          DEFAULT: '#4F46E5', // Indigo primary
          hover: '#4338CA',
          light: '#EEF2FF',
          dark: '#312E81',
        },
        chart: {
          forecast: '#2563EB',
          actual: '#F97316',
          shortfall: '#DC2626',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'card': '12px',
      },
      boxShadow: {
        'card': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'popover': '0 4px 12px 0 rgba(0, 0, 0, 0.08)',
      }
    },
  },
  plugins: [],
}
