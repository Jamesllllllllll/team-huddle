import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { getOpenAIClient } from './openaiClient'

const MODEL = process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini'

const TITLE_SYSTEM_PROMPT = `
You are the naming strategist for Team Huddle Live.
Generate a concise, memorable project title that reflects the stated goal.
Constraints:
- Use natural title casing without surrounding quotes.
- Prefer 3–6 words and never exceed 8 words.
- Avoid jargon, emojis, or filler phrases.
- Respond with the title text only.
`.trim()

const TITLE_INPUT_SCHEMA = z.object({
  huddleId: z.string().trim().min(1, 'huddleId is required'),
  goalId: z.string().trim().min(1, 'goalId is required'),
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

function formatTranscriptSummary(
  entries: Array<{
    payload: string
    createdAt: string
    metadata?: Record<string, unknown> | null
  }>,
) {
  return entries
    .map((entry) => {
      const metadata = entry.metadata ?? {}
      const speakerLabel =
        typeof metadata?.speakerLabel === 'string' && metadata.speakerLabel.trim().length > 0
          ? metadata.speakerLabel.trim()
          : typeof metadata?.speakerId === 'string' && metadata.speakerId.trim().length > 0
            ? metadata.speakerId.trim()
            : 'Unknown'
      const timestamp = new Date(entry.createdAt).toLocaleString()
      const text = entry.payload.replace(/\s+/g, ' ').trim()
      return `[${timestamp}] ${speakerLabel}: ${text}`
    })
    .join('\n')
}

function buildUserPrompt({
  goalText,
  transcriptSummary,
}: {
  goalText: string
  transcriptSummary: string
}) {
  const parts: string[] = []
  parts.push(`Goal:\n"""${goalText.trim()}"""\n`)
  if (transcriptSummary.trim().length > 0) {
    parts.push('Transcript Context:\n')
    parts.push(transcriptSummary)
  }
  parts.push(
    '\nCraft a project title that captures the essence of the goal while staying under eight words.',
  )
  return parts.join('')
}

function normalizeTitle(raw: string, fallback: string) {
  const cleaned = raw
    .trim()
    .replace(/^[“”"']+/, '')
    .replace(/[“”"']+$/, '')
    .replace(/\s+/g, ' ')
  if (cleaned.length === 0) {
    return normalizeTitle(fallback, 'Team Goal')
  }
  const words = cleaned.split(/\s+/)
  const limited =
    words.length > 8 ? words.slice(0, 8).join(' ') : cleaned
  return limited
}

export const requestHuddleAutoTitle = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => TITLE_INPUT_SCHEMA.parse(payload))
  .handler(async ({ data }) => {
    const { huddleId, goalId } = data
    const convexUrl = requireConvexUrl()
    const client = new ConvexHttpClient(convexUrl)

    const [huddle, goal, transcriptChunks] = await Promise.all([
      client.query(api.huddle.getHuddleById, { id: huddleId as Id<'huddles'> }),
      client.query(api.huddle.getPlanningItemById, { id: goalId as Id<'planningItems'> }),
      client.query(api.huddle.listTranscriptChunks, { huddleId: huddleId as Id<'huddles'> }),
    ])

    if (!huddle) {
      throw new Error(`Huddle ${huddleId} not found`)
    }

    if (typeof huddle.autoTitleGeneratedAt === 'string') {
      return {
        applied: false,
        name: huddle.name,
        autoTitleGeneratedAt: huddle.autoTitleGeneratedAt,
      }
    }

    if (!goal) {
      throw new Error(`Goal ${goalId} not found`)
    }
    if (goal.type !== 'outcome') {
      throw new Error('Auto title generation requires an outcome planning item')
    }

    const orderedChunks = [...transcriptChunks].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    const recentChunks = orderedChunks.slice(-40)
    const transcriptSummary = formatTranscriptSummary(recentChunks)

    // Get user's API key if provided (for subscribed users)
    // Note: This function is called from the client, which can pass userApiKey
    const userApiKey = (data as any).userApiKey || undefined
    const openai = getOpenAIClient(userApiKey)
    const conversation = await openai.conversations.create({
      metadata: {
        mode: 'auto_title',
        huddleId,
        goalId,
      },
    })

    const userPrompt = buildUserPrompt({
      goalText: goal.text,
      transcriptSummary,
    })

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
        instructions: TITLE_SYSTEM_PROMPT,
        conversation: conversation.id,
        input: [],
      })

      if (response.output_text && response.output_text.trim().length > 0) {
        responseText = response.output_text
      } else {
        for (const item of response.output ?? []) {
          if (item.type !== 'message') continue
          for (const content of item.content) {
            if (content.type === 'output_text' && content.text.trim().length > 0) {
              responseText = content.text
              break
            }
          }
          if (responseText) break
        }
      }
    } catch (error) {
      console.error('Failed to generate title with OpenAI', error)
    }

    const candidate = normalizeTitle(responseText ?? '', goal.text)
    const result = await client.mutation(api.huddle.setHuddleAutoTitle, {
      huddleId: huddleId as Id<'huddles'>,
      goalId: goalId as Id<'planningItems'>,
      name: candidate,
    })

    return result
  })


