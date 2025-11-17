import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { researchTopic } from './firecrawl'

const zResearchInput = z.object({
  planningItemId: z.string(),
  huddleId: z.string(),
  query: z.string().min(1),
})

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
 * Server action to perform research using Firecrawl and save results to Convex
 */
export const performResearch = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zResearchInput.parse(payload))
  .handler(async ({ data }) => {
    const { planningItemId, huddleId, query } = data

    const convexUrl = requireConvexUrl()
    const convexClient = new ConvexHttpClient(convexUrl)

    // Create a pending research result
    const researchResultId = await convexClient.mutation(
      api.huddle.createResearchResult,
      {
        planningItemId: planningItemId as Id<'planningItems'>,
        huddleId: huddleId as Id<'huddles'>,
        query,
        summary: '',
        sources: [],
        status: 'pending',
      }
    )

    try {
      // Perform the research
      const result = await researchTopic(query)

      // Update with results
      // In dev mode, also store the full raw response for debugging
      const updateData: {
        id: Id<'researchResults'>
        summary: string
        sources: Array<{ url: string; title?: string }>
        status: 'completed'
        rawResponse?: unknown
      } = {
        id: researchResultId,
        summary: result.summary,
        sources: result.sources,
        status: 'completed',
      }

      // Store full response in dev mode
      if (import.meta.env.DEV && 'rawResponse' in result) {
        updateData.rawResponse = result.rawResponse
      }

      await convexClient.mutation(api.huddle.updateResearchResult, updateData)

      return {
        success: true,
        researchResultId,
        summary: result.summary,
        sources: result.sources,
      }
    } catch (error) {
      // Update with error
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred'
      await convexClient.mutation(api.huddle.updateResearchResult, {
        id: researchResultId,
        status: 'failed',
        error: errorMessage,
      })

      throw error
    }
  })

