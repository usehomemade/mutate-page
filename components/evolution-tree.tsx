"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
  type OnInit,
} from "@xyflow/react";
import { Waypoints, X } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { Button } from "@cloudflare/kumo";
import { Dialog } from "@cloudflare/kumo/primitives/dialog";
import {
  EVOLUTION_NODE_HEIGHT,
  EVOLUTION_NODE_WIDTH,
  layoutEvolutionGraph,
  type EvolutionTreeNode,
} from "@/lib/evolution-graph";
import { cn } from "@/lib/utils";

export type { EvolutionTreeNode } from "@/lib/evolution-graph";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRevisionId: string;
  nodes: EvolutionTreeNode[];
  onSelect: (node: EvolutionTreeNode, instant?: boolean) => void;
};

type EvolutionNodeData = Record<string, unknown> & {
  revision: EvolutionTreeNode;
  isCurrent: boolean;
  onSelect: Props["onSelect"];
};

type EvolutionFlowNode = Node<EvolutionNodeData, "specimen">;
type EvolutionFlowEdge = Edge;

const DEFAULT_VIEWPORT = { x: 80, y: 80, zoom: 0.8 };
const TREE_EDGE_STYLE = { stroke: "#c2c5b8", strokeWidth: 1.4 };
const FIT_VIEW_OPTIONS = {
  padding: 0.16,
  minZoom: 0.18,
  maxZoom: 1,
  duration: 0,
};

const EvolutionSpecimen = memo(function EvolutionSpecimen({
  data,
}: NodeProps<EvolutionFlowNode>) {
  const { revision, isCurrent, onSelect } = data;

  return (
    <div className="relative h-full w-full">
      <Handle
        id="target"
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <button
        type="button"
        className={cn(
          "nodrag nopan flex h-full w-full items-center gap-2.5 rounded-lg ring ring-kumo-line bg-kumo-elevated px-3 py-2.5 text-left shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg",
          isCurrent && "ring-2 ring-kumo-focus",
        )}
        onClick={(event) => {
          // Mouse clicks are handled by ReactFlow's onNodeClick (which also
          // restores pointer-events on the node wrapper). Keyboard activation
          // synthesizes a click with detail === 0, so only handle that here to
          // avoid firing onSelect twice for a pointer click.
          if (event.detail === 0) onSelect(revision, true);
        }}
        aria-current={isCurrent ? "page" : undefined}
        title={revision.summary}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md bg-kumo-fill font-mono text-[0.62rem] text-kumo-subtle",
            isCurrent && "bg-kumo-brand text-kumo-inverse",
          )}
        >
          g{revision.depth}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-kumo-default">
            {revision.title}
          </span>
          <span className="block truncate text-[0.65rem] text-kumo-subtle">
            {revision.summary}
          </span>
        </span>
      </button>
      <Handle
        id="source"
        type="source"
        position={Position.Right}
        isConnectable={false}
      />
    </div>
  );
});

const EVOLUTION_NODE_TYPES = { specimen: EvolutionSpecimen };

function TreeScaleReadout() {
  const zoom = useStore((state) => state.transform[2]);

  return (
    <Panel
      position="bottom-left"
      className="rounded-full border border-kumo-line bg-kumo-overlay/80 px-2.5 py-1 font-mono text-[0.6rem] text-kumo-subtle"
      aria-hidden="true"
    >
      {Math.round(zoom * 100)}%
    </Panel>
  );
}

export function EvolutionTree({
  open,
  onOpenChange,
  currentRevisionId,
  nodes,
  onSelect,
}: Props) {
  const layout = useMemo(() => layoutEvolutionGraph(nodes), [nodes]);
  const flowNodes = useMemo<EvolutionFlowNode[]>(
    () => layout.nodes.map((node) => ({
      id: node.id,
      type: "specimen",
      position: { x: node.x, y: node.y },
      data: {
        revision: node,
        isCurrent: node.id === currentRevisionId,
        onSelect,
      },
      style: {
        width: EVOLUTION_NODE_WIDTH,
        height: EVOLUTION_NODE_HEIGHT,
      },
      draggable: false,
      selectable: false,
      focusable: false,
    })),
    [currentRevisionId, layout.nodes, onSelect],
  );
  const flowEdges = useMemo<EvolutionFlowEdge[]>(
    () => layout.edges.map((edge) => ({
      ...edge,
      sourceHandle: "source",
      targetHandle: "target",
      animated: false,
      selectable: false,
      focusable: false,
      style: TREE_EDGE_STYLE,
    })),
    [layout.edges],
  );
  const focusNode = layout.positions.get(currentRevisionId) || layout.nodes[0];
  const focusCurrent = useCallback<OnInit<EvolutionFlowNode, EvolutionFlowEdge>>(
    (instance) => {
      if (!focusNode) return;
      const zoom = window.matchMedia("(max-width: 760px)").matches ? 0.72 : 0.82;
      void instance.setCenter(
        focusNode.x + EVOLUTION_NODE_WIDTH / 2,
        focusNode.y + EVOLUTION_NODE_HEIGHT / 2,
        { zoom, duration: 0 },
      );
    },
    [focusNode],
  );
  const mutationCount = Math.max(0, nodes.length - 1);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-kumo-overlay/30 backdrop-blur-sm" />
        <Dialog.Popup
          aria-label="Evolution map"
          className="fixed inset-0 z-50 flex flex-col bg-kumo-base outline-none"
        >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-kumo-line bg-kumo-base/80 px-3 backdrop-blur sm:h-16 sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-kumo-line bg-kumo-elevated text-kumo-brand">
            <Waypoints className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="truncate text-sm font-semibold text-kumo-default">
              Evolution map
            </Dialog.Title>
            <Dialog.Description className="truncate text-xs text-kumo-subtle">
              {mutationCount} mutations · drag to travel · scroll to zoom · select a specimen to jump
            </Dialog.Description>
          </div>
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                variant="ghost"
                shape="square"
                icon={<X aria-hidden="true" />}
                aria-label="Close evolution map"
              />
            )}
          />
        </div>

        <div className="relative min-h-0 flex-1 bg-kumo-base">
          <ReactFlow<EvolutionFlowNode, EvolutionFlowEdge>
            className="mapnode-flow h-full w-full"
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={EVOLUTION_NODE_TYPES}
            onNodeClick={(_, node) => onSelect(node.data.revision)}
            onInit={focusCurrent}
            defaultViewport={DEFAULT_VIEWPORT}
            minZoom={0.18}
            maxZoom={2.4}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            edgesReconnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            preventScrolling
            deleteKeyCode={null}
            attributionPosition="bottom-center"
            colorMode="light"
            aria-label="Pan and zoom map of every evolutionary branch"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="rgba(0, 0, 0, 0.10)"
            />
            <Controls
              position="bottom-right"
              orientation="horizontal"
              showInteractive={false}
              fitViewOptions={FIT_VIEW_OPTIONS}
            />
            <TreeScaleReadout />
          </ReactFlow>
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
