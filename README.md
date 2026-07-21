# Mutate Page

One public web page that evolves forever.

Clicking a link or control inside the current page asks an OpenRouter model to make a child of it. A model-generated evolutionary link (marked `data-evolve`) adds selection pressure (for example, “cats” or “play a cat game”); any other in-page link drifts randomly. Evolving an old revision creates a branch instead of rewriting history.

The stable application chrome is Next.js. Each generated specimen is standalone HTML with inline CSS and optional vanilla JavaScript, rendered in an opaque-origin sandbox. This is deliberate: raw web primitives give the model much more visual range than a fixed React component or Tailwind vocabulary, and make every revision easy to preserve as one immutable artifact.

## What is included

- One shared world with a fixed primordial root
- Branching revision tree and horizontally scrollable ancestry
- OpenRouter structured-output generation with configurable model and temperature
- Inline CSS/JavaScript specimens with no external network access
- Immutable `source.html`, sandboxed `page.html`, manifest, and generation metadata for every successful revision
- Cloudflare R2 storage in production and a local filesystem adapter in development
- SQLite metadata, jobs, costs, lineage, and evolutionary actions
- Atomic daily budget reservations, per-visitor quotas, cooldowns, and a concurrency cap
- HTTP Basic-protected `/admin` dashboard for daily spend, pages, failures, model/runtime details, and recent jobs
- Standalone Docker image, health endpoint, and Coolify-ready persistent data path

## How a mutation works

```text
browser on revision A
       │  click a link / [data-evolve] inside the page
       ▼
POST /api/mutate ── atomic budget/quota reservation in SQLite
       │
       ▼
OpenRouter receives A's source + DNA + mutation strength
       │  strict JSON schema: HTML, actions, DNA, mutation notes
       ▼
sanitize + validate + sandbox bridge + CSP
       │
       ├── R2: source.html / page.html / manifest.json / generation.json
       └── SQLite: ready revision B, action index, usage/cost, A → B edge
```

Generated content never runs in the trusted application origin. The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`; both its response and its document set a restrictive CSP. The only accepted message from a specimen is a revision-bound evolutionary action whose ID is already indexed in SQLite.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
cp .env.example .env
```

For a no-cost end-to-end run, set these values in `.env`:

```dotenv
DEMO_MODE=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-local-password
```

Then start the app:

```bash
npm run dev
```

Open <http://localhost:3000>. Local snapshots and SQLite data are written beneath `./data`. Open <http://localhost:3000/admin> and enter the Basic Auth credentials to view telemetry.

To use a real model, set `DEMO_MODE=false`, add `OPENROUTER_API_KEY`, and choose a model that supports structured outputs. The default is `xiaomi/mimo-v2.5`.

## Budget behavior

`DAILY_OPENROUTER_BUDGET_USD` is enforced before a generation starts. Each active request atomically reserves `OPENROUTER_COST_RESERVATION_USD`; completed jobs replace that reservation with the cost reported by OpenRouter. New work is rejected when committed daily usage would cross the cap.

Set the reservation at or above the largest plausible cost of one request for your chosen model and token ceiling. That makes the daily guard conservative. Also set a spending limit on the dedicated OpenRouter API key as an account-side backstop.

The public endpoint additionally enforces:

- `MAX_CONCURRENT_GENERATIONS`
- `MUTATION_STALE_AFTER_SECONDS` (reclaims interrupted jobs conservatively)
- `VISITOR_DAILY_MUTATION_LIMIT` (HMAC of proxy IP plus user agent; raw addresses are not stored)
- `MUTATION_COOLDOWN_SECONDS`

All budget days reset at 00:00 UTC. Monetary values are stored as integer millionths of a US dollar to avoid floating-point accounting errors.

## Cloudflare R2

Create a private R2 bucket and an API token scoped to that bucket, then set all four values:

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

The browser does not access R2 directly, so bucket CORS rules and a public bucket URL are unnecessary. If all four values are blank, the app intentionally falls back to `LOCAL_OBJECT_STORAGE_PATH`.

## Deploying on Coolify

1. Push this repository to your Git provider and create a new **Dockerfile** application in Coolify.
2. Expose container port `3000` and set the health check path to `/api/health`.
3. Add a persistent storage volume mounted at `/app/data`. SQLite lives at `/app/data/mutate.sqlite` in the production image.
4. Add the variables from `.env.example`, including an `APP_SECRET` of at least 32 random characters, admin password of at least 12 characters, OpenRouter key, budget, and all R2 credentials.
5. Attach a domain, enable HTTPS, and deploy.

Run exactly **one application replica** while SQLite is the metadata store. R2 snapshots are durable, but the SQLite volume still contains the tree, budget ledger, and action index; include `/app/data` in your VPS backup routine. Horizontal scaling later should move metadata and job coordination to Postgres.

Useful production variables:

```dotenv
APP_URL=https://your-domain.example
APP_SECRET=a-long-random-value
DATABASE_PATH=/app/data/mutate.sqlite
DEMO_MODE=false
ADMIN_USERNAME=your-private-name
ADMIN_PASSWORD=a-long-random-password
```

The Docker image runs as an unprivileged user and Next.js standalone output. `docker compose up --build` provides a production-like local check using the same persistent `/app/data` mount.

## Security boundaries

Generated HTML is hostile input even when it came from a model. Keep all of these layers intact:

- iframe sandbox without `allow-same-origin`, forms, navigation, popups, or downloads
- response and in-document CSP with scripts/styles limited to inline content and all network connections disabled
- sanitizer removal of external scripts/styles, embedded documents, refresh directives, and base URLs
- schema validation, byte limits, action-ID matching, and parent-communication checks
- parent-side validation of `postMessage` source, revision ID, and server-indexed action ID
- server-side quotas and an atomic spend reservation before every model call

This prevents generated code from being trusted application code; it does not make model-generated prose inherently accurate or appropriate. If the project becomes broadly public, add moderation, abuse monitoring, and a report mechanism.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

`DEMO_MODE=true` exercises the real database, branching, storage, sanitizer, iframe, and admin paths without spending OpenRouter credit.

## Natural next extension: paid mutations

Do not make payment webhooks call the generator directly. Add authenticated visitor accounts or signed mutation credits, a payment ledger with idempotent webhook events, and a durable mutation queue. A successful `$5` contribution can mint a defined number of credits while the same global budget and per-job reservation remain authoritative. The current `mutation_jobs` boundary is designed to be replaced by that queue without changing revision artifacts or the evolution tree.
