import { messages } from '~/shared/errors'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { encrypt, decrypt } from './encryption'

const zSetApiKey = z.object({
  apiKey: z.string().trim().min(1, 'API key is required'),
})

const zGetApiKey = z.object({})

function requireConvexUrl() {
  const url =
    process.env.NODE_ENV === 'production'
      ? process.env.VITE_CONVEX_URL
      : process.env.VITE_DEV_CONVEX_URL ?? process.env.VITE_CONVEX_URL
  if (!url) {
    throw new Error(
      'Set VITE_CONVEX_URL (prod) or VITE_DEV_CONVEX_URL (dev) to call Convex from server functions.',
    )
  }
  return url
}

/**
 * Server function to test an OpenAI API key by making a simple completion request.
 * Returns true if the key is valid, throws an error if invalid.
 */
export const testOpenAIApiKey = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zSetApiKey.parse(payload))
  .handler(async ({ data }) => {
    const { apiKey } = data

    // Validate the API key format (OpenAI keys start with "sk-")
    if (!apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format. Keys must start with "sk-".')
    }

    // Test the API key by making a simple completion request
    try {
      const { getOpenAIClient } = await import('./openaiClient')
      const client = getOpenAIClient(apiKey)
      
      // Make a minimal test request using the chat completions API
      // This is a lightweight way to verify the key works
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'test',
          },
        ],
        max_tokens: 5,
      })

      // If we get a response, the key is valid
      if (response && response.choices && response.choices.length > 0) {
        return { valid: true }
      }

      throw new Error('OpenAI API returned an unexpected response format.')
    } catch (error: unknown) {
      if (error && typeof error === 'object') {
        const { status, code } = error as { status?: number; code?: string }
        if (status === 401 || code === 'invalid_api_key') throw new Error(messages.keyInvalid)
        if (status === 403) throw new Error(messages.keyPermission)
      }
      throw new Error(messages.keyBusy)
    }
  })

/**
 * Server function to encrypt an OpenAI API key.
 * Returns the encrypted key so the client can store it via Convex mutation.
 * Note: This function does NOT test the key - use testOpenAIApiKey first.
 */
export const encryptOpenAIApiKey = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zSetApiKey.parse(payload))
  .handler(async ({ data }) => {
    const { apiKey } = data

    // Validate the API key format (OpenAI keys start with "sk-")
    if (!apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format. Keys must start with "sk-".')
    }

    // Encrypt the API key server-side
    const encrypted = encrypt(apiKey)

    // Return the encrypted key for the client to store via Convex mutation
    return { encryptedKey: encrypted }
  })

/**
 * Server function to get and decrypt a user's OpenAI API key.
 * Returns null if the user doesn't have a key set.
 */
export const getOpenAIApiKey = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zGetApiKey.parse(payload))
  .handler(async () => {
    const convexClient = new ConvexHttpClient(requireConvexUrl(), { logger: false })
    const encrypted = await convexClient.query(api.users.getOpenAIApiKeyEncrypted, {})

    if (!encrypted) {
      return { apiKey: null }
    }

    // Decrypt the API key server-side
    try {
      const decrypted = decrypt(encrypted)
      return { apiKey: decrypted }
    } catch (error) {
      console.error('Failed to decrypt API key', error)
      throw new Error('Failed to decrypt stored API key. Please set it again.')
    }
  })

/**
 * Server function to check if a user has an OpenAI API key set.
 */
export const hasOpenAIApiKey = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zGetApiKey.parse(payload))
  .handler(async () => {
    const convexClient = new ConvexHttpClient(requireConvexUrl(), { logger: false })
    const hasKey = await convexClient.query(api.users.hasOpenAIApiKey, {})
    return { hasKey }
  })

/**
 * Server function to delete a user's OpenAI API key.
 */
export const deleteOpenAIApiKey = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zGetApiKey.parse(payload))
  .handler(async () => {
    const convexClient = new ConvexHttpClient(requireConvexUrl(), { logger: false })
    await convexClient.mutation(api.users.deleteOpenAIApiKey, {})
    return { success: true }
  })

