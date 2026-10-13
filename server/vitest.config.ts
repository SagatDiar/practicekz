import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/testEnv";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    setupFiles: ["tests/setup.ts"],
    // все файлы работают с одной базой, поэтому по очереди
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
      WEB_ORIGIN: "http://localhost:5173",
      AUTH_RATE_LIMIT: "1000",
    },
  },
});
