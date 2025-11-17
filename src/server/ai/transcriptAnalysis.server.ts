import type { Response as OpenAIResponse } from 'openai/resources/responses/responses'
import {
  transcriptAnalysisTextFormat,
  type TranscriptAnalysisResult,
  type InterpretTranscriptInput,
} from '~/server/ai/transcriptAnalysis.shared'
import {
  zDevSimulationResponse,
  type DevSimulationResponse,
} from '~/dev/simulationSchema'
import { getOpenAIClient } from '~/server/openaiClient'

const SYSTEM_PROMPT = `
You are the AI planner for Team Huddle Live. You receive transcript entries from a live meeting.
For each chunk you must interpret the statement and decide which planning items to create, update, or remove.
Always respond with JSON that matches the provided schema. Use deterministic, lowercase snake_case keys.
Prefer singular nouns in keys (e.g., idea_contextual_tip). Only reference dependencies that already exist.
Only set blocked relationships when both items are tasks. Never block tasks with non-task items, and never block non-task items at all.
Classify each item as idea, task, dependency, owner, risk, outcome, decision, or summary.
Be conservative: only create, update, or remove items when the transcript clearly supports it.
When users explicitly request to remove, delete, cancel, or drop a task, goal, idea, or other planning item, use the removeItem action with the targetKey matching the existing item's key.
If the transcript does not contain actionable planning content (e.g., small talk, greetings, process noise), return an empty actions array and optionally include a short rationale explaining that no update is needed.

Research Detection: For idea items, always set needsResearch to a boolean value. Set needsResearch: true if the user explicitly requests research, information lookup, or fact-finding (e.g., "look up", "research", "find out about", "can someone check", "we need to know"). Set needsResearch: false for ideas that do not require research. Only set this flag for idea type items - use null for all other item types.
`.trim()

const DEFAULT_MODEL = process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini'

function buildUserPrompt({
  speakerId,
  speakerLabel,
  text,
  knownItems,
}: InterpretTranscriptInput) {
  const base = `Speaker (${speakerId}, ${speakerLabel}) said:\n"""${text}"""\n`
  if (!knownItems || knownItems.length === 0) {
    return `${base}\nGenerate the structured planning actions that should occur.`
  }

  const serializedKnownItems = knownItems
    .map(
      (item) =>
        `- ${item.itemKey} (${item.type}): ${item.text.replace(/\s+/g, ' ').trim()}`,
    )
    .join('\n')

  return `${base}\nExisting items (keys -> summary):\n${serializedKnownItems}\nOnly reference these existing keys when declaring dependencies.\nGenerate the structured planning actions that should occur.`
}

function extractStructuredPayload(response: OpenAIResponse) {
  if (response.output_text) {
    try {
      return JSON.parse(response.output_text)
    } catch (error) {
      console.warn('Failed to parse response.output_text as JSON', error)
    }
  }

  for (const item of response.output) {
    if (item.type !== 'message') {
      continue
    }
    for (const content of item.content) {
      if (content.type === 'output_text') {
        try {
          return JSON.parse(content.text)
        } catch (error) {
          console.warn('Failed to parse output_text content as JSON', error)
        }
      }
    }
  }

  throw new Error('OpenAI response did not include valid structured output.')
}

export async function runTranscriptAnalysis(
  input: InterpretTranscriptInput,
  userApiKey?: string | null,
): Promise<TranscriptAnalysisResult> {
  const client = getOpenAIClient(userApiKey)

  const conversationId =
    input.conversationId ??
    (
      await client.conversations.create({
        metadata: {
          mode: 'transcript_analysis',
          ...(input.huddleId ? { huddleId: input.huddleId } : {}),
        },
      })
    ).id

  await client.conversations.items.create(conversationId, {
    items: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildUserPrompt(input),
          },
        ],
      },
    ],
  })

  const response = await client.responses.create({
    model: DEFAULT_MODEL,
    instructions: SYSTEM_PROMPT,
    conversation: conversationId,
    input: [],
    text: {
      format: transcriptAnalysisTextFormat,
    },
  })

  const structured = extractStructuredPayload(response)
  
  // Filter out invalid update actions with empty patches before validation
  if (structured.actions && Array.isArray(structured.actions)) {
    const originalCount = structured.actions.length
    structured.actions = structured.actions.filter((action: unknown) => {
      if (
        typeof action === 'object' &&
        action !== null &&
        'kind' in action &&
        action.kind === 'updateItem' &&
        'patch' in action &&
        typeof action.patch === 'object' &&
        action.patch !== null
      ) {
        const patch = action.patch as { text: unknown; blockedByKeys: unknown }
        const hasText = patch.text !== null && patch.text !== undefined
        const hasBlockedBy = patch.blockedByKeys !== null && patch.blockedByKeys !== undefined
        // Keep the action only if at least one field is non-null
        const isValid = hasText || hasBlockedBy
        if (!isValid) {
          console.warn('Filtered out updateItem action with empty patch', {
            targetKey: 'targetKey' in action ? action.targetKey : undefined,
            patch,
          })
        }
        return isValid
      }
      return true
    })
    if (structured.actions.length < originalCount) {
      console.info('Filtered out invalid update actions', {
        originalCount,
        filteredCount: structured.actions.length,
        removed: originalCount - structured.actions.length,
      })
    }
  }
  
  const parsed = zDevSimulationResponse.parse(structured) as DevSimulationResponse

  return {
    conversationId,
    response: parsed,
  }
}


