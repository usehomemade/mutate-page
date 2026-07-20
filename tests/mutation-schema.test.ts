import { describe, expect, it } from "vitest";

import { generatedPageSchema } from "@/lib/mutation-schema";

const validPage = {
  title: "Cat atlas",
  summary: "A compact atlas of domestic cats.",
  html: "<!doctype html><html><head><title>Cat atlas</title></head><body><button data-evolve=\"play-cats\">Play</button></body></html>",
  actions: [
    {
      id: "play-cats",
      label: "Play cats",
      intent: "Evolve into a tiny cat game.",
    },
  ],
  dna: {
    topic: "cats",
    visualStyle: "encyclopedic",
    layout: "article",
    interactiveFeatures: [],
    inheritedTraits: ["serif headings"],
  },
  mutation: {
    description: "Dogs became cats.",
    changes: ["Changed the subject"],
  },
};

describe("OpenRouter structured page schema", () => {
  it("accepts a complete bounded page description", () => {
    expect(generatedPageSchema.parse(validPage)).toEqual(validPage);
  });

  it("rejects malformed evolutionary action IDs", () => {
    const result = generatedPageSchema.safeParse({
      ...validPage,
      actions: [{ ...validPage.actions[0], id: "Play Cats!" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than eight actions", () => {
    const result = generatedPageSchema.safeParse({
      ...validPage,
      actions: Array.from({ length: 9 }, (_, index) => ({
        id: `path-${index}`,
        label: `Path ${index}`,
        intent: `Follow path ${index}`,
      })),
    });
    expect(result.success).toBe(false);
  });
});
