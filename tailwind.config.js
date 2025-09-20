/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'facebook-blue': '#1877F2',
      },
      backgroundImage: {
        'gradient-blue': 'linear-gradient(to right bottom, #1877F2, #0C63D4)',
      },
    },
  },
  plugins: [],
}
