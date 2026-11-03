# GCal Simplified 📅

A simplified, beautiful Google Calendar desktop application built with Electron, React, and TypeScript. This app provides a clean, focused interface for viewing your Google Calendar events with integrated weather information.

## Features ✨

- **Google Calendar Integration**: Seamlessly connect to your Google Calendar account
- **Clean, Modern Interface**: Minimalist design focused on what matters
- **Weather Integration**: View weather forecasts alongside your calendar events
- **Desktop Application**: Native Electron app for Windows, macOS, and Linux
- **Real-time Updates**: Stay synchronized with your Google Calendar
- **Responsive Design**: Beautiful UI built with Tailwind CSS and Framer Motion

## Tech Stack 🛠️

- **Frontend**: React 18 with TypeScript
- **Desktop Framework**: Electron 45
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS with custom animations
- **Animation**: Framer Motion
- **APIs**: Google Calendar API, Weather API
- **Date Handling**: date-fns
- **Icons**: Lucide React
- **Testing**: Playwright (E2E), Vitest (Unit)

## Getting Started 🚀

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Calendar API credentials

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/gcal-simplified.git
cd gcal-simplified
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:
   Create a `.env` file in the root directory with your API credentials:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_CLIENT_SECRET=your_google_client_secret
VITE_WEATHER_API_KEY=your_weather_api_key
```

### Running the Application

Start the development server:

```bash
npm run dev
```

This will launch the Electron app with hot module replacement (HMR) enabled.

## Testing 🧪

The project uses a comprehensive testing strategy combining Unit tests (Vitest) and End-to-End tests (Playwright).

### Running All Tests

To run the full test suite (Unit + E2E):

```bash
npm test
```

### Unit Tests (Vitest)

Unit tests focus on individual components and logic/utils. They are located in `src/**/__tests__`.

Run unit tests only:

```bash
npm run test:unit
```

### End-to-End Tests (Playwright)

E2E tests verify the full application capabilities in a real Electron environment. They are located in `e2e/`.

Run E2E tests only:

```bash
npm run test:run
```

For interactive debugging with the Playwright UI:

```bash
npm run test:ui
```

### Cleaning Test Results

To remove generated test results, screenshots, and reports:

```bash
npm run test:clean
```

## Available Scripts 📜

- `npm run dev` - Start the development server
- `npm run build` - Build the application for production
- `npm run preview` - Preview the production build
- `npm run lint` - Run ESLint to check code quality
- `npm test` - Run All tests (Unit + E2E)
- `npm run test:clean` - Remove test results and reports
- `npm run test:unit` - Run Unit tests via Vitest
- `npm run test:run` - Run E2E tests via Playwright
- `npm run test:ui` - Run E2E tests with Playwright UI
- `npm run test:debug` - Debug E2E tests with Playwright
- `npm run test:headed` - Run E2E tests in headed mode

## Project Structure 📁

```
gcal-simplified/
├── src/                  # Frontend source code (React)
│   ├── components/       # React components
│   │   └── __tests__/    # Component unit tests
│   ├── utils/            # Shared utility functions
│   ├── types.ts          # TypeScript type definitions
│   ├── mock/             # Mock data for development
│   └── main.tsx          # React entry point
├── electron/             # Electron main process (Node.js)
│   ├── main.ts           # Main entry point
│   ├── preload.ts        # Preload script
│   ├── api.ts            # Calendar API logic
│   ├── auth.ts           # Authentication logic
│   └── weather.ts        # Weather API integration
├── e2e/                  # Playwright end-to-end tests
├── public/               # Static assets
└── dist*/                # Build outputs (generated)
```

## Building for Production 🏗️

Build the application:

```bash
npm run build
```

This will:

1. Compile TypeScript
2. Build the Vite bundle
3. Package the Electron application using electron-builder

The built application installers will be in the `release/<version>` directory (e.g., `release/0.0.0/`).

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## License 📄

This project is licensed under the MIT License.

## Acknowledgments 🙏

- Google Calendar API
- React and TypeScript communities
- Electron framework
- All open-source contributors
