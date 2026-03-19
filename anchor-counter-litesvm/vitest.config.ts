import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Disable parallel file execution to keep test output clean and
    // avoid port conflicts from any future network-using tests.
    fileParallelism: false,
    // Long timeout – LiteSVM is fast but program loading can take a moment.
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
