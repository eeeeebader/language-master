import { describe, expect, it } from "vitest";
import { registry, routeLabel } from "../src/lib/metrics";

describe("metrics", () => {
  it("normalises ids out of route labels", () => {
    expect(routeLabel("/stories/01M6P3MR3CZN2DBSB1MFRC58RC")).toBe("/stories/:id");
    expect(routeLabel("/admin/users/5f1c2a0e-1c2b-4e1f-9a1e-7a6b1c2d3e4f/export")).toBe(
      "/admin/users/:id/export",
    );
    expect(routeLabel("/lectures/12/publish")).toBe("/lectures/:n/publish");
    expect(routeLabel("/health")).toBe("/health");
  });

  it("exposes the planned series", async () => {
    const text = await registry.metrics();
    for (const name of [
      "lm_http_request_duration_seconds",
      "lm_sync_push_duration_seconds",
      "lm_story_generations_total",
      "lm_llm_cost_cents_total",
      "lm_pack_download_failures_total",
    ])
      expect(text).toContain(`# HELP ${name}`);
  });
});
