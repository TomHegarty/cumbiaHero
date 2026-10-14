import { defineConfig } from 'vitest/config'

// Security-rules tests need the Firebase emulator, so they run apart from `npm test`.
export default defineConfig({
  test: { include: ['rules/**/*.rules.ts'], testTimeout: 15000 },
})
