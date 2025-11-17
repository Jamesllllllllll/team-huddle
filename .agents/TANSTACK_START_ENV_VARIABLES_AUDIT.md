# TanStack Start Environment Variables - Audit Report

## Summary

This audit checked the codebase against TanStack Start best practices for environment variable usage. The codebase is **mostly compliant** with a few issues that have been **fixed**.

## ✅ What's Working Well

### 1. Server Functions Using `process.env`
- **Status**: ✅ **Correct**
- All server functions correctly use `process.env` for server-only variables:
  - `OPENAI_API_KEY` in `src/server/openaiClient.ts`
  - `CLOUDFLARE_R2_*` variables in `src/server/avatar.ts`
  - `OPENAI_RESPONSES_MODEL` in server functions
  - All secrets are properly server-only

### 2. Client Code Using `import.meta.env`
- **Status**: ✅ **Good**
- Client components correctly use `import.meta.env`:
  - `import.meta.env.DEV` for development checks
  - `import.meta.env.VITE_CONVEX_URL` in router (isomorphic code)
  - Proper use of Vite's built-in environment variables

### 3. Router Configuration
- **Status**: ✅ **Correct**
- Router uses `import.meta.env` correctly for isomorphic code that runs on both server and client:
  ```typescript
  const env = (import.meta as any).env
  const CONVEX_URL = env.PROD
    ? env.VITE_CONVEX_URL
    : env.VITE_DEV_CONVEX_URL ?? env.VITE_CONVEX_URL
  ```

## 🔧 Issues Fixed

### 1. Client Component Using `process.env`
- **Issue**: Client component was using `process.env.NODE_ENV` which is not available in client code
- **File Fixed**: `src/components/huddle/TranscriptCard.tsx`
- **Fix Applied**:
  ```typescript
  // ❌ Before
  {lastRecordingDuration && process.env.NODE_ENV !== 'development' ? (
  
  // ✅ After
  {lastRecordingDuration && !import.meta.env.DEV ? (
  ```

### 2. Missing Type Definitions
- **Issue**: No TypeScript type definitions for environment variables
- **File Created**: `src/env.d.ts`
- **Fix Applied**: Added comprehensive type definitions for:
  - Client-side variables (`ImportMetaEnv`)
  - Server-side variables (`NodeJS.ProcessEnv`)
  - Built-in Vite variables (`DEV`, `PROD`, `MODE`)

### 3. Missing Environment Variable Validation
- **Issue**: No runtime validation for required environment variables
- **File Created**: `src/config/env.ts`
- **Fix Applied**: Added utility functions for:
  - `requireServerEnv()` - Validate required server variables
  - `requireClientEnv()` - Validate required client variables
  - `validateServerEnv()` - Batch validation for server variables
  - `validateClientEnv()` - Batch validation for client variables

## 📋 Current Environment Variable Usage

### Server-Only Variables (No Prefix)
These are correctly used in server functions only:

- `OPENAI_API_KEY` - OpenAI API key (secret)
- `OPENAI_RESPONSES_MODEL` - Model for AI responses
- `OPENAI_TRANSCRIPTION_MODEL` - Model for transcription
- `OPENAI_REALTIME_MODEL` - Model for realtime features
- `OPENAI_REALTIME_INSTRUCTIONS` - Instructions for realtime
- `OPENAI_REALTIME_VOICE` - Voice for realtime
- `REALTIME_CLIENT_SECRET_TTL_SECONDS` - TTL for secrets
- `CLOUDFLARE_R2_ACCOUNT_ID` - R2 account ID (secret)
- `CLOUDFLARE_R2_ACCESS_KEY_ID` - R2 access key (secret)
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` - R2 secret key (secret)
- `CLOUDFLARE_R2_BUCKET` - R2 bucket name
- `CLOUDFLARE_R2_PUBLIC_URL` - R2 public URL base
- `CONVEX_SITE_URL` - Convex site URL (for Convex functions)
- `HUDDLE_ALLOW_DEV_RESET` - Security flag for dev operations
- `NODE_ENV` - Node environment

### Client-Safe Variables (VITE_ Prefix)
These are correctly used in client code:

- `VITE_CONVEX_URL` - Convex URL for production
- `VITE_DEV_CONVEX_URL` - Convex URL for development

### Built-in Vite Variables
These are automatically available:

- `import.meta.env.DEV` - Development mode flag
- `import.meta.env.PROD` - Production mode flag
- `import.meta.env.MODE` - Current mode string

## ⚠️ Considerations

### 1. Server Functions Using VITE_ Prefixed Variables
- **Status**: ⚠️ **Acceptable but could be improved**
- **Location**: `src/server/generateHuddleTitle.ts`, `src/server/speakToHuddle.ts`
- **Current Usage**: Server functions access `process.env.VITE_CONVEX_URL` and `process.env.VITE_DEV_CONVEX_URL`
- **Analysis**: This works because:
  - `VITE_` prefixed variables are available in both server and client contexts
  - Convex URLs are public (not secrets)
  - Server functions can access both `process.env` and `import.meta.env`
- **Recommendation**: This is acceptable since Convex URLs are public. However, for clarity, consider:
  - Using non-prefixed variables (`CONVEX_URL`, `CONVEX_DEV_URL`) for server-only access
  - Keeping `VITE_` prefixed versions for client access
  - This would require updating environment variable names in deployment configs

### 2. No Environment Variable Validation at Startup
- **Status**: ⚠️ **Recommendation**
- **Current State**: Environment variables are validated when first accessed (lazy validation)
- **Recommendation**: Add startup validation for critical variables:
  ```typescript
  // In server initialization
  validateServerEnv(['OPENAI_API_KEY', 'CLOUDFLARE_R2_ACCOUNT_ID'])
  
  // In client initialization (router.tsx)
  validateClientEnv(['VITE_CONVEX_URL'])
  ```

### 3. Missing .env File Documentation
- **Status**: ⚠️ **Recommendation**
- **Recommendation**: Create `.env.example` file documenting required variables:
  ```bash
  # Server-only (secrets)
  OPENAI_API_KEY=
  CLOUDFLARE_R2_ACCOUNT_ID=
  CLOUDFLARE_R2_ACCESS_KEY_ID=
  CLOUDFLARE_R2_SECRET_ACCESS_KEY=
  CLOUDFLARE_R2_BUCKET=
  
  # Client-safe (public)
  VITE_CONVEX_URL=
  VITE_DEV_CONVEX_URL=
  ```

## ✅ Production Checklist

- [x] **Server Secrets**: All secrets use `process.env` (no `VITE_` prefix)
- [x] **Client Variables**: Client variables use `VITE_` prefix with `import.meta.env`
- [x] **Type Safety**: TypeScript definitions added (`src/env.d.ts`)
- [x] **Client Code**: No `process.env` usage in client components
- [x] **Validation Utilities**: Environment variable validation utilities created
- [ ] **Startup Validation**: Consider adding startup validation for critical variables
- [ ] **.env.example**: Consider creating example environment file
- [ ] **Documentation**: Document environment variable requirements

## 📝 Recommendations for Future

1. **Add Startup Validation**: Validate critical environment variables at application startup
2. **Create .env.example**: Document all required environment variables
3. **Consider Variable Naming**: For clarity, consider using non-prefixed server-only variables for Convex URLs
4. **Add Runtime Validation**: Use the new `src/config/env.ts` utilities for validation
5. **Documentation**: Document environment variable setup in README

## Security Notes

### ✅ Secure Practices
- All secrets (API keys, access keys) are server-only
- No secrets have `VITE_` prefix
- Client code only accesses public configuration

### ⚠️ Security Considerations
- Convex URLs are public by design (they're client-facing endpoints)
- Using `VITE_` prefix for Convex URLs is acceptable since they're not secrets
- Server functions correctly isolate all secret access

## Conclusion

The codebase follows TanStack Start environment variable best practices well. The main issues (client component using `process.env`, missing type definitions, missing validation utilities) have been fixed. The codebase correctly separates server-only secrets from client-safe configuration variables.

All critical security practices are in place:
- Secrets are server-only
- Client code only accesses public variables
- Type safety is now enforced
- Validation utilities are available for future use

