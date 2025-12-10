/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0b14',
        surface: '#11121c',
        primary: {
          DEFAULT: '#ec4899', // Pink-500
          hover: '#db2777', // Pink-600
        },
        secondary: {
          DEFAULT: '#8b5cf6', // Purple-500
          hover: '#7c3aed', // Purple-600
        },
        border: '#1f2937', // Gray-800
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

