# Push-to-Talk Voice Input Plan

This document captures the implementation plan for adding push-to-talk voice input to Huddle and routing the captured speech through the existing OpenAI → Convex interpretation pipeline.

## 1. Flow Overview

1. [x] User joins a huddle and opts into microphone access.
2. [x] User holds a “Push to Talk” control.
3. [x] Browser records audio with `MediaRecorder`.
4. [x] Recorded audio is uploaded to the server (TanStack Start server function).
5. [x] Server sends audio to OpenAI Responses (speech-to-text) and obtains the transcript.
6. [x] Transcript is passed into the existing interpretation pipeline (same as dev simulation toolbar).
7. [x] Convex writes transcript chunks + planning updates; clients update in real time.
8. [ ] Optional: store raw audio in R2 for audits or replay.

## 2. Client Responsibilities

### 2.1 Microphone Permissions (`useMicrophone` hook)
- [x] Request permission only after explicit user action.
- [x] Expose:
  - [x] `stream` (`MediaStream | null`)
  - [x] `requestPermission()` (prompts the user)
  - [x] `startRecording()` / `stopRecording()` (manage `MediaRecorder`)
  - [x] Status flags (`isRecording`, `error`)
- [x] Handle permission denial (show toast, keep “Enable Mic” button available).

### 2.2 Push-to-Talk Control
- [x] Add a control in the huddle UI:
  - [x] Press/hold to start recording, release to stop.
  - [x] Support click/tap and keyboard accessibility.
  - [x] Display states: idle, recording, sending, error.
- [ ] After `stopRecording`, call `uploadAudio(blob)` which returns transcription results.

### 2.3 Client → Server Upload
- [x] Serialize audio as `FormData` (e.g. `{ audio: Blob, mimeType }`).
- [x] Include metadata: `huddleId`, `speakerId`, `speakerLabel`.
- [ ] Show optimistic UI (e.g. “Transcribing…” badge near transcript list).

## 3. Server Responsibilities

### 3.1 New server function (`speakToHuddle`)
- [x] Accept `FormData` payload, validate inputs.
- [ ] Optionally store original audio in R2 (using existing helper patterns).
- [ ] Convert audio to base64 if required by OpenAI endpoint.
- [x] Call OpenAI Responses API for transcription:
  - [x] Model: `gpt-4o-mini-transcribe` (or whichever speech model we standardize on).
  - [x] Extract transcript text.

### 3.2 Integration with Interpretation Pipeline
- [x] Build the same payload used by `DevTranscriptToolbar` when simulating transcript chunks.
- [x] Insert a Convex transcript chunk (`source: 'voice'`) with next sequence number.
- [x] Call existing Convex logic to apply AI-generated planning item updates.
- [x] Return structured data back to the client if needed for immediate UI feedback.

## 4. Convex Adjustments
- [x] Add mutation (or extend existing) to accept “voice” sources.
- [x] Ensure sequence numbers remain monotonic (so transcripts stay in order).
- [ ] Store optional audio URL in chunk metadata.
- [x] Reuse interpretation → planning item update pathways to keep business logic identical to text flow.

## 5. UI Feedback
- [ ] While transcription is pending, show the captured audio chunk with a “Processing…” state.
- [ ] Once structured actions arrive, replace state with final entries.
- [ ] On failure:
  - [ ] Show toast (e.g. “Could not transcribe. Try again.”).
  - [ ] Keep the audio chunk flagged so users can retry sending it.

## 6. Testing
- [ ] **Unit tests**: microphone hook, server handler (mock OpenAI), Convex mutations.
- [ ] **Integration**: simulate recording, upload blob, ensure planning items appear.
- [ ] **Manual**: verify permission flows across browsers, large audio handling, rejection states.

## 7. Future: Realtime Streaming
- [ ] Once push-to-talk flow is stable:
  - [ ] Introduce OpenAI Realtime session with WebRTC.
  - [ ] Refactor `useMicrophone` to stream audio continuously.
  - [ ] Maintain Convex stream of transcript chunks via event handlers.
- [ ] Push-to-talk code becomes the fallback for browsers that don’t support real-time or when the user prefers a PTT interaction.

## 8. Required Environment Variables
- [x] `OPENAI_API_KEY`
- [x] `OPENAI_RESPONSES_MODEL` (optional override)
- [x] `CLOUDFLARE_R2_ACCOUNT_ID`
- [x] `CLOUDFLARE_R2_ACCESS_KEY_ID`
- [x] `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- [x] `CLOUDFLARE_R2_BUCKET`
- [x] `CLOUDFLARE_R2_PUBLIC_URL`

All env vars must exist in both local `.dev.vars`/`.env` files and Cloudflare Worker configuration (vars or secrets).

---

This plan keeps scope incremental (push-to-talk first) while laying foundations for full real-time audio collaboration. Next steps: implement sections 2–4 iteratively, deploy behind a feature flag, and gather feedback before investing in streaming.

