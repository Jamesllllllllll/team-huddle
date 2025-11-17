import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { toFile } from 'openai'
import type { Audio } from 'openai/resources/audio/audio'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { runTranscriptAnalysis } from '~/server/ai/transcriptAnalysis'
import { getOpenAIClient } from './openaiClient'

const zFormPayload = z
  .object({
    huddleId: z.string().trim().min(1, 'huddleId is required').optional(),
    huddleSlug: z.string().trim().min(1, 'huddleSlug is required').optional(),
    speakerId: z.string().trim().min(1, 'speakerId is required'),
    speakerLabel: z.string().trim().min(1, 'speakerLabel is required'),
    durationMs: z
      .string()
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') {
          return undefined
        }
        const trimmed = value.trim()
        return trimmed.length > 0 ? Number.parseFloat(trimmed) : undefined
      })
      .refine((value) => value === undefined || Number.isFinite(value), {
        message: 'durationMs must be a finite number',
      }),
    requestId: z
      .string()
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') {
          return undefined
        }
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
      }),
    conversationId: z
      .string()
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') {
          return undefined
        }
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
      }),
  })
  .superRefine((value, ctx) => {
    if (!value.huddleId && !value.huddleSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['huddleId'],
        message: 'Provide either huddleId or huddleSlug.',
      })
    }
  })

function getStringField(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : undefined
}

function normalizeMimeType(value: string | undefined | null) {
  if (!value) {
    return 'audio/webm'
  }
  const [base] = value.split(';', 1)
  return base && base.trim().length > 0 ? base.trim().toLowerCase() : 'audio/webm'
}

function isUnsupportedAudioError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }
  const maybeApiError = error as { code?: string; message?: string }
  if (typeof maybeApiError.code === 'string' && maybeApiError.code === 'unsupported_value') {
    return true
  }
  if (
    typeof maybeApiError.message === 'string' &&
    maybeApiError.message.toLowerCase().includes('unsupported file format')
  ) {
    return true
  }
  return false
}

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

function normalizeCreateAction(action: {
  kind: 'createItem'
  itemKey: string
  type: string
  text: string
  speakerLabel: string | null
  blockedByKeys: Array<string> | null
  needsResearch: boolean | null
}) {
  return {
    kind: action.kind,
    itemKey: action.itemKey,
    type: action.type,
    text: action.text,
    speakerLabel: action.speakerLabel ?? undefined,
    blockedByKeys:
      action.blockedByKeys === null ? undefined : action.blockedByKeys,
    needsResearch: action.needsResearch ?? undefined,
  }
}

function normalizeUpdateAction(action: {
  kind: 'updateItem'
  targetKey: string
  patch: {
    text: string | null
    blockedByKeys: Array<string> | null
  }
}) {
  return {
    kind: action.kind,
    targetKey: action.targetKey,
    patch: {
      ...(action.patch.text === null ? {} : { text: action.patch.text }),
      ...(action.patch.blockedByKeys === null
        ? {}
        : { blockedByKeys: action.patch.blockedByKeys }),
    },
  }
}

function normalizeRemoveAction(action: {
  kind: 'removeItem'
  targetKey: string
}) {
  return {
    kind: action.kind,
    targetKey: action.targetKey,
  }
}

type SerializedErrorInfo = {
  name?: string
  message: string
  stack?: string
  status?: number
  code?: string | number
  type?: string
  response?: {
    status?: number
    statusText?: string
    body?: string
    headers?: Record<string, string>
    data?: unknown
  }
  data?: unknown
  cause?: SerializedErrorInfo
  stage?: string
}

const RESPONSE_BODY_LIMIT = 2000

function truncate(value: string | undefined | null, max = 400) {
  if (!value) {
    return undefined
  }
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max)}…`
}

function safeStringify(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    try {
      return String(value)
    } catch {
      return '[unserializable]'
    }
  }
}

function safeSerializeHeaders(headers: unknown): Record<string, string> | undefined {
  try {
    if (!headers || typeof headers !== 'object') {
      return undefined
    }
    if (headers instanceof Headers) {
      const result: Record<string, string> = {}
      headers.forEach((value, key) => {
        result[key] = value
      })
      return result
    }
    return undefined
  } catch {
    return undefined
  }
}

async function serializeResponseLike(responseLike: unknown): Promise<SerializedErrorInfo['response']> {
  if (!responseLike || typeof responseLike !== 'object') {
    return undefined
  }

  try {
    if (responseLike instanceof Response) {
      const clone = responseLike.clone()
      let body: string | undefined
      try {
        body = await clone.text()
      } catch {
        body = undefined
      }
      return {
        status: responseLike.status,
        statusText: responseLike.statusText,
        body: truncate(body, RESPONSE_BODY_LIMIT),
        headers: safeSerializeHeaders(responseLike.headers),
      }
    }

    const info: SerializedErrorInfo['response'] = {}

    if ('status' in responseLike && typeof (responseLike as any).status === 'number') {
      info.status = (responseLike as { status: number }).status
    }
    if ('statusText' in responseLike && typeof (responseLike as any).statusText === 'string') {
      info.statusText = (responseLike as { statusText: string }).statusText
    }

    if ('headers' in responseLike) {
      const headers = safeSerializeHeaders((responseLike as any).headers)
      if (headers) {
        info.headers = headers
      }
    }

    if ('data' in responseLike && (responseLike as any).data !== undefined) {
      try {
        info.data = JSON.parse(safeStringify((responseLike as any).data))
      } catch {
        info.data = safeStringify((responseLike as any).data)
      }
    }

    if ('text' in responseLike && typeof (responseLike as any).text === 'function') {
      try {
        const textFn = (responseLike as { text: () => Promise<string> }).text
        const text = await textFn.call(responseLike)
        info.body = truncate(text, RESPONSE_BODY_LIMIT)
      } catch {
        // ignore
      }
    } else if ('json' in responseLike && typeof (responseLike as any).json === 'function') {
      try {
        const jsonFn = (responseLike as { json: () => Promise<unknown> }).json
        const json = await jsonFn.call(responseLike)
        info.body = truncate(JSON.stringify(json), RESPONSE_BODY_LIMIT)
      } catch {
        // ignore
      }
    }

    if (Object.keys(info).length === 0) {
      return undefined
    }

    return info
  } catch {
    return undefined
  }
}

async function serializeError(error: unknown, seen = new WeakSet<object>()): Promise<SerializedErrorInfo> {
  if (error instanceof Error) {
    if (seen.has(error)) {
      return { name: error.name, message: error.message }
    }
    seen.add(error)
    const serialized: SerializedErrorInfo = {
      name: error.name,
      message: error.message,
    }
    if (error.stack) {
      serialized.stack = error.stack
    }

    const anyError = error as any
    if (typeof anyError.status === 'number') {
      serialized.status = anyError.status
    }
    if (typeof anyError.code !== 'undefined') {
      serialized.code = anyError.code
    }
    if (typeof anyError.type === 'string') {
      serialized.type = anyError.type
    }
    if (anyError.data !== undefined) {
      try {
        serialized.data = JSON.parse(safeStringify(anyError.data))
      } catch {
        serialized.data = safeStringify(anyError.data)
      }
    }
    if (anyError.response) {
      serialized.response = await serializeResponseLike(anyError.response)
    }
    if (anyError.cause) {
      serialized.cause = await serializeError(anyError.cause, seen)
    }
    if (typeof anyError.stage === 'string') {
      serialized.stage = anyError.stage
    }
    return serialized
  }

  if (error instanceof Response) {
    return {
      message: `HTTP ${error.status} ${error.statusText}`,
      response: await serializeResponseLike(error),
    }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  return { message: safeStringify(error) }
}

function buildErrorSummary(error: SerializedErrorInfo): string {
  const parts: string[] = []

  if (typeof error.stage === 'string' && error.stage.length > 0) {
    parts.push(`[${error.stage}]`)
  }

  const baseMessage =
    error.name && error.name !== 'Error'
      ? `${error.name}: ${error.message}`
      : error.message
  parts.push(baseMessage)

  if (typeof error.status === 'number') {
    parts.push(`status ${error.status}`)
  }
  if (typeof error.code !== 'undefined') {
    parts.push(`code ${String(error.code)}`)
  }
  if (typeof error.type === 'string') {
    parts.push(`type ${error.type}`)
  }
  if (error.response?.status) {
    parts.push(
      `response ${error.response.status}${
        error.response.statusText ? ` ${error.response.statusText}` : ''
      }`,
    )
  }
  if (error.response?.body) {
    parts.push(`responseBody ${truncate(error.response.body, 400)}`)
  }
  if (error.data) {
    parts.push(`data ${truncate(safeStringify(error.data), 400)}`)
  }
  if (error.cause) {
    parts.push(`cause -> ${buildErrorSummary(error.cause)}`)
  }

  return parts.join(' | ')
}

class StageError extends Error {
  stage: string
  constructor(stage: string, message: string, cause?: unknown) {
    super(message, typeof cause === 'undefined' ? undefined : { cause })
    this.name = 'StageError'
    this.stage = stage
  }
}

const conversationQueues = new Map<string, { promise: Promise<unknown> }>()

function withConversationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previousEntry = conversationQueues.get(key)
  const previous = previousEntry?.promise ?? Promise.resolve()

  const queued = previous
    .catch(() => {})
    .then(() => task())

  const entry = { promise: queued.catch(() => {}) }
  conversationQueues.set(key, entry)

  return queued.finally(() => {
    if (conversationQueues.get(key) === entry) {
      conversationQueues.delete(key)
    }
  })
}

export const speakToHuddle = createServerFn({ method: 'POST' })
  .inputValidator((payload) => {
    if (!(payload instanceof FormData)) {
      throw new Error('FormData payload is required.')
    }
    return payload
  })
  .handler(async (ctx) => {
    const formData = ctx.data
    let requestIdForLogs: string | null = null
    let logContext: Record<string, unknown> = {}

    try {
      const audioEntry = formData.get('audio')

      if (!(audioEntry instanceof File)) {
        throw new Error('Audio blob is required.')
      }
      logContext.stage = 'parse:form-data'

      const fields = zFormPayload.parse({
        huddleId: getStringField(formData, 'huddleId'),
    huddleSlug: getStringField(formData, 'huddleSlug'),
        speakerId: getStringField(formData, 'speakerId'),
        speakerLabel: getStringField(formData, 'speakerLabel'),
        durationMs: getStringField(formData, 'durationMs'),
        requestId: getStringField(formData, 'requestId'),
        conversationId: getStringField(formData, 'conversationId'),
      })

      // Skip AI analysis for audio less than 3 seconds
      const MIN_DURATION_MS = 3000
      if (fields.durationMs !== undefined && fields.durationMs < MIN_DURATION_MS) {
        // Silently skip processing for audio clips less than 3 seconds
        return null
      }

      const buffer = Buffer.from(await audioEntry.arrayBuffer())
      if (buffer.byteLength === 0) {
        throw new Error('Received empty audio payload.')
      }

      const originalMimeType =
        (audioEntry.type && audioEntry.type.trim().length > 0
          ? audioEntry.type
          : getStringField(formData, 'mimeType')) || 'audio/webm'
      const mimeType = normalizeMimeType(originalMimeType)

      const filename =
        audioEntry.name && audioEntry.name.trim().length > 0
          ? audioEntry.name
          : `voice-${Date.now()}.webm`
      const extension =
        audioEntry.name && audioEntry.name.includes('.')
          ? audioEntry.name.split('.').pop()
          : undefined
      const isWebmFormat =
        mimeType === 'audio/webm' || (extension && extension.toLowerCase() === 'webm')

      const requestId = fields.requestId ?? randomUUID()
      requestIdForLogs = requestId

      logContext = {
        requestId,
        huddleId: fields.huddleId ?? null,
        huddleSlug: fields.huddleSlug ?? null,
        speakerId: fields.speakerId,
        conversationId: fields.conversationId ?? null,
        durationMs: fields.durationMs ?? null,
        mimeType,
        originalMimeType,
        isWebmFormat,
        audioBytes: buffer.byteLength,
        stage: 'transcription:prepare',
      }

      console.info('Processing voice transcription request', logContext)

      // Get user's API key if provided (for subscribed users)
      const userApiKey = getStringField(formData, 'userApiKey') || undefined
      const client = getOpenAIClient(userApiKey)
      const primaryModel =
        process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe'
      const fallbackModel = 'whisper-1'
      const fileForUpload = await toFile(buffer, filename, { type: mimeType })

      let transcription: Audio.Transcription
      let transcriptionModelUsed = primaryModel

      console.info('Submitting audio to transcription model', {
        ...logContext,
        model: primaryModel,
        stage: 'transcription:primary',
      })

      try {
        transcription = await client.audio.transcriptions.create({
          file: fileForUpload,
          model: primaryModel,
        })
      } catch (primaryError) {
        const serializedPrimaryError = await serializeError(primaryError)
        console.error('Primary transcription attempt failed', {
          ...logContext,
          model: primaryModel,
          stage: 'transcription:primary:error',
          error: serializedPrimaryError,
        })
        if (isUnsupportedAudioError(primaryError) && primaryModel !== fallbackModel) {
          console.warn(
            'Primary transcription model rejected format, retrying with fallback model.',
            { ...logContext, primaryModel, fallbackModel, stage: 'transcription:fallback:prepare' },
          )
          console.info('Retrying transcription with fallback model', {
            ...logContext,
            model: fallbackModel,
            stage: 'transcription:fallback',
          })
          try {
            transcription = await client.audio.transcriptions.create({
              file: fileForUpload,
              model: fallbackModel,
            })
            transcriptionModelUsed = fallbackModel
          } catch (fallbackError) {
            const serializedFallbackError = await serializeError(fallbackError)
            console.error('Fallback transcription attempt failed', {
              ...logContext,
              model: fallbackModel,
              stage: 'transcription:fallback:error',
              error: serializedFallbackError,
            })
            throw new Error(
              `OpenAI transcription failed after fallback: ${buildErrorSummary(serializedFallbackError)}`,
            )
          }
        } else {
          throw new Error(
            `OpenAI transcription failed: ${buildErrorSummary(serializedPrimaryError)}`,
          )
        }
      }

      const transcriptText = transcription.text?.trim()
      if (!transcriptText) {
        throw new Error('OpenAI did not return transcript text.')
      }

      const transcriptPreview =
        transcriptText.length > 120
          ? `${transcriptText.slice(0, 120)}…`
          : transcriptText

      console.info('Transcription completed', {
        ...logContext,
        stage: 'transcription:complete',
        model: transcriptionModelUsed,
        transcriptPreview,
        transcriptLength: transcriptText.length,
      })

      const runPostTranscription = async () => {
        const convexClient = new ConvexHttpClient(requireConvexUrl(), {
          logger: false,
        })

        const rawHuddleId = fields.huddleId ?? null
        const rawHuddleSlug = fields.huddleSlug ?? null

        if (rawHuddleId) {
          logContext.huddleId = rawHuddleId
        }
        if (rawHuddleSlug) {
          logContext.huddleSlug = rawHuddleSlug
        }

        const fetchHuddleBySlug = async (slug: string) => {
          logContext.stage = 'convex:getHuddle'
          logContext.huddleSlug = slug
          try {
            return await convexClient.query(api.huddle.getHuddle, {
              slug,
            })
          } catch (getHuddleError) {
            const serializedGetHuddleError = await serializeError(getHuddleError)
            console.error('Failed to load huddle by slug', {
              ...logContext,
              stage: 'convex:getHuddle:error',
              error: serializedGetHuddleError,
            })
            throw new StageError(
              'convex:getHuddle',
              `Convex query failed for slug ${slug}: ${buildErrorSummary(serializedGetHuddleError)}`,
              getHuddleError,
            )
          }
        }

        let resolvedSlug = rawHuddleSlug ?? null
        let fullHuddle =
          resolvedSlug !== null ? await fetchHuddleBySlug(resolvedSlug) : null

        if (!fullHuddle && rawHuddleId) {
          logContext.stage = 'convex:huddleById'
          try {
            const huddleById = await convexClient.query(api.huddle.getHuddleById, {
              id: rawHuddleId as Id<'huddles'>,
            })
            if (!huddleById) {
              console.warn('No huddle returned for provided huddleId', {
                ...logContext,
                stage: 'convex:huddleById:notFound',
              })
            } else {
              logContext.huddleId = huddleById._id
              resolvedSlug = huddleById.slug
              if (resolvedSlug) {
                fullHuddle = await fetchHuddleBySlug(resolvedSlug)
              }
            }
          } catch (huddleByIdError) {
            const serializedHuddleError = await serializeError(huddleByIdError)
            console.error('Failed to load huddle by id', {
              ...logContext,
              stage: 'convex:huddleById:error',
              error: serializedHuddleError,
            })
            throw new StageError(
              'convex:huddleById',
              `Convex query failed for huddleId ${rawHuddleId}: ${buildErrorSummary(serializedHuddleError)}`,
              huddleByIdError,
            )
          }
        }

        const resolvedHuddle = fullHuddle

        if (!resolvedHuddle) {
          throw new StageError(
            'convex:resolveHuddle',
            'Unable to resolve huddle from provided identifiers. Include a valid huddleSlug when invoking speakToHuddle.',
          )
        }

        const huddleId = resolvedHuddle._id as Id<'huddles'>
        resolvedSlug = resolvedHuddle.slug ?? resolvedSlug
        logContext.huddleId = huddleId
        logContext.huddleSlug = resolvedSlug

        const knownItems = resolvedHuddle.planningItems
          .map((item) => {
            const metadata = item.metadata as { itemKey?: string } | null | undefined
            const itemKey =
              metadata && typeof metadata.itemKey === 'string' ? metadata.itemKey : null
            if (!itemKey) {
              return null
            }
            return {
              itemKey,
              type: item.type,
              text: item.text,
            }
          })
          .filter(
            (
              value,
            ): value is {
              itemKey: string
              type: (typeof resolvedHuddle.planningItems)[number]['type']
              text: string
            } => value !== null,
          )

        console.info('Running transcript analysis for transcript', {
          ...logContext,
          stage: 'analysis:run',
          knownItemCount: knownItems.length,
        })

        logContext.stage = 'analysis:executing'
        const analysis = await runTranscriptAnalysis(
          {
            chunkId: `voice-${randomUUID()}`,
            speakerId: fields.speakerId,
            speakerLabel: fields.speakerLabel,
            text: transcriptText,
            knownItems: knownItems.length > 0 ? (knownItems as any) : undefined,
            conversationId: fields.conversationId ?? undefined,
            huddleId,
          },
          userApiKey, // Pass user's API key if provided
        )

        logContext.conversationId = analysis.conversationId ?? logContext.conversationId ?? null

        const normalizedActions = analysis.response.actions.map((action) => {
          if (action.kind === 'createItem') {
            return normalizeCreateAction(action)
          }
          if (action.kind === 'updateItem') {
            return normalizeUpdateAction(action)
          }
          if (action.kind === 'removeItem') {
            return normalizeRemoveAction(action)
          }
          // Fallback for unknown action types (should not happen with proper schema)
          return action
        })

        console.info('Transcript analysis produced actions', {
          ...logContext,
          stage: 'analysis:complete',
          actionCount: normalizedActions.length,
        })

        logContext.stage = 'convex:processVoiceTranscript'
        const mutationResult = await convexClient.mutation(
          api.huddle.processVoiceTranscript,
          {
            huddleId,
            speakerId: fields.speakerId,
            speakerLabel: fields.speakerLabel,
            text: transcriptText,
            actions: normalizedActions as any,
            conversationId: analysis.conversationId,
            transcriptMetadata: {
              transcriptionModel: transcriptionModelUsed,
              transcriptionUsage: transcription.usage ?? undefined,
              receivedMimeType: originalMimeType,
            },
            audio: {
              mimeType,
              size: buffer.byteLength,
              durationMs: fields.durationMs,
            },
            requestId,
          },
        )

        console.info('Voice transcription pipeline completed', {
          ...logContext,
          stage: 'complete',
          chunkId: mutationResult.chunkId,
          sequence: mutationResult.sequence,
        })

        return {
          transcript: {
            text: transcriptText,
            chunkId: mutationResult.chunkId,
            sequence: mutationResult.sequence,
          },
          mutation: mutationResult,
          conversationId: analysis.conversationId,
          requestId,
        }
      }

      const conversationKey = fields.conversationId ?? undefined
      if (conversationKey) {
        if (conversationQueues.has(conversationKey)) {
          console.info('Conversation busy, queuing new transcript', {
            ...logContext,
            stage: 'analysis:queued',
          })
        }
        return await withConversationLock(conversationKey, runPostTranscription)
      }

      return await runPostTranscription()
    } catch (error) {
      const serializedError = await serializeError(error)
      const summary = truncate(buildErrorSummary(serializedError), 600) ?? 'Unknown error'
      console.error('speakToHuddle failed', { ...logContext, error: serializedError })
      if (requestIdForLogs) {
        throw new Error(`Transcription failed (request ${requestIdForLogs}): ${summary}`)
      }
      throw new Error(`Transcription failed: ${summary}`)
    }
  })


