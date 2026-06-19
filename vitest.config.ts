import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { globals: true, include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}"], },
});
