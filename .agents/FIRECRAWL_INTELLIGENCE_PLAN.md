# Firecrawl Intelligence Plan

This document outlines the implementation approach for augmenting Huddle with on-demand web research powered by the Firecrawl API whenever participants request external information during a conversation.

## 1. Goals & Guardrails

1. [ ] Detect explicit research requests (e.g. “can someone look up…”) without misfiring on casual mentions.
2. [ ] Fetch concise, trustworthy summaries plus source links from Firecrawl within a few seconds.
3. [ ] Surface the findings inside the active huddle in a structured, reviewable format.

## 2. End-to-End Flow Overview

1. [ ] Transcript chunk enters interpretation pipeline (voice, text, or simulation).
2. [ ] Natural language classifier tags chunk as `research_request` with extracted query.
3. [ ] Server enqueues a durable job (`requestFirecrawlResearch`) keyed by `huddleId` + `itemKey`.
4. [ ] Job calls Firecrawl REST API with query + context metadata.
5. [ ] Normalized response becomes Convex documents (summary card + source list).
6. [ ] Clients subscribed through `huddleQueries.detail` render “Research Result” items in-line.
7. [ ] Users can acknowledge, pin, or discard results; actions write back via Convex mutations.

## 3. Trigger Detection Responsibilities

- **Interpretation hook**: Extend `requestDevSimulationFromOpenAI` schema (and prod interpreter) with an optional `researchRequests` array carrying `{ itemKey, queryText, sourceChunkId }`.
- **Rate controls**: Clamp simultaneous research requests per huddle and require explicit mention (e.g. “research”, “look up”, “find stats”).
- **User confirmation (optional)**: Consider UI affordance to confirm before firing costly lookups in early iterations.

## 4. Firecrawl API Integration

- **Server function**: Create TanStack Start action `fetchFirecrawlIntel` that:
  - Validates payload with Zod (`huddleId`, `itemKey`, `queryText`, optional `contextSummary`).
  - Signs outbound request using `FIRECRAWL_API_KEY`.
  - Retries with exponential backoff on 429/5xx (respect Firecrawl rate limits).
- **Convex mutation**: `logResearchResult` writes:
  - `planningItems` entry (`type: 'idea'` or new `research` subtype?), plus metadata `{ research: true, sources: ResearchSource[] }`.
  - Optional secondary table (`researchResults`) if more structure required (decide during schema spike).
- **Caching**: Store hashed query results in Convex to short-circuit duplicate requests inside same huddle.

## 5. Client Experience & UI Surfacing

- **Transcript Pane**: Inline status chip (“Researching…” → “Research Added”) attached to originating chunk.
- **Planning Board**: Dedicated “Research” section or badge on existing cards for easy discovery.
- **Details Drawer**: Modal or side panel showing Firecrawl summary paragraphs, bullet insights, and source URLs.
- **Actions**: Allow participants to mark result as decision/task, copy summary, or dismiss (with audit trail).
- **Accessibility**: Ensure summaries are plain text, links open in new tab, and status changes are announced to screen readers.

## 6. Observability & Error Handling

- Log Firecrawl latency, status codes, and truncated responses (without leaking API keys).
- Surface non-blocking toast + transcript annotation when API fails; allow manual retry.
- Add Convex field `metadata.firecrawlJobId` for traceability between request and result.
- Instrument success/failure counters for later tuning.

## 7. Testing & Simulation Strategy

- **Unit**: Classifier heuristics, Firecrawl client wrapper (mock responses), Convex mutations.
- **Integration**: Simulate transcript flow end-to-end with stubbed Firecrawl API.
- **Simulation mode**: Provide deterministic canned responses in `src/dev/openaiSimulation.ts` so CI and demos run offline.
- **Manual**: Verify UI across desktop/mobile, ensure duplicate suppression, confirm rate limiting.

## 8. Environment & Configuration

- `FIRECRAWL_API_KEY` (TanStack Start + Convex env).
- `FIRECRAWL_BASE_URL` (allow override for staging/mocks).
- Feature flag (`HUDDLE_ENABLE_FIRECRAWL`) to gate rollout per environment.

---

Next steps: validate data modeling choice (reuse `planningItems` vs new `researchResults` table), align on classifier approach, and sketch UI mocks before implementing server integrations.

