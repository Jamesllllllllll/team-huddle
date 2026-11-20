// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { messages, publicErrorMessage } from '~/shared/errors'
import { speakToHuddle } from '~/server/speakToHuddle'

const { transcribe } = vi.hoisted(() => ({ transcribe: vi.fn() }))
vi.mock('~/server/openaiClient', () => ({
  getOpenAIClient: () => ({ audio: { transcriptions: { create: transcribe } } }),
}))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (handler: Function) => handler }) }),
}))

afterEach(() => vi.restoreAllMocks())

it('keeps a rejected provider credential out of the transcription response', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const rejection = Object.assign(new Error('401 Incorrect API key provided: sk-proj-EXAMPLE'), {
    status: 401, code: 'invalid_api_key',
  })
  transcribe.mockRejectedValueOnce(rejection)
  const data = new FormData()
  data.set('audio', new File(['test audio'], 'recording.webm', { type: 'audio/webm' }))
  data.set('speakerId', 'guest')
  data.set('speakerLabel', 'Guest')
  data.set('huddleSlug', 'test-huddle')
  data.set('requestId', 'example-request')
  await expect(speakToHuddle({ data })).rejects.toHaveProperty('message', messages.transcriptionUnavailable)
  expect(transcribe).toHaveBeenCalledOnce()
})

it.each([
  new Error('Transcription failed (request example): 401 Incorrect API key provided: sk-proj-EXAMPLE'),
  new Error('[CONVEX A(autumn:checkout)] [Request ID: example] Server Error'),
  new Error(messages.noSpeech + ' [provider details]'),
  { error: { message: 'raw upstream response' } },
  messages.request,
  null,
])('uses the local fallback for an unexpected error', error => {
  expect(publicErrorMessage(error, messages.recording)).toBe(messages.recording)
})

it('preserves app-authored instructions after a server error is serialized', () => {
  expect(publicErrorMessage(new Error(messages.noSpeech), messages.recording)).toBe(messages.noSpeech)
  expect(publicErrorMessage(new Error(messages.request), messages.recording)).toBe(messages.recording)
})
