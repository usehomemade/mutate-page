import { describe, expect, it } from "vitest";

import {
  layoutEvolutionGraph,
  type EvolutionTreeNode,
} from "../lib/evolution-graph";

function specimen(
  id: string,
  parentId: string | null,
  depth: number,
): EvolutionTreeNode {
  return {
    id,
    parentId,
    depth,
    title: id,
    summary: id,
    createdAt: `2026-01-01T00:00:0${depth}.000Z`,
    mutationStrength: depth ? 0.4 : null,
    children: [],
  };
}

describe("layoutEvolutionGraph", () => {
  it("creates an edge for every valid parent link, including horizontal chains", () => {
    const graph = layoutEvolutionGraph([
      specimen("origin", null, 0),
      specimen("g1", "origin", 1),
      specimen("g2", "g1", 2),
      specimen("g3", "g2", 3),
      specimen("branch", "g1", 2),
      specimen("orphan", "missing", 4),
    ]);

    expect(graph.edges).toHaveLength(4);
    expect(graph.edges).toEqual(expect.arrayContaining([
      { id: "origin->g1", source: "origin", target: "g1" },
      { id: "g1->g2", source: "g1", target: "g2" },
      { id: "g2->g3", source: "g2", target: "g3" },
      { id: "g1->branch", source: "g1", target: "branch" },
    ]));
    expect(graph.positions.get("g2")?.y).toBe(graph.positions.get("g3")?.y);
  });
});
