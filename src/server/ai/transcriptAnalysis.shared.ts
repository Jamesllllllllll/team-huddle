import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import {
  zDevSimulationResponse,
  type DevSimulationResponse,
  zPlanningItemType,
} from '~/dev/simulationSchema'

const zKnownItem = z.object({
  itemKey: z.string().min(1),
  type: zPlanningItemType,
  text: z.string().min(1),
})

export const zInterpretTranscriptInput = z.object({
  chunkId: z.string().min(1),
  speakerId: z.string().min(1),
  speakerLabel: z.string().min(1),
  text: z.string().min(1),
  knownItems: z.array(zKnownItem).optional(),
  conversationId: z.string().min(1).optional(),
  huddleId: z.string().min(1).optional(),
})

export type InterpretTranscriptInput = z.infer<typeof zInterpretTranscriptInput>

export const transcriptAnalysisTextFormat = zodTextFormat(
  zDevSimulationResponse,
  'transcript_analysis_response',
)

export const transcriptAnalysisResponseJsonSchema =
  transcriptAnalysisTextFormat.schema

export type TranscriptAnalysisResult = {
  conversationId: string
  response: DevSimulationResponse
}


