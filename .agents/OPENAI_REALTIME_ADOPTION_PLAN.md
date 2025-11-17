## Goal
- [ ] Confirm feasibility and scope for introducing OpenAI Realtime streaming into existing transcription → interpretation → planning flow.

## Research & Discovery
- [x] Assess current architecture touchpoints (`useMicrophone`, `DevTranscriptToolbar`, Convex mutations).
- [x] Document Realtime API capabilities needed (token relay, turn detection, transcript events, response events).
  - **Ephemeral auth**: `POST /v1/realtime/client_secrets` issues short-lived credentials with baked-in session defaults. Convex mints these tokens and hands them to the browser so the primary API key stays server-only.
  - **WebRTC call**: `POST /v1/realtime/calls` exchanges the browser SDP offer for an SDP answer plus call metadata. The Huddle client sets up the peer connection through the JS SDK, keeping audio/video inside the WebRTC channel.
  - **Audio streaming**: `appendInputAudio(Int16Array)` lets us stream mic frames without reworking `useMicrophone`; we continue to split the PCM buffer into 100 ms chunks and, on turn completion, pass the buffered audio through the current `logTranscriptChunk` + Responses mutation path.
  - **Server VAD**: `turn_detection: { type: 'server_vad' }` replaces manual mic toggles. The Realtime session emits `conversation.item.completed` when it decides a user turn ended, which maps cleanly to our existing “submit transcript chunk” trigger.
  - **Transcript deltas**: `conversation.updated` delivers `delta.transcript` strings during a turn. We can buffer these client-side while maintaining the current Convex-backed ordering by only persisting once the turn completes.
  - **Response forwarding**: Instead of consuming the model’s generated response, we can package the completed audio/text item and POST it to our existing OpenAI Responses endpoint (`requestDevSimulationFromOpenAI`). This keeps the deterministic planning item pipeline intact while we gradually adopt richer Realtime responses.
- [x] Identify security implications (ephemeral keys, server relay design).
  - **Secret exposure**: Keep the primary OpenAI key server-only and issue browser clients short-lived Realtime `client_secret`s from Convex; never embed credentials in the bundle.
  - **Transport**: Require HTTPS/WSS when streaming audio so we don’t leak raw conversation data in transit.

## Phase 1 · Streaming Transport
- [ ] Prototype Realtime client connection (OpenAI JS SDK over WebRTC) gated behind feature flag.
- [ ] Implement Convex mutation that calls `POST /v1/realtime/client_secrets` with Cloudflare-compatible fetch and returns the short-lived token plus planned session defaults.
- [ ] From the browser, create an SDP offer, exchange it via `POST /v1/realtime/calls`, and complete the peer connection using the returned SDP answer (fall back to WebSocket mode only if WebRTC fails).
- [ ] Stream mic audio continuously via the SDK’s `appendInputAudio` helpers while reusing existing transcription pipeline.
- [ ] Capture metrics comparing latency & determinism vs. batch flow.
- [ ] **Parallel fallback track**: implement browser-side auto-VAD that detects turns locally and submits each detected turn through the existing `speakToHuddle` pipeline (so the experience improves even without WebRTC). Keep this guarded behind a dev toggle so we can compare behaviors.

## Phase 2 · Realtime Transcripts
- [ ] Enable `input_audio_transcription` and persist transcripts into Convex as `transcriptChunks`.
- [ ] Buffer partial transcripts client-side and flush when items complete (maintain ordering/sequence checks).
- [ ] Update developer tooling (`DevTranscriptToolbar`) to replay Realtime transcripts.

## Phase 3 · Realtime Responses
- [ ] Map Realtime response items into `DevSimulationAction` equivalents before Convex mutations.
- [ ] Add safeguards for divergence (logging raw payloads, validation, fallback to batch flow).
- [ ] Expand UI to surface live agent responses (voice/text) with interruption controls.

## Phase 4 · Tool Execution Optional
- [ ] Design Convex-backed tool handlers for direct planning-item mutations.
- [ ] Validate deterministic outcomes in multi-user sessions before defaulting on.
- [ ] Document rollback strategy and monitoring alerts.

## Platform & Ops
- [ ] Implement Convex mutation to mint Realtime client secrets via `POST /v1/realtime/client_secrets` (server-side relay on Cloudflare Workers).
- [ ] Log call IDs returned in the `Location` header from `POST /v1/realtime/calls` for debugging and hangup endpoints.
- [ ] Add observability: session lifecycle logs, latency dashboards, error alerts.
- [ ] Update security review & privacy docs for continuous audio streaming.

---

### Side Implementation: Browser-Only Turn Detection (Fallback Path)

- [x] **Mic lifecycle** – Keep a single `MediaStream` open, but don’t trigger backend calls until a VAD hook decides a turn ended.
- [x] **Voice Activity Detection** – Evaluate lightweight options (`@ricky0123/vad`, Meyda, WebRTC VAD WASM) to sample PCM frames and detect speech start/stop with configurable thresholds.
- [x] **Buffer management** – When speech starts, begin buffering PCM (either via `MediaRecorder` or manual PCM accumulation). When the silence threshold is hit (e.g. 600–800 ms of quiet), finalize the blob and submit it to the existing `speakToHuddle` server function.
- [x] **State updates** – Reuse the current Convex mutations (`logTranscriptChunk`, `processVoiceTranscript`) so deterministic planning-item behavior remains identical to the manual push-to-talk workflow.
- [ ] **Testing** – Compare VAD accuracy/noise tolerance against the WebRTC server VAD path, and measure latency relative to full realtime.

