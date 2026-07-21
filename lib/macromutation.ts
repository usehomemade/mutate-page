import { randomInt } from "node:crypto";

import { z } from "zod";

export const MACROMUTATION_PROBABILITY = 0.1;
export const MACROMUTATION_LABEL = "Macromutation";

export const macromutationSchema = z.object({
  label: z.string().min(1).max(80),
  directive: z.string().min(1).max(400),
});

export type Macromutation = z.infer<typeof macromutationSchema>;

function randomUnit() {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function shouldTriggerMacromutation(sample = randomUnit()) {
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error("A macromutation sample must be between 0 (inclusive) and 1 (exclusive).");
  }

  return sample < MACROMUTATION_PROBABILITY;
}

export function macromutationFromDirective(directive: string): Macromutation {
  const normalized = directive.replace(/\s+/g, " ").trim();
  return macromutationSchema.parse({
    label: MACROMUTATION_LABEL,
    directive: normalized,
  });
}

export function macromutationFromMutationJson(json: string): Macromutation | null {
  try {
    const mutation = JSON.parse(json) as { macromutation?: unknown };
    const parsed = macromutationSchema.safeParse(mutation.macromutation);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
