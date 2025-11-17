## TanStack Start Enhancement Plan

### Objectives
- Demonstrate full TanStack Start capabilities across SSR, streaming, and RPC patterns.
- Deepen real-time collaboration by pairing Convex reactivity with Start-first server utilities.
- Showcase modern DX (typed loaders, suspense boundaries, server functions) while keeping the Convex data model.

### Current Snapshot
- Routes rely on client suspense + Convex queries; SSR exists but does not pre-hydrate data beyond initial shell.
- `createServerFn` already powers avatar/AI utilities; most CRUD still calls Convex mutations directly from the client.
- Transcript playback works in dev mode only and does not surface streaming output to end users.

### Proposed Workstreams

#### 1. Full-Document SSR & Progressive Streaming
- Add route loaders (`Route.loader`) for `/` and `/huddles/$huddleSlug` to prefetch critical queries server-side.
- Split the huddle view into deferred segments (`defer`, `<Await>`) so transcript/history stream after the hero content.
- Emit per-route head metadata via `Route.head` for SEO + live title updates per huddle.
- Configure route-level cache/suspense settings (e.g., `staleTime`, `preloadStaleTime`) to highlight Start’s fetch policies.

#### 2. Server Functions & Typed RPC Facade
- Move composite actions (create huddle + join, join/leave flows, planning item CRUD) into `createServerFn` handlers in `src/server/huddles.ts`.
- Wrap Convex access in these server functions to centralise secrets/auth and expose typed helpers to the client.
- Surface derived stats (active speakers, action counts, AI summaries) through Start RPC instead of ad hoc client transforms.

#### 3. Streaming & Live Updates
- Extend the OpenAI simulation to a streaming server function that returns incremental reasoning/chunks (ReadableStream).
- Introduce live transcript ingestion for real audiences (Convex `transcriptChunks` subscription or SSE bridge with Start server routes).
- Layer optimistic updates + mutation rollbacks (`queryClient.setQueryData`) for planning item edits to keep the UI responsive.

#### 4. Collaboration Signals
- Expand presence: heartbeat via server function, highlight active speakers, add typing/shared selection indicators stored in Convex.
- Provide live cursors or activity toasts using Start server event endpoints that broadcast into `Huddle` via hooks.
- Add collaborative affordances (shared timers, voting, consent prompts) to demonstrate multi-user state synced through server RPCs.

#### 5. DX & Observability
- Adopt nested route error boundaries and skeleton fallbacks for each deferred segment to model idiomatic Start error handling.
- Document environment & secret requirements (Convex, R2, OpenAI) in a top-level README section plus `.env.example`.
- Add storybook-like docs (or MDX in `/docs`) walking through Start features for contributors and demo purposes.

### Milestones
1. **SSR foundation** – implement loaders, defer streaming, metadata updates, and regression tests.
2. **Server RPC layer** – introduce server functions for huddle workflows, replace direct Convex mutations.
3. **Realtime stream UX** – ship streaming transcript & AI rationale experience with optimistic updates.
4. **Collaboration polish** – presence/typing indicators, shared cursors, collaborative widgets.
5. **Polish + docs** – finalize observability, docs, and demo scripts for showcasing features.

### Validation
- Add integration tests around server functions (happy path + failure) and verify SSR hydration via Playwright snapshot.
- Use Convex dev tools + React Query Devtools to confirm cache/stale behaviour matches loader expectations.
- Document manual test checklist covering multi-user collaboration and streaming scenarios.

