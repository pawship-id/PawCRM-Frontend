import type { Config } from "jest";
import nextJest from "next/jest.js";

/**
 * next/jest wires up the Next.js SWC transform, CSS and next/font mocking,
 * .env loading and module aliases. Configuring Jest by hand would mean
 * reimplementing all of that.
 */
const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/tests/**",
    "!src/app/layout.tsx",
  ],
  clearMocks: true,
};

export default createJestConfig(config);
