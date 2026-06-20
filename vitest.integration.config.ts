import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["packages/**/*.itest.ts"], pool: "forks", fileParallelism: false },
});
