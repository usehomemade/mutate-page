import { describe, expect, it } from "vitest";

import {
  MACROMUTATION_LABEL,
  MACROMUTATION_PROBABILITY,
  macromutationFromDirective,
  macromutationFromMutationJson,
  shouldTriggerMacromutation,
} from "@/lib/macromutation";

describe("macromutation sampling", () => {
  it("selects exactly the lower ten percent of the unit interval", () => {
    expect(MACROMUTATION_PROBABILITY).toBe(0.1);
    expect(shouldTriggerMacromutation(0)).toBe(true);
    expect(shouldTriggerMacromutation(0.099999)).toBe(true);
    expect(shouldTriggerMacromutation(0.1)).toBe(false);
    expect(shouldTriggerMacromutation(0.999999)).toBe(false);
  });

  it("rejects invalid samples so tests and callers cannot skew the rate", () => {
    expect(() => shouldTriggerMacromutation(-0.01)).toThrow();
    expect(() => shouldTriggerMacromutation(1)).toThrow();
    expect(() => shouldTriggerMacromutation(Number.NaN)).toThrow();
  });
});

describe("macromutation metadata", () => {
  it("normalizes a directive and reads it from persisted mutation JSON", () => {
    const macromutation = macromutationFromDirective(
      "  Turn the archive\n into a playable weather system.  ",
    );

    expect(macromutation).toEqual({
      label: MACROMUTATION_LABEL,
      directive: "Turn the archive into a playable weather system.",
    });
    expect(
      macromutationFromMutationJson(
        JSON.stringify({ description: "changed", macromutation }),
      ),
    ).toEqual(macromutation);
  });

  it("treats missing, malformed, or legacy metadata as ordinary mutation", () => {
    expect(macromutationFromMutationJson("{}" )).toBeNull();
    expect(macromutationFromMutationJson("not json")).toBeNull();
    expect(
      macromutationFromMutationJson(
        JSON.stringify({ macromutation: { label: "Macromutation" } }),
      ),
    ).toBeNull();
  });
});
