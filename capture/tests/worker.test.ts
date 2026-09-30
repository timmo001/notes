import { describe, expect, test } from "bun:test";
import worker from "../src/worker.js";

let assetRequests = 0;

const env = {
  ACCESS_AUD: "development",
  ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  GITHUB_OWNER: "example-owner",
  GITHUB_REPO: "private-notes",
  CAPTURE_REPOSITORIES:
    '[{"label":"Private notes","repository":"example-owner/private-notes"}]',
  GITHUB_TOKEN: "set-as-a-production-secret",
  QUEUE_LABEL: "agent:ready",
  ASSETS: {
    async fetch() {
      assetRequests += 1;

      return new Response("asset");
    },
    connect() {
      throw new Error("Unexpected socket connection");
    },
  },
} satisfies Env;

describe("worker", () => {
  test.each([
    ["GET", "/"],
    ["GET", "/api/repositories"],
    ["POST", "/api/captures"],
  ])(
    "rejects %s %s without a Cloudflare Access token",
    async (method, path) => {
      const response = await worker.fetch(
        new Request(`https://capture.example${path}`, { method }),
        env,
      );

      expect(response.status).toBe(401);
      expect(assetRequests).toBe(0);
    },
  );
});
