import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const CLIENT_SECRET_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets'

const zInput = z.object({
  huddleSlug: z.string().optional(),
})

export type RealtimePrototypeClientSecretPayload = z.infer<typeof zInput>

type ClientSecretResponse = {
  value: string
  expires_at: number
  session: Record<string, any>
}

export type RealtimePrototypeClientSecretResult = {
  clientSecret: string
  expiresAt: number
  session: Record<string, any>
  huddleSlug: string | null
}

export const createRealtimeClientSecret = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zInput.parse(payload))
  .handler(async ({ data }) => {
    const { huddleSlug = null } = data

    // Get user's API key if provided (for subscribed users), otherwise use server key
    const userApiKey = (data as any).userApiKey
    const apiKey = userApiKey || process.env.OPENAI_API_KEY
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('OPENAI_API_KEY must be configured to mint realtime client secrets.')
    }

    const expiresAfterSeconds = Number.parseInt(
      process.env.REALTIME_CLIENT_SECRET_TTL_SECONDS ?? '600',
      10,
    )

    const sessionConfig: Record<string, any> = {
      type: 'realtime',
      model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview-2024-12-17',
      instructions:
        process.env.OPENAI_REALTIME_INSTRUCTIONS ??
        'You are a concise, friendly meeting copilot. Listen carefully and surface key actions.',
      audio: {
        input: {
          format: {
            type: 'audio/pcm',
            rate: 24000,
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: {
            type: 'audio/pcm',
            rate: 24000,
          },
          voice: process.env.OPENAI_REALTIME_VOICE ?? 'alloy',
          speed: 1.0,
        },
      },
      include: ['item.input_audio_transcription.logprobs'],
    }

    const payload = {
      expires_after: {
        anchor: 'created_at',
        seconds: Number.isFinite(expiresAfterSeconds) ? expiresAfterSeconds : 600,
      },
      session: sessionConfig,
    }

    const response = await fetch(CLIENT_SECRET_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `Failed to create realtime client secret (${response.status} ${response.statusText})${
          errorText ? `: ${errorText}` : ''
        }`,
      )
    }

    const secret = (await response.json()) as ClientSecretResponse

    if (typeof secret?.value !== 'string' || secret.value.trim().length === 0) {
      throw new Error('Realtime client secret response was missing a value property.')
    }

    return {
      clientSecret: secret.value,
      expiresAt: secret.expires_at,
      session: secret.session ?? {},
      huddleSlug,
    } satisfies RealtimePrototypeClientSecretResult
  })

