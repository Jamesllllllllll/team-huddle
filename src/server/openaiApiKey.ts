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
      // Handle OpenAI API errors - check for status code
      if (error && typeof error === 'object') {
        // Check for status property (OpenAI SDK errors)
        if ('status' in error) {
          const status = error.status as number
          if (status === 401) {
            throw new Error('Invalid API key. Please check your key and try again.')
          }
          if (status === 429) {
            throw new Error('API rate limit exceeded. Please try again later.')
          }
          if (status === 403) {
            throw new Error('API key does not have permission to make requests.')
          }
        }

        // Check for OpenAI error structure
        if ('code' in error || 'type' in error) {
          const errorObj = error as { code?: string; type?: string; message?: string }
          if (errorObj.code === 'invalid_api_key' || errorObj.type === 'invalid_request_error') {
            throw new Error('Invalid API key. Please check your key and try again.')
          }
          if (errorObj.code === 'rate_limit_exceeded') {
            throw new Error('API rate limit exceeded. Please try again later.')
          }
        }
      }

      // Check for specific error messages in the error string
      const errorMessage = error instanceof Error ? error.message : String(error)
      const lowerMessage = errorMessage.toLowerCase()
      
      if (
        lowerMessage.includes('invalid api key') ||
        lowerMessage.includes('401') ||
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('authentication failed')
      ) {
        throw new Error('Invalid API key. Please check your key and try again.')
      }
      if (
        lowerMessage.includes('rate limit') ||
        lowerMessage.includes('429') ||
        lowerMessage.includes('too many requests')
      ) {
        throw new Error('API rate limit exceeded. Please try again later.')
      }
      if (lowerMessage.includes('forbidden') || lowerMessage.includes('403')) {
        throw new Error('API key does not have permission to make requests.')
      }

      // Generic error with original message
      throw new Error(
        `Failed to verify API key: ${errorMessage}. Please check your key and try again.`,
      )
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

