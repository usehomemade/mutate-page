"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TreeNode = {
  id: string;
  parentId: string | null;
  depth: number;
  title: string;
  summary: string;
  createdAt: string;
  mutationStrength: number | null;
  children: string[];
};

type Revision = Omit<TreeNode, "children">;

type Props = {
  world: { id: string; slug: string; name: string };
  revision: Revision;
  tree: TreeNode[];
  lineage: TreeNode[];
  isWorldTip: boolean;
};

function shortId(id: string) {
  return id === "primordial" ? "origin" : id.slice(0, 7);
}

function mutationLabel(strength: number | null) {
  if (strength === null) return "primordial";
  if (strength < 0.2) return "subtle drift";
  if (strength < 0.5) return "mutation";
  return "wild mutation";
}

export function WorldClient({ world, revision, tree, lineage, isWorldTip }: Props) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionLabel, setSelectionLabel] = useState<string | null>(null);

  const byParent = useMemo(() => {
    const result = new Map<string | null, TreeNode[]>();
    for (const node of tree) {
      const siblings = result.get(node.parentId) || [];
      siblings.push(node);
      result.set(node.parentId, siblings);
    }
    return result;
  }, [tree]);

  const mutate = useCallback(
    async (actionId: string | null, label?: string) => {
      if (isMutating) return;
      setIsMutating(true);
      setError(null);
      setSelectionLabel(label || null);

      try {
        const response = await fetch("/api/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentRevisionId: revision.id,
            actionId,
          }),
        });
        const data = (await response.json()) as {
          revisionId?: string;
          worldSlug?: string;
          error?: { message?: string };
        };

        if (!response.ok || !data.revisionId) {
          throw new Error(data.error?.message || "The mutation failed.");
        }

        router.push(`/w/${data.worldSlug || world.slug}/r/${data.revisionId}`);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The mutation failed.");
        setIsMutating(false);
        setSelectionLabel(null);
      }
    },
    [isMutating, revision.id, router, world.slug],
  );

  useEffect(() => {
    function receiveEvolutionaryAction(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const payload = event.data as unknown;
      if (!payload || typeof payload !== "object") return;

      const message = payload as {
        type?: unknown;
        revisionId?: unknown;
        actionId?: unknown;
        label?: unknown;
      };
      if (
        message.type !== "mutate-page:evolve" ||
        message.revisionId !== revision.id ||
        typeof message.actionId !== "string"
      ) {
        return;
      }

      void mutate(
        message.actionId,
        typeof message.label === "string" ? message.label : "selected link",
      );
    }

    window.addEventListener("message", receiveEvolutionaryAction);
    return () => window.removeEventListener("message", receiveEvolutionaryAction);
  }, [mutate, revision.id]);

  function renderBranch(parentId: string | null, level = 0): React.ReactNode {
    return (byParent.get(parentId) || []).map((node) => (
      <li key={node.id}>
        <Link
          className={node.id === revision.id ? "tree-node current" : "tree-node"}
          href={`/w/${world.slug}/r/${node.id}`}
          style={{ paddingLeft: `${0.75 + level * 1.05}rem` }}
          onClick={() => setTreeOpen(false)}
        >
          <span className="tree-joint" aria-hidden="true">{level ? "└" : "●"}</span>
          <span>
            <strong>{node.title}</strong>
            <small>gen {node.depth} · {shortId(node.id)}</small>
          </span>
          {node.children.length > 1 && <em>{node.children.length} branches</em>}
        </Link>
        {node.children.length > 0 && (
          <ol>{renderBranch(node.id, level + 1)}</ol>
        )}
      </li>
    ));
  }

  return (
    <main className="world-shell">
      <header className="world-header">
        <Link className="brand" href="/" aria-label="Mutate Page — current revision">
          <Image src="/mark.svg" alt="" width="24" height="24" priority />
          <span>mutate.page</span>
        </Link>
        <div className="specimen-title" title={revision.summary}>
          <span>{revision.title}</span>
          <small>
            generation {revision.depth} · {mutationLabel(revision.mutationStrength)}
            {!isWorldTip && " · historical branch"}
          </small>
        </div>
        <div className="header-actions">
          <button className="quiet-button" onClick={() => setTreeOpen(true)}>
            Tree <span>{tree.length}</span>
          </button>
          <Link className="quiet-button admin-link" href="/admin">Admin</Link>
        </div>
      </header>

      <section className="specimen-stage" aria-busy={isMutating}>
        {!frameLoaded && <div className="frame-placeholder"><div className="loading-cell" /></div>}
        <iframe
          ref={frameRef}
          key={revision.id}
          className={frameLoaded ? "specimen-frame loaded" : "specimen-frame"}
          src={`/api/revisions/${encodeURIComponent(revision.id)}/document`}
          title={`Generated page: ${revision.title}`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => setFrameLoaded(true)}
        />

        {isMutating && (
          <div className="mutation-veil" role="status" aria-live="polite">
            <div className="mutation-orbit"><span /><span /><span /></div>
            <strong>Mutating generation {revision.depth + 1}</strong>
            <p>
              {selectionLabel
                ? `Applying selection pressure: “${selectionLabel}”`
                : "Letting a small random trait drift…"}
            </p>
            <small>The model is writing and preserving a new immutable specimen.</small>
          </div>
        )}

        {error && (
          <div className="mutation-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        <button
          className="mutate-button"
          disabled={isMutating}
          onClick={() => void mutate(null)}
        >
          <span className="mutate-glyph" aria-hidden="true">✣</span>
          {isMutating ? "mutating" : "mutate"}
        </button>
      </section>

      <nav className="timeline-shell" aria-label="Ancestral timeline">
        <div className="timeline-label">
          <span>lineage</span>
          <small>{lineage.length} specimen{lineage.length === 1 ? "" : "s"}</small>
        </div>
        <div className="timeline" tabIndex={0}>
          {lineage.map((node, index) => (
            <Link
              key={node.id}
              href={`/w/${world.slug}/r/${node.id}`}
              className={node.id === revision.id ? "timeline-node current" : "timeline-node"}
              aria-current={node.id === revision.id ? "page" : undefined}
              title={node.summary}
            >
              <span className="timeline-index">{String(index).padStart(2, "0")}</span>
              <span>
                <strong>{node.title}</strong>
                <small>{shortId(node.id)}</small>
              </span>
              {node.children.length > 1 && <em>fork ×{node.children.length}</em>}
            </Link>
          ))}
        </div>
        <button className="tree-button" onClick={() => setTreeOpen(true)} aria-label="Open full evolution tree">
          <span aria-hidden="true">⑂</span>
          full tree
        </button>
      </nav>

      {treeOpen && (
        <div className="tree-backdrop" role="presentation" onMouseDown={() => setTreeOpen(false)}>
          <aside
            className="tree-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tree-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="tree-panel-header">
              <div>
                <p className="eyebrow">shared world</p>
                <h2 id="tree-heading">Evolution tree</h2>
              </div>
              <button onClick={() => setTreeOpen(false)} aria-label="Close tree">×</button>
            </div>
            <p className="tree-intro">
              Every mutation is permanent. Mutating while viewing an ancestor grows a new branch.
            </p>
            <ol className="tree-list">{renderBranch(null)}</ol>
          </aside>
        </div>
      )}
    </main>
  );
}
