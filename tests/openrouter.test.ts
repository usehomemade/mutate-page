import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Revision } from "@/lib/db/schema";
import type { ContentBrief } from "@/lib/mutation-schema";

vi.mock("server-only", () => ({}));

const parent = {
  id: "primordial",
  worldId: "world-shared",
  parentId: null,
  depth: 0,
  status: "ready",
  title: "Primordial",
  summary: "The original page.",
  dnaJson: "{}",
} as Revision;

const brief: ContentBrief = {
  subject: "a tactile constellation archive",
  genre: "generative web art",
  tone: "quiet and curious",
  keyContent: ["A field of draggable stars."],
  visualDirection: "Deep indigo background, warm starlight accents.",
  interactionIdeas: ["A 'Rearrange the sky' button."],
};

const patch = {
  scope: "region",
  html: "",
  regions: [
    {
      id: 0,
      html: `<main>${"quick ".repeat(20)}</main>`,
    },
  ],
  appendCss: "",
  appendJs: "",
  title: "Fast mutation",
  summary: "A compact generated patch.",
  dna: {
    topic: "speed",
    visualStyle: "minimal",
    layout: "centered",
    interactiveFeatures: [],
    inheritedTraits: ["button"],
  },
  mutation: {
    description: "The page became faster.",
    changes: ["Reduced output"],
  },
};

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "");
  vi.stubEnv("OPENROUTER_MACROMUTATION_MODEL", "");
  vi.stubEnv("OPENROUTER_MACROMUTATION_MAX_OUTPUT_TOKENS", "");
  vi.stubEnv("OPENROUTER_MACROMUTATION_TIMEOUT_SECONDS", "");
  vi.stubEnv("OPENROUTER_BRIEF_MODEL", "");
  vi.stubEnv("OPENROUTER_BRIEF_MAX_OUTPUT_TOKENS", "");
  vi.stubEnv("OPENROUTER_BRIEF_TIMEOUT_SECONDS", "");
  vi.stubEnv("OPENROUTER_MAX_OUTPUT_TOKENS", "");
  vi.stubEnv("OPENROUTER_TIMEOUT_SECONDS", "");
  vi.stubEnv("DEMO_MODE", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenRouter patch generation request", () => {
  it("uses the fast coding model and throughput routing, and implements the given brief with no experiment-aware markup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "generation-test",
          model: "qwen/qwen3-coder-next",
          choices: [{ message: { content: JSON.stringify(patch) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 200, cost: 0.0002 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { generatePagePatch } = await import("@/lib/openrouter");
    await expect(
      generatePagePatch({
        parent,
        annotatedParentSource:
          '<!doctype html><html><body><a data-mut="0" href="/mutate">mutate</a></body></html>',
        clickedRegionId: 0,
        mutationStrength: 0.2,
        scopeMode: "full-optional",
        brief,
      }),
    ).resolves.toMatchObject({ model: "qwen/qwen3-coder-next", patch });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen/qwen3-coder-next");
    expect(body.max_tokens).toBe(6_000);
    expect(body).not.toHaveProperty("reasoning");
    expect(body.provider).toMatchObject({
      require_parameters: true,
      sort: "throughput",
    });
    const messages = JSON.stringify(body.messages);
    expect(messages).toContain("a tactile constellation archive");
    expect(messages).not.toMatch(/data-evolve/i);
    expect(messages).not.toMatch(/\bevolutionary\b/i);
  });
});

describe("OpenRouter macromutation directive request", () => {
  it("uses a tiny latency-routed model for a concise macromutation directive, forwarding the click signal", async () => {
    const directive =
      "Turn the archive into a tactile constellation while preserving its strongest typographic trait.";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "macromutation-test",
          model: "google/gemini-2.5-flash-lite",
          choices: [
            {
              message: { content: JSON.stringify({ directive }) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 80, completion_tokens: 24, cost: 0.00002 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { generateMacromutationDirective } = await import("@/lib/openrouter");
    await expect(
      generateMacromutationDirective({
        parent,
        click: { text: "Recipes", tag: "a" },
      }),
    ).resolves.toMatchObject({
      model: "google/gemini-2.5-flash-lite",
      macromutation: { label: "Macromutation", directive },
      usage: {
        promptTokens: 80,
        completionTokens: 24,
        costMicrousd: 20,
        costIsKnown: true,
      },
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.model).toBe("google/gemini-2.5-flash-lite");
    expect(body.max_tokens).toBe(120);
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.provider).toMatchObject({
      require_parameters: true,
      sort: "latency",
    });
    expect(JSON.stringify(body.messages)).toContain("Recipes");
  });
});

describe("OpenRouter content brief request", () => {
  it("asks a fast model for a neutral, non-meta creative brief informed by the click", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "brief-test",
          model: "google/gemini-2.5-flash-lite",
          choices: [{ message: { content: JSON.stringify(brief) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 50, completion_tokens: 60, cost: 0.00001 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { generateContentBrief } = await import("@/lib/openrouter");
    await expect(
      generateContentBrief({
        parent,
        click: { text: "Recipes", tag: "a" },
        mutationStrength: 0.5,
        scopeMode: "region-only",
      }),
    ).resolves.toMatchObject({ model: "google/gemini-2.5-flash-lite", brief });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.model).toBe("google/gemini-2.5-flash-lite");
    expect(JSON.stringify(body.messages)).toContain("Recipes");
    expect(JSON.stringify(body.messages)).not.toMatch(/\bevolutionary\b/i);
  });
});

describe("OpenRouter generation in demo mode", () => {
  it("returns a small region-scoped patch without calling the network", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { generatePagePatch } = await import("@/lib/openrouter");
    const result = await generatePagePatch({
      parent,
      annotatedParentSource:
        '<!doctype html><html><body><div data-mut="0">hi</div></body></html>',
      clickedRegionId: 0,
      mutationStrength: 0.2,
      scopeMode: "region-only",
      brief,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.patch.scope).toBe("region");
    expect(result.patch.regions).toHaveLength(1);
    expect(result.patch.regions[0]).toMatchObject({ id: 0 });
    expect(result.patch.html).toBe("");
    expect(result.patch.appendCss.length).toBeGreaterThan(0);
    expect(result.usage.costIsKnown).toBe(true);
  });

  it("returns a demo content brief without calling the network", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { generateContentBrief } = await import("@/lib/openrouter");
    const result = await generateContentBrief({
      parent,
      click: { text: "Recipes", tag: "a" },
      mutationStrength: 0.2,
      scopeMode: "region-only",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.brief.subject).toBe("Recipes");
    expect(result.usage.costIsKnown).toBe(true);
  });
});
