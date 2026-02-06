import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const dirsToClean = [
  'test-results',
  'playwright-report',
  'coverage',
  '.vitest-cache'
];

console.log('🧹 Cleaning test artifacts...');

dirsToClean.forEach(dir => {
  const fullPath = path.join(rootDir, dir);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`✅ Removed: ${dir}`);
    } catch (err) {
      console.error(`❌ Failed to remove ${dir}:`, err.message);
    }
  }
});

console.log('✨ Cleanup complete.');
