import { describe, expect, it } from "vitest";

import { contentBriefSchema, generatedPatchSchema } from "@/lib/mutation-schema";

const validPatch = {
  scope: "region",
  html: "",
  regions: [
    {
      id: 0,
      html: "<a href=\"/play-cats\">Play</a>",
    },
  ],
  appendCss: "",
  appendJs: "",
  title: "Cat atlas",
  summary: "A compact atlas of domestic cats.",
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

describe("OpenRouter structured patch schema", () => {
  it("accepts a complete bounded patch description with no action-declaration fields", () => {
    expect(generatedPatchSchema.parse(validPatch)).toEqual(validPatch);
  });

  it("rejects more than six regions", () => {
    const result = generatedPatchSchema.safeParse({
      ...validPatch,
      regions: Array.from({ length: 7 }, (_, index) => ({
        id: index,
        html: `<div>${index}</div>`,
      })),
    });
    expect(result.success).toBe(false);
  });
});

const validBrief = {
  subject: "a weekend farmers-market finder",
  genre: "a local-commerce directory",
  tone: "warm and practical",
  keyContent: ["A map of nearby markets.", "A list of what's in season."],
  visualDirection: "Earthy palette, hand-drawn icons.",
  interactionIdeas: ["A 'Find near me' button."],
};

describe("OpenRouter structured content brief schema", () => {
  it("accepts a complete bounded brief", () => {
    expect(contentBriefSchema.parse(validBrief)).toEqual(validBrief);
  });

  it("rejects an empty keyContent list", () => {
    const result = contentBriefSchema.safeParse({ ...validBrief, keyContent: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than five interaction ideas", () => {
    const result = contentBriefSchema.safeParse({
      ...validBrief,
      interactionIdeas: Array.from({ length: 6 }, (_, index) => `Idea ${index}`),
    });
    expect(result.success).toBe(false);
  });
});
