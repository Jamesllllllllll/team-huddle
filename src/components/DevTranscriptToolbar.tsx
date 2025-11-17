import { useEffect, useMemo, useRef, useState } from 'react'
import { useConvexMutation } from '@convex-dev/react-query'
import toast from 'react-hot-toast'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { DEV_TRANSCRIPT_CHUNKS } from '~/dev/mockTranscript'
import {
  transcriptAnalysisResponseJsonSchema,
  requestTranscriptAnalysis,
  type TranscriptAnalysisResult,
} from '~/server/ai/transcriptAnalysis'
import type { DevSimulationAction } from '~/dev/simulationSchema'
import type { PlanningItemType } from '~/types'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'

type PlanningItemForDev = {
  id: Id<'planningItems'>
  metadata?: Record<string, unknown>
}

type TranscriptChunkForDev = {
  id: string
  sequence: number
  metadata?: Record<string, unknown>
}

type ComparisonDiff = {
  field: string
  expected: string | null
  actual: string | null
}

type ComparisonEntry = {
  key: string
  kind: DevSimulationAction['kind']
  expected?: DevSimulationAction
  actual?: DevSimulationAction
  differences: Array<ComparisonDiff>
}

type ComparisonSnapshot = {
  chunkId: string
  chunkLabel: string
  chunkText: string
  entries: Array<ComparisonEntry>
}

type DevTranscriptToolbarProps = {
  huddleId: Id<'huddles'>
  planningItems: Array<PlanningItemForDev>
  transcriptChunks: Array<TranscriptChunkForDev>
}

export function DevTranscriptToolbar({
  huddleId,
  planningItems,
  transcriptChunks,
}: DevTranscriptToolbarProps) {
  const createPlanningItem = useConvexMutation(api.huddle.createPlanningItem)
  const updatePlanningItem = useConvexMutation(api.huddle.updatePlanningItem)
  const deletePlanningItem = useConvexMutation(api.huddle.deletePlanningItem)
  const logTranscriptChunk = useConvexMutation(api.huddle.logTranscriptChunk)
  const resetDevState = useConvexMutation(api.huddle.resetHuddleDevState)

  const processedChunks = useMemo(
    () =>
      transcriptChunks.filter(
        (chunk) =>
          typeof chunk.metadata === 'object' &&
          chunk.metadata !== null &&
          (chunk.metadata as { devSimulation?: boolean }).devSimulation === true,
      ),
    [transcriptChunks],
  )

  const processedChunkCount = processedChunks.length

  const maxSequence = useMemo(() => {
    if (transcriptChunks.length === 0) return 0
    return transcriptChunks.reduce(
      (max, chunk) => Math.max(max, chunk.sequence ?? 0),
      0,
    )
  }, [transcriptChunks])

  const initialItemMap = useMemo(() => {
    const entries: Record<string, Id<'planningItems'>> = {}
    for (const item of planningItems) {
      const metadata = item.metadata as
        | { devSimulation?: boolean; itemKey?: string }
        | undefined
      if (metadata?.devSimulation && typeof metadata.itemKey === 'string') {
        entries[metadata.itemKey] = item.id
      }
    }
    return entries
  }, [planningItems])

  const sequenceRef = useRef<number>(maxSequence)
  const itemIdsRef = useRef<Record<string, Id<'planningItems'>>>(initialItemMap)
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(processedChunkCount, DEV_TRANSCRIPT_CHUNKS.length),
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [useOpenAI, setUseOpenAI] = useState(false)
  const [openAIRationale, setOpenAIRationale] = useState<string | null>(null)
  const [lastAIComparison, setLastAIComparison] =
    useState<ComparisonSnapshot | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  useEffect(() => {
    sequenceRef.current = maxSequence
  }, [maxSequence])

  useEffect(() => {
    itemIdsRef.current = initialItemMap
  }, [initialItemMap])

  useEffect(() => {
    if (!isProcessing) {
      setCurrentIndex((prev) =>
        processedChunkCount === prev
          ? prev
          : Math.min(processedChunkCount, DEV_TRANSCRIPT_CHUNKS.length),
      )
    }
  }, [processedChunkCount, isProcessing])

  useEffect(() => {
    if (!useOpenAI) {
      setOpenAIRationale(null)
      setLastAIComparison(null)
      setConversationId(null)
    }
  }, [useOpenAI])

  const nextChunk = DEV_TRANSCRIPT_CHUNKS[currentIndex]
  const remaining = DEV_TRANSCRIPT_CHUNKS.length - currentIndex

  const knownItemsForPrompt = useMemo(() => {
    const processed = DEV_TRANSCRIPT_CHUNKS.slice(0, currentIndex)
    const created = processed.flatMap((chunk) =>
      chunk.actions.filter(
        (action): action is Extract<DevSimulationAction, { kind: 'createItem' }> =>
          action.kind === 'createItem',
      ),
    )
    return created.map((action) => ({
      itemKey: action.itemKey,
      type: action.type,
      text: action.text,
    }))
  }, [currentIndex])

  async function executeAction(
    chunkId: string,
    action: DevSimulationAction,
    defaults: {
      speakerId: string
      speakerLabel: string
    },
  ) {
    if (action.kind === 'createItem') {
      const blockedBy =
        action.blockedByKeys
          ?.map((key) => itemIdsRef.current[key])
          .filter(
            (value): value is Id<'planningItems'> => Boolean(value),
          ) ?? []

      try {
        const metadata: Record<string, unknown> = {
          devSimulation: true,
          itemKey: action.itemKey,
          sourceChunkId: chunkId,
        }
        // Always set needsResearch to a boolean for ideas (never undefined or null)
        if (action.type === 'idea') {
          metadata.needsResearch = action.needsResearch === true
        }
        
        const newId = await createPlanningItem({
          huddleId,
          type: action.type,
          text: action.text,
          timestamp: new Date().toISOString(),
          speakerId: defaults.speakerId,
          speakerLabel: action.speakerLabel ?? defaults.speakerLabel,
          metadata,
          blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
        })

        itemIdsRef.current[action.itemKey] = newId
      } catch (error) {
        console.error('Failed to create planning item from dev action', error)
        toast.error('Failed to create planning item.')
        throw error
      }
      return
    }

    if (action.kind === 'updateItem') {
      const targetId = itemIdsRef.current[action.targetKey]
      if (!targetId) {
        console.warn(
          `Dev simulation skipped update: missing item for key ${action.targetKey}`,
        )
        return
      }

      const blockedBy =
        action.patch.blockedByKeys
          ?.map((key) => itemIdsRef.current[key])
          .filter(
            (value): value is Id<'planningItems'> => Boolean(value),
          ) ?? undefined
      const textPatch =
        action.patch.text === null ? undefined : action.patch.text

      try {
        await updatePlanningItem({
          id: targetId as Id<'planningItems'>,
          huddleId,
          text: textPatch,
          blockedBy,
        })
      } catch (error) {
        console.error('Failed to update planning item from dev action', error)
        toast.error('Failed to update planning item.')
        throw error
      }
      return
    }

    if (action.kind === 'removeItem') {
      const targetId = itemIdsRef.current[action.targetKey]
      if (!targetId) {
        console.warn(
          `Dev simulation skipped removal: missing item for key ${action.targetKey}`,
        )
        return
      }

      try {
        await deletePlanningItem({ id: targetId, huddleId })
        delete itemIdsRef.current[action.targetKey]
      } catch (error) {
        console.error('Failed to remove planning item from dev action', error)
        toast.error('Failed to remove planning item.')
        throw error
      }
      return
    }
  }

  async function handlePlayNext() {
    if (!nextChunk) {
      return
    }

    setIsProcessing(true)
    const sequence = sequenceRef.current + 1

    try {
      let actionsToExecute: Array<DevSimulationAction>
      if (useOpenAI) {
        try {
          const aiResult: TranscriptAnalysisResult = await requestTranscriptAnalysis({
            data: {
              chunkId: nextChunk.id,
              speakerId: nextChunk.speakerId,
              speakerLabel: nextChunk.speakerLabel,
              text: nextChunk.text,
              knownItems:
                knownItemsForPrompt.length > 0 ? knownItemsForPrompt : undefined,
              conversationId: conversationId ?? undefined,
              huddleId,
            },
          })
          actionsToExecute = aiResult.response.actions
          setOpenAIRationale(aiResult.response.rationale ?? null)
          setConversationId(aiResult.conversationId)
          setLastAIComparison(
            buildComparisonSnapshot(
              nextChunk,
              aiResult.response.actions,
              nextChunk.actions,
            ),
          )
        } catch (error) {
          console.error('Failed to fetch OpenAI structured actions', error)
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to fetch structured actions from OpenAI.'
          toast.error(message)
          setLastAIComparison(null)
          return
        }
      } else {
        actionsToExecute = nextChunk.actions
        setOpenAIRationale(null)
        setLastAIComparison(null)
        setConversationId(null)
      }

      await logTranscriptChunk({
        huddleId,
        sequence,
        source: 'transcript',
        payload: nextChunk.text,
        createdAt: new Date().toISOString(),
        metadata: {
          devSimulation: true,
          chunkId: nextChunk.id,
          speakerId: nextChunk.speakerId,
          speakerLabel: nextChunk.speakerLabel,
          source: useOpenAI ? 'openai' : 'mock',
        },
      })

      sequenceRef.current = sequence

      for (const action of actionsToExecute) {
        await executeAction(nextChunk.id, action, {
          speakerId: nextChunk.speakerId,
          speakerLabel: nextChunk.speakerLabel,
        })
      }

      setCurrentIndex((prev) => Math.min(prev + 1, DEV_TRANSCRIPT_CHUNKS.length))
      toast.success('Processed the next transcript entry.')
    } catch (error) {
      console.error('Failed to process dev transcript entry', error)
      toast.error('Failed to process transcript entry.')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleReset() {
    setIsProcessing(true)
    try {
      await resetDevState({ huddleId })
      itemIdsRef.current = {} as Record<string, Id<'planningItems'>>
      sequenceRef.current = 0
      setCurrentIndex(0)
      setLastAIComparison(null)
      setConversationId(null)
      toast.success('Reset dev simulation state.')
    } catch (error) {
      console.error('Failed to reset dev simulation state', error)
      toast.error('Failed to reset dev state.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <aside className="sticky top-6 hidden h-fit w-80 shrink-0 flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow lg:flex dark:border-gray-700 dark:bg-gray-900">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">Dev Transcript Playback</h2>
          <p className="text-xs text-slate-500">
            Simulate a short huddle conversation and stream AI updates.
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-gray-800 dark:text-slate-300">
          {currentIndex}/{DEV_TRANSCRIPT_CHUNKS.length}
        </span>
      </header>

      <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 dark:border-gray-700 dark:text-slate-200">
        <span>Use OpenAI responses</span>
        <div className="flex items-center gap-2">
          <Switch
            checked={useOpenAI}
            onCheckedChange={(checked) => setUseOpenAI(checked)}
            disabled={isProcessing}
            aria-label="Toggle OpenAI responses"
          />
          <span>{useOpenAI ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-gray-700">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Next up
        </p>
        {nextChunk ? (
          <div className="space-y-1">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {nextChunk.speakerLabel}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              “{nextChunk.text}”
            </p>
            <div className="pt-2">
              <p className="text-xs font-medium uppercase text-slate-500">
                Planned actions
              </p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {(useOpenAI ? [] : nextChunk.actions).map((action, index) => (
                  <li key={index}>
                    {describeAction(action)}
                  </li>
                ))}
              </ul>
              {useOpenAI ? (
                <p className="text-xs italic text-slate-500 dark:text-slate-400">
                  Actions will be generated dynamically by OpenAI.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            All transcript entries processed.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={handlePlayNext}
          disabled={!nextChunk || isProcessing}
          className="w-full bg-blue-600 text-white shadow disabled:cursor-not-allowed disabled:bg-blue-300 hover:bg-blue-700 focus-visible:outline-blue-600"
        >
          {nextChunk ? 'Send next message' : 'Completed'}
        </Button>
        <Button
          type="button"
          onClick={handleReset}
          disabled={isProcessing || (currentIndex === 0 && sequenceRef.current === 0)}
          variant="outline"
          className="w-full border-slate-300 text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
        >
          Reset Simulation
        </Button>
      </div>

      {openAIRationale ? (
        <div className="space-y-1 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/30 dark:text-blue-100">
          <p className="font-semibold uppercase tracking-wide">AI rationale</p>
          <p>{openAIRationale}</p>
        </div>
      ) : null}

      {lastAIComparison ? (
        <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-100">
          <header className="space-y-1">
            <p className="font-semibold uppercase tracking-wide">
              AI vs canned output
            </p>
            <p className="font-medium text-purple-900 dark:text-purple-100">
              {lastAIComparison.chunkLabel}: “{lastAIComparison.chunkText}”
            </p>
          </header>

          <div className="space-y-3">
            {lastAIComparison.entries.length === 0 ? (
              <p className="text-xs text-purple-800 dark:text-purple-200">
                No structured actions were produced.
              </p>
            ) : (
              lastAIComparison.entries.map((entry) => {
                const expectedSummary = entry.expected
                  ? describeAction(entry.expected)
                  : '—'
                const actualSummary = entry.actual
                  ? describeAction(entry.actual)
                  : '—'
                const hasDifferences = entry.differences.length > 0

                return (
                  <div
                    key={entry.key}
                    className="rounded-md border border-purple-200/70 bg-white/60 p-2 text-purple-900 shadow-sm dark:border-purple-900/40 dark:bg-purple-900/30 dark:text-purple-100"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-200">
                        {entry.kind} · {entry.key}
                      </span>
                      {hasDifferences ? (
                        <span className="rounded bg-purple-600/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                          Differs
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-600/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                          Matches
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-1 text-[11px]">
                      <p>
                        <span className="font-semibold">Expected:</span>{' '}
                        {expectedSummary}
                      </p>
                      <p>
                        <span className="font-semibold">Actual:</span>{' '}
                        {actualSummary}
                      </p>
                    </div>
                    {hasDifferences ? (
                      <ul className="mt-2 space-y-1 rounded-md bg-purple-100/70 p-2 text-[11px] text-purple-900 dark:bg-purple-950/50 dark:text-purple-100">
                        {entry.differences.map((difference) => (
                          <li key={difference.field}>
                            <span className="font-semibold capitalize">
                              {difference.field}:
                            </span>{' '}
                            <span className="line-through opacity-70">
                              {difference.expected ?? '—'}
                            </span>{' '}
                            <span className="font-semibold">
                              → {difference.actual ?? '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Remaining turns: {remaining}
      </p>

      <details className="rounded-md border border-slate-200 p-3 text-xs text-slate-600 dark:border-gray-700 dark:text-slate-300">
        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-100">
          Structured output schema
        </summary>
        <pre className="mt-2 max-h-60 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100 dark:bg-slate-800">
          {JSON.stringify(transcriptAnalysisResponseJsonSchema, null, 2)}
        </pre>
      </details>
    </aside>
  )
}

function buildComparisonSnapshot(
  chunk: { id: string; speakerLabel: string; text: string },
  actualActions: Array<DevSimulationAction>,
  expectedActions: Array<DevSimulationAction>,
): ComparisonSnapshot {
  return {
    chunkId: chunk.id,
    chunkLabel: chunk.speakerLabel,
    chunkText: chunk.text,
    entries: compareActions(actualActions, expectedActions),
  }
}

function compareActions(
  actualActions: Array<DevSimulationAction>,
  expectedActions: Array<DevSimulationAction>,
): Array<ComparisonEntry> {
  const expectedKeys = expectedActions.map(actionIdentifier)
  const actualKeys = actualActions.map(actionIdentifier)
  const allKeys: Array<string> = []

  for (const key of expectedKeys) {
    if (!allKeys.includes(key)) {
      allKeys.push(key)
    }
  }

  for (const key of actualKeys) {
    if (!allKeys.includes(key)) {
      allKeys.push(key)
    }
  }

  const expectedMap = new Map(
    expectedActions.map((action) => [actionIdentifier(action), action] as const),
  )
  const actualMap = new Map(
    actualActions.map((action) => [actionIdentifier(action), action] as const),
  )

  return allKeys.map((key) => {
    const expected = expectedMap.get(key)
    const actual = actualMap.get(key)
    const resolvedKind: DevSimulationAction['kind'] =
      actual?.kind ?? expected?.kind ?? 'createItem'

    const differences: Array<ComparisonDiff> = []

    if (!expected && actual) {
      differences.push({
        field: 'action',
        expected: '—',
        actual: describeAction(actual),
      })
    } else if (expected && !actual) {
      differences.push({
        field: 'action',
        expected: describeAction(expected),
        actual: '—',
      })
    } else if (expected && actual) {
      if (actual.kind !== expected.kind) {
        differences.push({
          field: 'kind',
          expected: expected.kind,
          actual: actual.kind,
        })
      }

      if (actual.kind === 'createItem' && expected.kind === 'createItem') {
        if (actual.type !== expected.type) {
          differences.push({
            field: 'type',
            expected: expected.type,
            actual: actual.type,
          })
        }

        if (normalizeWhitespace(actual.text) !== normalizeWhitespace(expected.text)) {
          differences.push({
            field: 'text',
            expected: expected.text,
            actual: actual.text,
          })
        }

        if (
          formatBlockedByList(actual.blockedByKeys) !==
          formatBlockedByList(expected.blockedByKeys)
        ) {
          differences.push({
            field: 'blockedBy',
            expected: formatBlockedByList(expected.blockedByKeys),
            actual: formatBlockedByList(actual.blockedByKeys),
          })
        }

        if (normalizeSpeakerLabel(actual.speakerLabel) !== normalizeSpeakerLabel(expected.speakerLabel)) {
          differences.push({
            field: 'speakerLabel',
            expected: normalizeSpeakerLabel(expected.speakerLabel),
            actual: normalizeSpeakerLabel(actual.speakerLabel),
          })
        }
      }

      if (actual.kind === 'updateItem' && expected.kind === 'updateItem') {
        if (
          normalizeOptionalText(actual.patch.text) !==
          normalizeOptionalText(expected.patch.text)
        ) {
          differences.push({
            field: 'text',
            expected: normalizeOptionalText(expected.patch.text),
            actual: normalizeOptionalText(actual.patch.text),
          })
        }

        if (
          formatBlockedByList(actual.patch.blockedByKeys) !==
          formatBlockedByList(expected.patch.blockedByKeys)
        ) {
          differences.push({
            field: 'blockedBy',
            expected: formatBlockedByList(expected.patch.blockedByKeys),
            actual: formatBlockedByList(actual.patch.blockedByKeys),
          })
        }
      }

      if (actual.kind === 'removeItem' && expected.kind === 'removeItem') {
        if (actual.targetKey !== expected.targetKey) {
          differences.push({
            field: 'targetKey',
            expected: expected.targetKey,
            actual: actual.targetKey,
          })
        }
      }
    }

    return {
      key,
      kind: resolvedKind,
      expected,
      actual,
      differences,
    }
  })
}

function actionIdentifier(action: DevSimulationAction) {
  if (action.kind === 'createItem') {
    return `create:${action.itemKey}`
  }

  if (action.kind === 'updateItem') {
    return `update:${action.targetKey}`
  }

  if (action.kind === 'removeItem') {
    return `remove:${action.targetKey}`
  }

  return 'unknown'
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeOptionalText(value: string | null) {
  if (value === null) return 'unchanged'
  return normalizeWhitespace(value)
}

function formatBlockedByList(blockedByKeys: Array<string> | null | undefined) {
  if (!blockedByKeys || blockedByKeys.length === 0) {
    return 'none'
  }
  return blockedByKeys.join(', ')
}

function normalizeSpeakerLabel(label: string | null | undefined) {
  if (!label) return 'default'
  return label
}

function describeAction(action: DevSimulationAction) {
  if (action.kind === 'createItem') {
    const label = toTitleCase(action.type)
    const blocked =
      action.blockedByKeys && action.blockedByKeys.length > 0
        ? ` (blocked by ${action.blockedByKeys.join(', ')})`
        : ''
    return `${label}: ${action.text}${blocked}`
  }

  if (action.kind === 'updateItem') {
    return `Update ${action.targetKey}`
  }

  if (action.kind === 'removeItem') {
    return `Remove ${action.targetKey}`
  }

  return 'Unknown action'
}

function toTitleCase(value: PlanningItemType) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

