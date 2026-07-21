"use client";

import { Database } from "@phosphor-icons/react";
import { Empty } from "@cloudflare/kumo";

/**
 * Small client-boundary wrapper around Kumo's `Empty` state for the admin
 * mutation log table. Phosphor icon modules call `React.createContext` at
 * module scope without a "use client" pragma, which breaks when imported
 * directly into a server component (RSC's React build doesn't expose
 * `createContext` the same way). Isolating the icon import here keeps
 * `app/admin/page.tsx` a plain server component.
 */
export function AdminEmptyState() {
  return <Empty size="sm" icon={<Database size={32} />} title="No mutations yet." />;
}
