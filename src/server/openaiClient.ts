import OpenAI from 'openai'

let cachedClient: OpenAI | null = null
let cachedClientApiKey: string | null = null

/**
 * Get an OpenAI client instance.
 * If a user API key is provided, it will be used; otherwise falls back to the server's OPENAI_API_KEY.
 * 
 * @param userApiKey - Optional user's OpenAI API key (decrypted)
 * @returns OpenAI client instance
 */
export function getOpenAIClient(userApiKey?: string | null) {
  // If a user API key is provided, always create a new client with it
  if (userApiKey) {
    return new OpenAI({ apiKey: userApiKey })
  }

  // Otherwise, use cached client with server API key
  if (cachedClient && cachedClientApiKey) {
    return cachedClient
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  cachedClient = new OpenAI({ apiKey })
  cachedClientApiKey = apiKey
  return cachedClient
}


