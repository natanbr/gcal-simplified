import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The suite reads local time, so it pins a zone instead of taking the machine's. A machine set to the
// Windows zone "British Columbia Standard Time" (BC on UTC-07:00 all year from 2026-11-01) is a zone
// Node's stale tzdata cannot name: it fell to a fixed GMT-08:00 and a date assertion moved a day.
// Los Angeles keeps DST under every tzdata; a file that needs another zone sets its own TZ.
process.env.TZ = 'America/Los_Angeles';

export default mergeConfig(
    defineConfig({
        plugins: [react()],
    }),
    defineConfig({
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: './src/test/setup.ts',
            exclude: ['e2e/**/*', 'node_modules/**/*'],
            include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.{ts,tsx}'],
            typecheck: { tsconfig: './tsconfig.test.json' },
        },
    }),
);
