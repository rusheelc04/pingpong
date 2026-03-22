import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.e2e\.ts/,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5173"
  },
  webServer: [
    {
      command:
        "npm --prefix ../.. run mongo:up && npm --prefix ../.. run build -w @pingpong/shared && npm --prefix ../.. run dev -w @pingpong/server",
      url: "http://127.0.0.1:3001/api/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command:
        "npm --prefix ../.. run dev -w @pingpong/web -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
