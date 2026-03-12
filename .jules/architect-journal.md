# Architect Journal
## 2024-03-11 - Resolving ESLint Warnings in Test Files

**Learning:** When resolving `eslint` errors like `Unexpected any`, removing the `eslint-disable` directive indiscriminately can break the build if the code issue isn't fixed or if the tests heavily rely on `any`. `react-refresh/only-export-components` often flags utility hooks exported from the same file as React components.
**Action:** Be extremely cautious when modifying existing ESLint suppression comments in test files. Either fix the underlying issue (e.g., change `any` to `unknown` or specific types) or carefully use `// eslint-disable-next-line` to suppress specific rules while ensuring CI still passes.

## 2024-03-11 - Splitting God Components

**Learning:** The `WeatherDashboard.tsx` component was over 600 lines long, violating the Single Responsibility Principle and bloating the AI context window.
**Action:** Always identify distinct visual domains (Weather, Tides, Tasks) and separate them into their own files. When extracting, be mindful to update imports in the corresponding `.test.tsx` files.
