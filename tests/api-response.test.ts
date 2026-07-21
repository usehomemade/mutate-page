import { describe, expect, it } from "vitest";

import { readJsonResponse } from "@/lib/api-response";

describe("API response parsing", () => {
  it("parses JSON responses", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
    await expect(readJsonResponse<{ ok: boolean }>(response)).resolves.toEqual({
      ok: true,
    });
  });

  it("returns null for HTML proxy errors instead of throwing", async () => {
    const response = new Response("<!DOCTYPE html><title>Bad Gateway</title>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
    await expect(readJsonResponse(response)).resolves.toBeNull();
  });
});
