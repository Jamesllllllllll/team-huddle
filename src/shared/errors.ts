// Only messages authored by the app may cross the server boundary or be shown in the UI.
export const messages = {
  request: 'Something went wrong. Please try again.',
  recording: 'We couldn’t process your recording. Please try again.',
  transcriptionUnavailable: 'Transcription is unavailable right now. Please try again later.',
  audioFormat: 'We couldn’t read the audio. Please record your message again.',
  noSpeech: 'We couldn’t hear any speech. Please record your message again.',
  join: 'Join the huddle before sending audio.',
  microphone: 'We couldn’t access your microphone. Check your microphone settings and try again.',
  microphonePermission: 'Allow microphone access in your browser to record.',
  microphoneMissing: 'Connect a microphone and try again.',
  keyInvalid: 'This API key wasn’t accepted. Check the key and try again.',
  keyPermission: 'This API key doesn’t have permission to make requests.',
  keyBusy: 'The API key couldn’t be verified right now. Please try again later.',
  linearReconnect: 'Reconnect your Linear account to continue.',
  research: 'We couldn’t complete this research. Please try again.',
} as const

const safeMessages = new Set<string>(Object.values(messages))

export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message !== messages.request && safeMessages.has(error.message)) {
    return error.message
  }
  return fallback
}

export function microphoneErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') return messages.microphonePermission
    if (error.name === 'NotFoundError') return messages.microphoneMissing
  }
  return publicErrorMessage(error, messages.microphone)
}
