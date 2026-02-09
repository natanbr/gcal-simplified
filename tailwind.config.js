/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
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
