# Huddle Presence Migration Plan

## Summary
- Replace the bespoke heartbeat-based presence tracker in `Huddle.tsx` with Convex’s `@convex-dev/presence` component and the `usePresence` hook.
- Preserve the existing user experience: live participant lists, speaking/recording indicators, and join/leave toasts.
- Reduce brittle polling logic (`PRESENCE_HEARTBEAT_INTERVAL_MS`, `useUpsertPresenceMutation`) and lean on Convex-managed sessions with automatic cleanup.

## Current State
- Presence rows live in the `presence` table defined in `convex/schema.ts`; mutations like `api.huddle.upsertPresence` keep them fresh.
- The React layer drives updates via a manual `setInterval` heartbeat (`presenceHeartbeatTick`) inside `src/components/Huddle.tsx`.
- Speaking/recording badges read from `huddle.presence` that comes back with the main `huddleQueries.detail` query.
- Observed problems: missed heartbeats when the tab is throttled, duplicate entries when reconnecting, and the legacy code path is hard to extend (the heartbeat logic was previously disabled because it was unreliable).

## Reference: Convex Presence Component
- Documentation: https://www.convex.dev/components/presence
- Key server steps from the docs:
  - Add `@convex-dev/presence` to `dependencies`.
  - Register the component in `convex/convex.config.ts`:
    ```ts
    import { defineApp } from "convex/server";
    import presence from "@convex-dev/presence/convex.config";

    const app = defineApp();
    app.use(presence);
    export default app;
    ```
  - Expose handlers in `convex/presence.ts`:
    ```ts
    import { Presence } from "@convex-dev/presence";
    import { components } from "./_generated/api";
    import { mutation, query } from "./_generated/server";
    import { v } from "convex/values";

    const presence = new Presence(components.presence);

    export const heartbeat = mutation({
      args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
      handler: async (ctx, args) => presence.heartbeat(ctx, args.roomId, args.userId, args.sessionId, args.interval),
    });

    export const list = query({
      args: { roomToken: v.string() },
      handler: async (ctx, args) => presence.list(ctx, args.roomToken),
    });

    export const disconnect = mutation({
      args: { sessionToken: v.string() },
      handler: async (ctx, args) => presence.disconnect(ctx, args.sessionToken),
    });
    ```
  - Client integration uses `usePresence(api.presence, roomId, metadata)` from `@convex-dev/presence/react`.

## Target Architecture
- **Room model**: Treat each huddle as a presence “room” keyed by `huddle._id` (canonical) plus optional slug alias for read-only viewers.
- **Metadata**: Store the fields we currently track (`displayName`, `role`, `avatarUrl`, `isRecording`, `isSpeaking`) inside the `metadata` payload that accompanies the presence session. Convex presence persists arbitrary JSON per session.
- **Backend APIs**:
  - Keep `api.huddle.getHuddle` but drop the `presence` array once the UI reads presence from the dedicated listener. Add a transitional flag to allow both sources during rollout.
  - Replace `upsertPresence` and `clearPresence` with thin wrappers around `presence.heartbeat`/`presence.disconnect`; retire the bespoke table after migration.
  - Migrate stale-presence cleanup logic (`convex/huddle.ts` lines ~415) to call `presence.cleanup` if exposed, or delete the cron entirely once Convex presence manages expiration.
- **Client hooks**:
  - Introduce a dedicated `useHuddlePresence(huddleId, profile, options)` hook that calls `usePresence(api.presence, roomId, metadata)` and returns normalized data structures (`speakingUserIds`, `recordingUserIds`, sorted participants).
  - Replace `presenceHeartbeatTick` effect with the new hook. Metadata updates (e.g., toggling `isRecording`) should call the hook’s setter rather than manual mutations.
  - Leverage the hook’s `sessionToken` to run `navigator.sendBeacon` on unload via `presence.disconnect` for graceful exits.
- **UI adaptations**:
  - Update `ParticipantsPanel` props to accept live presence data rather than deriving from `huddle.presence`.
  - Keep “join/leave” toasts by diffing successive `usePresence` results instead of `huddle.participants`.

## Migration Plan
1. **Bootstrap presence component**
   - Install dependency, register it in `convex.config.ts`, and add `convex/presence.ts`.
   - Generate types (`npx convex dev`) and confirm `api.presence` namespace exists.
2. **Introduce new server endpoints**
   - Create `presenceHeartbeat` action that wraps `presence.heartbeat` while enforcing huddle membership (reuse `ensureHuddleById` and participant checks).
   - Provide `presenceList` query returning presence sessions plus minimal participant profile data (`userId`, `metadata`).
3. **Client-side hook scaffolding**
   - Implement `useHuddlePresence` using `usePresence` (handles joining/metadata updates, detect when user leaves).
   - Initially run in “shadow mode”: use hook only for diagnostics (log mismatches compared to `huddle.presence`), leave UI unchanged.
4. **Switch read-path**
   - Update `Huddle.tsx` to consume `useHuddlePresence` and derive `speakingUserIds`/`recordingUserIds`, falling back to query data if hook is unavailable.
   - Remove manual heartbeat interval and `useUpsertPresenceMutation` once parity confirmed.
5. **Clean up legacy code**
   - Drop `useClearPresenceMutation`, backend `upsertPresence`/`clearPresence` mutations, and the `presence` table schema once unused (keep a migration script to wipe it).
   - Remove cron cleanup logic if redundant.
6. **QA & rollout**
   - Test multiple tabs and background throttling cases.
   - Validate sendBeacon disconnect path on browser close.
   - Verify observer auto-registration still works with new metadata flow.

## Data & Auth Considerations
- Presence metadata must be sanitized to avoid leaking sensitive info (store only display name, avatar URL, role flags).
- Add auth checks in heartbeat mutation to ensure only joined users can send presence updates.
- Ensure observers and participants receive different metadata defaults (e.g., observers should not mark `isRecording`).

## Testing & Observability
- Add Vitest coverage for `useHuddlePresence` (mocking `usePresence`).
- Instrument logging around presence joins/leaves to confirm migration.
- Manually test degraded network scenarios and tab suspension to confirm Convex presence automatically expires sessions.

## Risks & Open Questions
- Need to confirm whether existing `presence` table can be safely dropped or if other features depend on it (search for `presence` usage outside `Huddle.tsx`).
- Determine how speaking detection toggles `isSpeaking`—today it likely uses other effects; we must thread those updates through the new hook.
- Verify Convex presence session limits and cost implications for long-running huddles.
- Decide on backwards compatibility during migration (feature flag or staged rollout).