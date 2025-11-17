# Team Huddle Live

Team Huddle Live is a real-time collaborative planning application built with TanStack Start, Convex, and OpenAI. It turns live conversation into structured planning items through AI-powered transcript analysis.

## TanStack X Convex Hackathon

This app was created for the [TanStack X Convex Hackathon](https://www.convex.dev/hackathons/tanstack?referrer=jameskeezer) (November 2025)

View & Vote for this app on [VibeApps](https://vibeapps.dev/s/team-huddle-live) if you dig it!

<img width="2485" height="1202" alt="team-huddle" src="https://github.com/user-attachments/assets/996fcb38-acae-45d9-b245-78402ba00034" />

## Tech Stack

- **Frontend**: [TanStack Start](https://tanstack.com/start/latest_) (React Router + SSR), React 19, Tailwind CSS v4
- **Backend**: [Convex](https://www.convex.dev/) (real-time database), TanStack Start server functions
- **Authentication**: Clerk
- **Subscriptions**: [Autumn](https://www.useautumn.com/)
- **AI**: OpenAI (transcription, analysis, summaries, realtime sessions)
- **Observability**: [Sentry](https://www.sentry.io/)
- **Hosting & Asset Storage**: [Cloudflare](https://www.cloudflare.com/) Workers & R2
- **State Management**: React Query + Convex React Query integration
- **AI Code Reviews**: [CodeRabbit](https://www.coderabbit.ai/)

## Local Development

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Convex account (sign up at [convex.dev](https://convex.dev))
- Clerk account (for authentication)
- OpenAI API key (for AI features)
- Cloudflare account (hosting on workers)
- Autumn account (managing subscriptions)

### Setup

```bash
npm install
```

### Running Locally

```bash
npm run dev
```

This command:
1. Runs `npx convex dev --once` to initialize Convex
2. Starts the TanStack Start dev server (`npm run dev:web`)
3. Seeds a sample huddle via Convex (`npm run dev:db`)

The app will be available at `http://localhost:3000` (or the next available port).

### Convex Development

Convex functions are in the `convex/` directory. To watch and update Convex functions during development:

```bash
npx convex dev
```

This runs Convex in watch mode, automatically pushing changes to your dev deployment.

To deploy Convex functions to production:

```bash
npx convex deploy
```

**Note**: The `npm run dev` command runs `npx convex dev --once` which initializes Convex but doesn't keep it in watch mode. For active Convex development, run `npx convex dev` in a separate terminal.

## Code Organization

### Frontend (`src/`)

- **`src/routes/`**: TanStack Router file-based routes
  - `__root.tsx`: Root layout with providers (Clerk, Convex, Autumn, Theme)
  - `index.tsx`: Home page with huddle list
  - `huddles.$huddleSlug.tsx`: Individual huddle view
- **`src/components/`**: React components
  - `Huddle.tsx`: Main huddle experience with planning board
  - `DevTranscriptToolbar.tsx`: Dev-only transcript simulator (only in dev mode)
  - `OpenAIApiKeyDialog.tsx`: Dialog for managing user API keys
  - `huddle/`: Huddle-specific components (participants, planning items, etc.)
  - `ui/`: shadcn/ui components
- **`src/server/`**: TanStack Start server functions
  - `ai/`: OpenAI transcript analysis integration
  - `speakToHuddle.ts`: Voice transcription and processing
  - `openaiApiKey.ts`: API key management (encrypt, test, store)
  - `encryption.ts`: AES-256-GCM encryption for user API keys
  - `avatar.ts`: Avatar upload to Cloudflare R2
  - `generateHuddleTitle.ts`: AI-powered title generation
  - `generateHuddleSummary.ts`: AI-powered summary generation
  - `createRealtimeSession.ts`: OpenAI Realtime API session creation
  - `linear.ts`: Linear integration
  - `research.ts`: Research capabilities
- **`src/context/`**: React context providers
  - `UserProfileContext.tsx`: User profile management (localStorage + Convex)
  - `ThemeContext.tsx`: Theme management
- **`src/queries.ts`**: React Query hooks for Convex queries/mutations
- **`src/dev/`**: Development tools
  - `mockTranscript.ts`: Mock transcript data for testing
  - `simulationSchema.ts`: Shared Zod schema for AI responses

### Backend (`convex/`)

- **`convex/schema.ts`**: Database schema definition
- **`convex/huddle.ts`**: Huddle queries and mutations
- **`convex/users.ts`**: User management, subscription status, API key storage
- **`convex/autumn.ts`**: Autumn subscription webhook handlers
- **`convex/linear.ts`**: Linear integration functions
- **`convex/auth.config.ts`**: Clerk authentication configuration

## Key Features & Architecture

### Real-Time Collaboration

- **Convex as Single Source of Truth**: All collaborative data (huddles, planning items, transcripts, presence) lives in Convex
- **React Query Integration**: Uses `@convex-dev/react-query` to keep Convex data reactive and cached
- **Presence Tracking**: Real-time speaking indicators and cursor positions

### User Authentication & Profiles

- **Clerk Integration**: Authentication via Clerk with Convex integration
- **Guest Support**: Users can participate as guests before signing up
- **Profile Management**: User profiles stored in Convex, with localStorage fallback for guests
- **Avatar Upload**: Server-side upload to Cloudflare R2 with signed URLs

### Subscriptions & API Keys

- **Autumn.js Integration**: Subscription management via Autumn
- **User API Keys**: Subscribed users can provide their own OpenAI API keys
  - Keys are encrypted server-side (AES-256-GCM) before storage
  - Keys are tested before saving
  - Users can update or delete their keys
- **Free Huddles**: Users without subscriptions can create time-limited huddles

### Planning Board

- **Planning Item Types**: Ideas, Tasks, Dependencies, Owners, Risks, Outcomes, Decisions, Summaries
- **Real-Time Updates**: Changes sync instantly across all clients
- **Dependency Tracking**: Tasks can be blocked by other items
- **Inline Editing**: Editable text components for quick updates

### Voice Transcription

- **OpenAI Audio API**: Real-time voice transcription
- **Fallback Models**: Primary model with whisper-1 fallback
- **Transcript Analysis**: AI analyzes transcripts and generates planning items
- **Multi-Turn Context**: Maintains conversation context via OpenAI Conversations API

## AI Integration

### Transcript Analysis

- **Server Function**: `runTranscriptAnalysis` in `src/server/ai/transcriptAnalysis.ts`
- **Structured Output**: Uses `zodTextFormat` and `zDevSimulationResponse` schema
- **Conversation Context**: Persists multi-turn context via OpenAI Conversations API
- **Action Generation**: Returns structured actions (create, update, remove planning items)

### AI Features

- **Title Generation**: `generateHuddleTitle` - AI-generated huddle titles
- **Summary Generation**: `generateHuddleSummary` - AI-generated huddle summaries
- **Realtime Sessions**: `createRealtimeSession` - OpenAI Realtime API integration
- **Research**: `research.ts` - Research capabilities with Firecrawl

### User API Keys

- **Encryption**: User API keys are encrypted server-side before storage
- **Key Testing**: Keys are validated via test API call before saving
- **Usage**: User keys are used for all OpenAI calls when available, falling back to server key
- **Storage**: Encrypted keys stored in `users.openaiApiKeyEncrypted` field

## Development Notes

### Environment Variables

Required environment variables (set in `.env` or `.dev.vars`):

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key (public)
- `VITE_CONVEX_URL`: Convex deployment URL (public)
- `VITE_DEV_CONVEX_URL`: Convex dev deployment URL (public)
- `OPENAI_API_KEY`: Server OpenAI API key (secret, server-only)
- `OPENAI_API_KEY_ENCRYPTION_KEY`: Encryption key for user API keys (secret, server-only, 64 hex chars)
- `CLOUDFLARE_R2_*`: R2 credentials for avatar storage (secret, server-only)
- `CLERK_SECRET_KEY`: Clerk secret key (secret, server-only)
- `AUTUMN_SECRET_KEY`: Autumn secret key (secret, server-only)

### Server Functions vs Convex Mutations

- **Server Functions** (`createServerFn`): Used for operations requiring secrets (OpenAI API calls, R2 uploads, encryption)
- **Convex Mutations**: Used for database operations that need real-time reactivity
- **Pattern**: Server functions handle external APIs, Convex handles data persistence

### Data Flow

1. Client calls server function (e.g., `speakToHuddle`)
2. Server function processes request (transcription, AI analysis)
3. Server function calls Convex mutation to persist data
4. Convex mutation triggers reactive updates
5. All clients receive updates via React Query subscriptions

### Dev Tools

- **Dev Transcript Toolbar**: Only visible in dev mode (`import.meta.env.DEV`)
- **Mock Data**: `src/dev/mockTranscript.ts` for testing without OpenAI
- **Schema Validation**: Shared Zod schemas ensure consistency between mock and real AI responses

## Testing

```bash
npm run test        # Run tests once (for CI/PRs)
npm run test:watch  # Run tests in watch mode
```

Tests focus on:
- Domain invariants (profile persistence, planning item taxonomy)
- Provider/hook behavior
- Deterministic runs (stub browser APIs, avoid network access)

The dev transcript toolbar is the quickest way to manually test AI-related behavior.

## Deployment

### Build

Test the build locally:

```bash
npm run build
```

This:
1. Builds the Vite application
2. Runs TypeScript type checking
3. Copies server instrumentation files

### Deploy to Cloudflare

Deploy to production:

```bash
npm run deploy --production
```

This runs `npm run build` then `wrangler deploy` to deploy to Cloudflare Workers.

### Deploy Convex

Deploy Convex functions to production:

```bash
npx convex deploy
```

**Note**: Make sure you're deploying to the correct Convex deployment. Check your `convex.json` or `.env` files for deployment configuration.

## Additional Resources

- [TanStack Start Docs](https://tanstack.com/router/latest/docs/framework/react/start/overview)
- [Convex Docs](https://docs.convex.dev)
- [Clerk Docs](https://clerk.com/docs)
- [Autumn.js Docs](https://autumn.js.org)
