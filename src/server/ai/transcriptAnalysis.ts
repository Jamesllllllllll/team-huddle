import { createServerFn } from '@tanstack/react-start'
import {
  type TranscriptAnalysisResult,
  transcriptAnalysisResponseJsonSchema,
  zInterpretTranscriptInput,
  type InterpretTranscriptInput,
} from '~/server/ai/transcriptAnalysis.shared'

type ServerModule = typeof import('./transcriptAnalysis.server')

let serverModulePromise: Promise<ServerModule> | null = null

async function loadServerModule(): Promise<ServerModule> {
  if (!serverModulePromise) {
    serverModulePromise = import('./transcriptAnalysis.server')
  }
  return serverModulePromise
}

export async function runTranscriptAnalysis(
  input: InterpretTranscriptInput,
  userApiKey?: string | null,
): Promise<TranscriptAnalysisResult> {
  const mod = await loadServerModule()
  return mod.runTranscriptAnalysis(input, userApiKey)
}

export const requestTranscriptAnalysis = createServerFn({ method: 'POST' })
  .inputValidator((payload: InterpretTranscriptInput) =>
    zInterpretTranscriptInput.parse(payload),
  )
  .handler(async ({ data }) => {
    const mod = await loadServerModule()
    return await mod.runTranscriptAnalysis(data)
  })

export { transcriptAnalysisResponseJsonSchema }
export type {
  InterpretTranscriptInput,
  TranscriptAnalysisResult,
} from '~/server/ai/transcriptAnalysis.shared'


