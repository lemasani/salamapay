import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests run against a separate database (TEST_DATABASE_URL in .env.local).
const env = loadEnv("test", process.cwd(), "");
const testDb = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Set TEST_DATABASE_URL (see .env.example)");
process.env.TEST_DATABASE_URL = testDb;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: testDb,
      OTP_SECRET: "test-otp-secret",
    },
  },
});
