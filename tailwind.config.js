/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#F5F7F6',
        ink: {
          DEFAULT: '#18201E',
          soft: '#6B7672',
        },
        dark: {
          DEFAULT: '#172321',
          green: '#1D3A35',
        },
        brand: {
          50: '#DCEAE6',
          100: '#C3DBD4',
          400: '#7C9B95',
          600: '#2F6F63',
          700: '#315C54',
          900: '#1D3A35',
        },
        line: '#E4E9E7',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,35,33,0.04), 0 8px 24px -12px rgba(23,35,33,0.12)',
      },
    },
  },
  plugins: [],
}
