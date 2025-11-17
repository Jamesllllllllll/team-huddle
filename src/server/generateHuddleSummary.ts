import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { getOpenAIClient } from './openaiClient'

const MODEL = process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini'

const SUMMARY_INPUT_SCHEMA = z.object({
  huddleId: z.string().trim().min(1, 'huddleId is required'),
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

const SYSTEM_PROMPT = `You are generating a summary overview for a completed team meeting/huddle. Based on all the planning items from the meeting, create a concise, professional summary that captures the essence of what was discussed and planned.

The summary should:
- Be written as a clear, readable overview (not a bullet list)
- Synthesize the key goals, decisions, and planned work
- Be suitable for use as a project description or meeting summary
- Be 2-3 sentences in length
- Focus on the "what" and "why" rather than listing every detail
- Avoid repeating information that's already in the planning items themselves

Write the summary in markdown format, using clear paragraphs. Do not include headers or section markers - just write flowing prose.`

function buildUserPrompt(planningItems: Array<{ type: string; text: string }>) {
  const itemsByType = planningItems.reduce(
    (acc, item) => {
      if (!acc[item.type]) {
        acc[item.type] = []
      }
      acc[item.type].push(item.text)
      return acc
    },
    {} as Record<string, string[]>,
  )

  let prompt = 'Planning items from the meeting:\n\n'

  if (itemsByType.outcome?.length) {
    prompt += `Goals:\n${itemsByType.outcome.map((g) => `- ${g}`).join('\n')}\n\n`
  }

  if (itemsByType.task?.length) {
    prompt += `Tasks:\n${itemsByType.task.map((t) => `- ${t}`).join('\n')}\n\n`
  }

  if (itemsByType.idea?.length) {
    prompt += `Ideas:\n${itemsByType.idea.map((i) => `- ${i}`).join('\n')}\n\n`
  }

  if (itemsByType.decision?.length) {
    prompt += `Decisions:\n${itemsByType.decision.map((d) => `- ${d}`).join('\n')}\n\n`
  }

  if (itemsByType.risk?.length) {
    prompt += `Risks:\n${itemsByType.risk.map((r) => `- ${r}`).join('\n')}\n\n`
  }

  if (itemsByType.dependency?.length) {
    prompt += `Dependencies:\n${itemsByType.dependency.map((d) => `- ${d}`).join('\n')}\n\n`
  }

  if (itemsByType.owner?.length) {
    prompt += `Owners:\n${itemsByType.owner.map((o) => `- ${o}`).join('\n')}\n\n`
  }

  prompt +=
    '\nGenerate a concise summary overview that synthesizes these planning items into a coherent narrative about what this meeting accomplished and what the team is working toward.'

  return prompt
}

export const generateHuddleSummary = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => SUMMARY_INPUT_SCHEMA.parse(payload))
  .handler(async ({ data }) => {
    const { huddleId } = data
    const convexUrl = requireConvexUrl()
    const client = new ConvexHttpClient(convexUrl)

    // Get huddle to verify it exists
    const huddle = await client.query(api.huddle.getHuddleById, {
      id: huddleId as Id<'huddles'>,
    })

    if (!huddle) {
      throw new Error(`Huddle ${huddleId} not found`)
    }

    // Get all planning items by querying the full huddle
    const fullHuddle = await client.query(api.huddle.getHuddle, {
      slug: huddle.slug,
    })

    if (!fullHuddle) {
      throw new Error(`Huddle ${huddleId} not found`)
    }

    const planningItems = fullHuddle.planningItems || []

    // Check if summary already exists
    const existingSummary = planningItems.find((item) => item.type === 'summary')
    if (existingSummary) {
      return {
        applied: false,
        summaryId: existingSummary._id,
        text: existingSummary.text,
      }
    }

    // Get goals (outcomes) and tasks - only generate if both exist
    const goals = planningItems.filter((item) => item.type === 'outcome')
    const tasks = planningItems.filter((item) => item.type === 'task')

    if (goals.length === 0 || tasks.length === 0) {
      return {
        applied: false,
        reason: 'Summary requires at least one goal and one task',
      }
    }

    // Prepare planning items for AI (exclude existing summary)
    const itemsForAI = planningItems
      .filter((item) => item.type !== 'summary')
      .map((item) => ({
        type: item.type,
        text: item.text,
      }))

    if (itemsForAI.length === 0) {
      return {
        applied: false,
        reason: 'No planning items to summarize',
      }
    }

    // Get user's API key if provided (for subscribed users)
    // Note: This function is called from the client, which can pass userApiKey
    const userApiKey = (data as any).userApiKey || undefined
    const openai = getOpenAIClient(userApiKey)
    const conversation = await openai.conversations.create({
      metadata: {
        mode: 'huddle_summary',
        huddleId,
      },
    })

    const userPrompt = buildUserPrompt(itemsForAI)

    await openai.conversations.items.create(conversation.id, {
      items: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: userPrompt,
            },
          ],
        },
      ],
    })

    let responseText: string | undefined
    try {
      const response = await openai.responses.create({
        model: MODEL,
        instructions: SYSTEM_PROMPT,
        conversation: conversation.id,
        input: [],
      })

      // Extract text from response
      if (response.output_text) {
        responseText = response.output_text
      } else {
        for (const item of response.output) {
          if (item.type === 'message') {
            for (const content of item.content) {
              if (content.type === 'output_text') {
                responseText = content.text
                break
              }
            }
          }
          if (responseText) break
        }
      }
    } catch (error) {
      console.error('Failed to generate summary with OpenAI', error)
      throw new Error('Failed to generate summary with AI')
    }

    if (!responseText || responseText.trim().length === 0) {
      throw new Error('OpenAI did not return summary text.')
    }

    // Clean up the response text
    const summaryText = responseText.trim()

    // Create the summary planning item
    const summaryId = await client.mutation(api.huddle.createPlanningItem, {
      huddleId: huddleId as Id<'huddles'>,
      type: 'summary',
      text: summaryText,
      timestamp: new Date().toISOString(),
      metadata: {
        autoGenerated: true,
      },
    })

    return {
      applied: true,
      summaryId,
      text: summaryText,
    }
  })

