# TanStack Start Code Execution Patterns - Audit Report

## Summary

This audit checked the codebase against TanStack Start best practices for code execution patterns. The codebase is **mostly compliant** with a few issues that have been **fixed**.

## ✅ What's Working Well

### 1. Server Functions
- **Status**: ✅ **Excellent**
- All server-only operations correctly use `createServerFn()`:
  - `uploadAvatarFromBase64`, `listPresetAvatars`, `getHuddleAvatarForName` in `src/server/avatar.ts`
  - `speakToHuddle` in `src/server/speakToHuddle.ts`
  - `requestTranscriptAnalysis` in `src/server/ai/transcriptAnalysis.ts`
  - `createRealtimeClientSecret` in `src/server/createRealtimeSession.ts`
  - `requestHuddleAutoTitle` in `src/server/generateHuddleTitle.ts`

### 2. Loader Implementation
- **Status**: ✅ **Correct**
- Loaders correctly use isomorphic queries (`queryClient.ensureQueryData`) rather than assuming server-only execution
- Example in `src/routes/huddles.$huddleSlug.tsx`:
  ```typescript
  loader: async ({ params, context: { queryClient } }) => {
    const huddle = await queryClient.ensureQueryData(
      huddleQueries.detail(params.huddleSlug),
    )
    // ...
  }
  ```

### 3. Client-Only Code
- **Status**: ✅ **Good**
- localStorage access properly guarded with `typeof window === 'undefined'` checks
- Example in `src/context/UserProfileContext.tsx`:
  ```typescript
  function readStoredProfile(): UserProfile | null {
    if (typeof window === 'undefined') {
      return null
    }
    // ... localStorage access
  }
  ```

### 4. Server Module Isolation
- **Status**: ✅ **Good**
- Uses `.server.ts` pattern correctly (`src/server/ai/transcriptAnalysis.server.ts`)
- Server files are only imported in server contexts

## 🔧 Issues Fixed

### 1. Top-Level Environment Variable Access
- **Issue**: Direct `process.env` access at module top level could expose secrets if module is accidentally imported on client
- **Files Fixed**:
  - `src/server/generateHuddleTitle.ts` - Wrapped `MODEL` constant in `createServerOnlyFn()`
  - `src/server/ai/transcriptAnalysis.server.ts` - Wrapped `DEFAULT_MODEL` constant in `createServerOnlyFn()`
- **Fix Applied**:
  ```typescript
  // ❌ Before
  const MODEL = process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini'
  
  // ✅ After
  const getModel = createServerOnlyFn(
    () => process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini',
  )
  ```

### 2. Server-Only Utility Functions
- **Issue**: Utility functions accessing `process.env` should use `createServerOnlyFn()` for explicit server-only enforcement
- **Files Fixed**:
  - `src/server/generateHuddleTitle.ts` - Wrapped `requireConvexUrl()` in `createServerOnlyFn()`
- **Fix Applied**:
  ```typescript
  // ❌ Before
  function requireConvexUrl() {
    const url = process.env.VITE_CONVEX_URL // ...
  }
  
  // ✅ After
  const requireConvexUrl = createServerOnlyFn(() => {
    const url = process.env.VITE_CONVEX_URL // ...
  })
  ```

## 📋 Remaining Considerations

### 1. Server Utility Functions (Acceptable)
The following functions access `process.env` but are only called from within server function handlers, so they're safe:
- `getOpenAIClient()` in `src/server/openaiClient.ts`
- `getR2Config()` in `src/server/avatar.ts` (internal only)
- `requireConvexUrl()` in `src/server/speakToHuddle.ts` (internal only)

**Recommendation**: These are acceptable as-is since they're only used in server contexts. For extra safety, consider wrapping them in `createServerOnlyFn()` if they're ever exported.

### 2. ClientOnly Component Usage
- **Status**: ⚠️ **Not Used**
- The codebase doesn't currently use the `ClientOnly` component from TanStack Start
- **Recommendation**: Consider using `ClientOnly` for progressive enhancement patterns where client-side features should have server fallbacks

### 3. Isomorphic Functions
- **Status**: ⚠️ **Not Used**
- No usage of `createIsomorphicFn()` for environment-aware implementations
- **Recommendation**: Consider using for utilities that need different server/client implementations (e.g., logging, storage)

## ✅ Production Checklist

- [x] **Bundle Analysis**: Server-only code properly isolated (using `createServerFn` and `createServerOnlyFn`)
- [x] **Environment Variables**: Secrets now use `createServerOnlyFn()` or are inside server function handlers
- [x] **Loader Logic**: Loaders correctly use isomorphic queries, not server-only assumptions
- [x] **ClientOnly Fallbacks**: Client-only code properly guarded with `typeof window` checks
- [x] **Error Boundaries**: Error boundaries in place (`DefaultCatchBoundary`)

## 📝 Recommendations for Future

1. **Consider `ClientOnly` for Progressive Enhancement**: Use `ClientOnly` component when adding client-side features that should degrade gracefully
2. **Consider `createIsomorphicFn` for Utilities**: For utilities that need different server/client behavior (e.g., logging, storage)
3. **Bundle Analysis**: Run bundle analysis to verify server-only code isn't in client bundle
4. **Documentation**: Document any server-only utilities that are exported to prevent accidental client usage

## Conclusion

The codebase follows TanStack Start best practices well. The main issues (top-level `process.env` access) have been fixed. The codebase correctly uses `createServerFn()` for server operations and properly guards client-only code. The fixes ensure that environment variables are never accidentally exposed to the client bundle.

