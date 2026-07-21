import { z } from "zod";

export const pageDnaSchema = z.object({
  topic: z.string().min(1).max(240),
  visualStyle: z.string().min(1).max(500),
  layout: z.string().min(1).max(500),
  interactiveFeatures: z.array(z.string().max(200)).max(20),
  inheritedTraits: z.array(z.string().max(200)).max(20),
});

export const mutationDescriptionSchema = z.object({
  description: z.string().min(1).max(1_000),
  changes: z.array(z.string().max(300)).min(1).max(20),
});

export const contentBriefSchema = z.object({
  subject: z.string().min(1).max(200),
  genre: z.string().min(1).max(120),
  tone: z.string().min(1).max(160),
  keyContent: z.array(z.string().max(240)).min(1).max(6),
  visualDirection: z.string().min(1).max(300),
  interactionIdeas: z.array(z.string().max(160)).max(5),
});

export type ContentBrief = z.infer<typeof contentBriefSchema>;

export const contentBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "subject",
    "genre",
    "tone",
    "keyContent",
    "visualDirection",
    "interactionIdeas",
  ],
  properties: {
    subject: {
      type: "string",
      description:
        "The concrete, real-world subject of the page (e.g. \"a weekend farmers-market finder\"). Never mutation, evolution, AI, or this system.",
    },
    genre: {
      type: "string",
      description:
        "The concrete kind of website this is (e.g. \"a punk zine archive\", \"a fictional airline's booking page\").",
    },
    tone: { type: "string", description: "The voice and mood of the page." },
    keyContent: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      description: "Concrete content beats, sections, or copy ideas to include.",
      items: { type: "string" },
    },
    visualDirection: {
      type: "string",
      description: "Palette, layout, and typography direction.",
    },
    interactionIdeas: {
      type: "array",
      maxItems: 5,
      description:
        "Concrete interactive elements with concrete labels (e.g. \"a 'Brew another cup' button\"). Never meta labels like \"evolve\" or \"mutate\".",
      items: { type: "string" },
    },
  },
} as const;

export const patchRegionSchema = z.object({
  id: z.number().int().min(0),
  html: z.string(),
});

export const generatedPatchSchema = z.object({
  scope: z.enum(["region", "full"]),
  html: z.string(),
  regions: z.array(patchRegionSchema).max(6),
  appendCss: z.string(),
  appendJs: z.string(),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_000),
  dna: pageDnaSchema,
  mutation: mutationDescriptionSchema,
});

export type PageDna = z.infer<typeof pageDnaSchema>;
export type MutationDescription = z.infer<typeof mutationDescriptionSchema>;
export type PatchRegion = z.infer<typeof patchRegionSchema>;
export type GeneratedPatch = z.infer<typeof generatedPatchSchema>;

export const generatedPatchJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "scope",
    "html",
    "regions",
    "appendCss",
    "appendJs",
    "title",
    "summary",
    "dna",
    "mutation",
  ],
  properties: {
    scope: {
      type: "string",
      enum: ["region", "full"],
      description:
        "\"region\" replaces only the affected data-mut regions (fast, preferred). \"full\" replaces the entire document (only for genuinely structural changes).",
    },
    html: {
      type: "string",
      description:
        "A complete replacement document when scope is \"full\"; empty string \"\" when scope is \"region\".",
    },
    regions: {
      type: "array",
      maxItems: 6,
      description:
        "Replacement subtrees keyed by their data-mut id, used only when scope is \"region\". Empty array when scope is \"full\".",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "html"],
        properties: {
          id: {
            type: "integer",
            description: "The data-mut id of the element being replaced.",
          },
          html: {
            type: "string",
            description:
              "The full replacement HTML for this element, including its own opening and closing tag.",
          },
        },
      },
    },
    appendCss: {
      type: "string",
      description:
        "Extra CSS rules to append to the document. Empty string \"\" if none.",
    },
    appendJs: {
      type: "string",
      description:
        "Extra inline JavaScript to append to the document. Empty string \"\" if none.",
    },
    title: { type: "string" },
    summary: { type: "string" },
    dna: {
      type: "object",
      additionalProperties: false,
      required: [
        "topic",
        "visualStyle",
        "layout",
        "interactiveFeatures",
        "inheritedTraits",
      ],
      properties: {
        topic: { type: "string" },
        visualStyle: { type: "string" },
        layout: { type: "string" },
        interactiveFeatures: {
          type: "array",
          items: { type: "string" },
        },
        inheritedTraits: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    mutation: {
      type: "object",
      additionalProperties: false,
      required: ["description", "changes"],
      properties: {
        description: { type: "string" },
        changes: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Whether a given mutation is allowed to replace the whole document (a
 * genre-changing "leap") rather than a small region patch. This is decided
 * programmatically by the caller, not left to the model's judgment: the
 * returned JSON schema's "scope" enum is narrowed so a disallowed scope is
 * not a representable output at all.
 */
export type PatchScopeMode = "region-only" | "full-optional" | "full-only";

export function buildGeneratedPatchJsonSchema(scopeMode: PatchScopeMode) {
  const scopeEnum =
    scopeMode === "region-only"
      ? ["region"]
      : scopeMode === "full-only"
        ? ["full"]
        : ["region", "full"];

  return {
    ...generatedPatchJsonSchema,
    properties: {
      ...generatedPatchJsonSchema.properties,
      scope: {
        ...generatedPatchJsonSchema.properties.scope,
        enum: scopeEnum,
      },
    },
  };
}

