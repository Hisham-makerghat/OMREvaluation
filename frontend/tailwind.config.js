/** @type {import('tailwindcss').Config} */
// Colours are the MakerGhat design system's secondary palette (coral, sun, leaf on warm ivory).
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: '#faf4e8',            // page background
        line: '#ead8b5',             // borders and dividers
        ink: '#3f2b12',              // body text
        muted: '#856633',            // secondary text (5.3:1 on white)
        heading: '#4d2117',          // headings, text on coral
        brand: { DEFAULT: '#9d4f39', dark: '#833f2d' },                       // main buttons, links
        coral: { DEFAULT: '#f47858', wash: '#fdeae5', dark: '#d56b4e' },       // selected tab, chosen answer
        sun: { DEFAULT: '#ffcd2f', wash: '#fff3cc', ink: '#594918' },          // "to check"
        leaf: { DEFAULT: '#50bb77', wash: '#ddf3e4', ink: '#234a30', text: '#3d7b4f' }, // right, read fine
        danger: { DEFAULT: '#e60000', wash: '#fdecec' },                       // wrong, could not read
      },
      fontFamily: {
        display: ['Parkinsans', 'Outfit', 'system-ui', 'sans-serif'],
        sans: ['Outfit', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      maxWidth: { page: '1200px' },
    },
  },
  plugins: [],
}
