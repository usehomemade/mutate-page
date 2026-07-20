import { z } from "zod";

export const evolutionaryActionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().min(1).max(80),
  intent: z.string().min(1).max(500),
});

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

export const generatedPageSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_000),
  html: z.string().min(100),
  actions: z.array(evolutionaryActionSchema).max(8),
  dna: pageDnaSchema,
  mutation: mutationDescriptionSchema,
});

export type EvolutionaryAction = z.infer<typeof evolutionaryActionSchema>;
export type PageDna = z.infer<typeof pageDnaSchema>;
export type MutationDescription = z.infer<typeof mutationDescriptionSchema>;
export type GeneratedPage = z.infer<typeof generatedPageSchema>;

export const generatedPageJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "html", "actions", "dna", "mutation"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    html: { type: "string" },
    actions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "intent"],
        properties: {
          id: {
            type: "string",
            description:
              "Lowercase kebab-case identifier matching a data-evolve attribute in the HTML.",
          },
          label: { type: "string" },
          intent: {
            type: "string",
            description:
              "A concise semantic description of what following this action should evolve toward.",
          },
        },
      },
    },
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

