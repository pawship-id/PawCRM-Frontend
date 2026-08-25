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
  /**
   * The `@/` alias, for `jest.mock()` specifically.
   *
   * ORDINARY IMPORTS ALREADY WORK WITHOUT THIS. `next/jest` installs the SWC
   * transform, which resolves the tsconfig `paths` alias while transforming a
   * module — so `import { x } from "@/services/y"` has always been fine here.
   *
   * `jest.mock("@/services/y")` is the case it does NOT cover: that string is
   * resolved at runtime by jest-resolve, which consults moduleNameMapper and
   * nothing else. Without this entry the call throws "Cannot find module" and
   * the whole suite fails to run — while every import in the same file resolves
   * perfectly, which is what makes the failure so confusing.
   *
   * The repo avoided the problem until now by convention: the service suites spy
   * on the `apiClient` singleton rather than mocking a module, and
   * stockLedger.service.test.ts says so explicitly — "which keeps the @/ alias
   * out of the mock path". That works for testing a service's own calls. A
   * COMPONENT test has to replace the whole service module, so it cannot.
   *
   * Declared here rather than adding `baseUrl` to tsconfig.json: `baseUrl`
   * changes how the compiler resolves every bare import, which is a far larger
   * blast radius than one test-runner concern deserves.
   */
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  /**
   * Fifteen seconds, against Jest's default of five.
   *
   * NOT A WORKAROUND FOR A SLOW TEST — a guard against the suite's result
   * depending on how busy the machine is. The heavy component suites drive
   * `userEvent`, which types character by character through the real React
   * event loop: `ProductForm.test.tsx` alone is 44 tests and ~27 seconds, and
   * under a full parallel run its longest case sat close enough to five seconds
   * that adding suites elsewhere in the project pushed it over. That failure
   * says nothing about the code under test.
   *
   * A ceiling still worth having: a test that genuinely hangs — an unresolved
   * promise, a `waitFor` on something that never arrives — fails here rather
   * than running until the CI job is killed.
   */
  testTimeout: 15_000,
  /**
   * HALF THE CORES, against Jest's default of one worker per core minus one.
   *
   * Measured, not guessed. On an 8-core machine the default (7 workers) ran this
   * suite in 78–134 seconds and FAILED 3 of 6 runs — always `ProductForm`, always
   * a 15-second timeout, always passing when re-run alone. At 4 workers it runs
   * in ~65 seconds and passes.
   *
   * Faster with fewer workers is the counter-intuitive part, and it is the tell:
   * seven jsdom environments on eight cores spend more time being switched
   * between than they gain from running at once. Every test slows down, and the
   * longest ones — the component suites that drive `userEvent` character by
   * character — cross the timeout. The 70% spread in wall time between identical
   * runs was thrashing, not load.
   *
   * A PERCENTAGE RATHER THAN A NUMBER so CI, which usually has fewer cores than
   * a laptop, scales down with it instead of oversubscribing worse.
   *
   * Revisit alongside `testTimeout`: raising the timeout would have hidden this
   * rather than fixed it, and the suite would have stayed twice as slow.
   */
  maxWorkers: "50%",
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
