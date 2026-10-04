/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tests are not part of the page: a class name written in a test string
  // (a guard's sample, say) would otherwise ship its CSS in production.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "!./src/**/*.test.{ts,tsx}",
    "!./src/**/__tests__/**",
    "!./src/test/**",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        family: {
          cyan: "#22d3ee",
          magenta: "#f472b6",
          lime: "#a3e635",
          orange: "#fb923c",
        },
        dark: {
          bg: "#121212",
          surface: "#1e1e1e",
          text: "#f3f4f6",
        },
      },
      fontSize: {
        giant: "10rem", // For clock
        mega: "4rem", // For headlines
        big: "2rem", // For card titles
      },
    },
  },
  plugins: [],
};
