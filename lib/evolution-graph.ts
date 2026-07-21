export type EvolutionTreeNode = {
  id: string;
  parentId: string | null;
  depth: number;
  title: string;
  summary: string;
  createdAt: string;
  mutationStrength: number | null;
  children: string[];
};

export type PositionedEvolutionNode = EvolutionTreeNode & {
  x: number;
  y: number;
};

export type EvolutionGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export const EVOLUTION_NODE_WIDTH = 216;
export const EVOLUTION_NODE_HEIGHT = 78;

const COLUMN_GAP = 112;
const ROW_GAP = 58;

export function layoutEvolutionGraph(nodes: EvolutionTreeNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sorted = [...nodes].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  const childrenByParent = new Map<string, string[]>();

  for (const node of sorted) {
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const childIds = childrenByParent.get(node.parentId) || [];
    childIds.push(node.id);
    childrenByParent.set(node.parentId, childIds);
  }

  const positions = new Map<string, PositionedEvolutionNode>();
  const active = new Set<string>();
  let row = 0;

  function place(id: string): number {
    const positioned = positions.get(id);
    if (positioned) return positioned.y;

    const node = byId.get(id);
    if (!node || active.has(id)) {
      const fallback = row * (EVOLUTION_NODE_HEIGHT + ROW_GAP);
      row += 1;
      return fallback;
    }

    active.add(id);
    const childIds = (childrenByParent.get(id) || []).filter(
      (childId) => !active.has(childId),
    );
    const childRows = childIds.map(place);
    const y = childRows.length
      ? (Math.min(...childRows) + Math.max(...childRows)) / 2
      : row++ * (EVOLUTION_NODE_HEIGHT + ROW_GAP);

    positions.set(id, {
      ...node,
      x: node.depth * (EVOLUTION_NODE_WIDTH + COLUMN_GAP),
      y,
    });
    active.delete(id);
    return y;
  }

  const roots = sorted.filter(
    (node) => !node.parentId || !byId.has(node.parentId),
  );
  for (const root of roots) place(root.id);
  for (const node of sorted) {
    if (!positions.has(node.id)) place(node.id);
  }

  const positionedNodes = sorted
    .map((node) => positions.get(node.id))
    .filter((node): node is PositionedEvolutionNode => Boolean(node));
  const edges: EvolutionGraphEdge[] = positionedNodes.flatMap((node) =>
    node.parentId && byId.has(node.parentId)
      ? [{
          id: `${node.parentId}->${node.id}`,
          source: node.parentId,
          target: node.id,
        }]
      : [],
  );

  return {
    nodes: positionedNodes,
    edges,
    positions,
  };
}
