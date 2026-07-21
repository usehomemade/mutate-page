import { describe, expect, it } from "vitest";

import { requestHasAllowedOrigin, resolveAppUrl } from "@/lib/app-url";

const homemadeEnvironment = {
  PORT: "3000",
  HOMEMADE_VM_NAME: "sunny-maple",
  HOMEMADE_VM_DOMAIN: "onhmmd.com",
};

describe("public app origin", () => {
  it("derives the per-port Homemade preview URL", () => {
    expect(resolveAppUrl(homemadeEnvironment)).toBe(
      "https://sunny-maple-3000.onhmmd.com",
    );
  });

  it("prefers an explicitly configured app URL", () => {
    expect(
      resolveAppUrl({
        ...homemadeEnvironment,
        APP_URL: "https://mutate.example/path",
      }),
    ).toBe("https://mutate.example");
  });

  it("accepts the public proxy origin while rejecting unrelated origins", () => {
    const internalUrl = "http://127.0.0.1:3000/api/mutate";
    const allowed = new Request(internalUrl, {
      headers: { origin: "https://sunny-maple-3000.onhmmd.com" },
    });
    const blocked = new Request(internalUrl, {
      headers: { origin: "https://untrusted.example" },
    });

    expect(requestHasAllowedOrigin(allowed, homemadeEnvironment)).toBe(true);
    expect(requestHasAllowedOrigin(blocked, homemadeEnvironment)).toBe(false);
  });
});
