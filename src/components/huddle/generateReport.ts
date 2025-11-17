import type { PlanningItemType } from '~/types'
import { PLANNING_ITEM_TYPE_LABELS } from '~/types'
import type { TranscriptEntry } from './types'

type PlanningItem = {
    id: string
    type: PlanningItemType
    text: string
    timestamp: string
    order?: number
    blockedBy?: string[]
}

type HuddleData = {
    name: string
    createdAt: string
    endedAt?: string
    planningItems: PlanningItem[]
    transcriptChunks?: Array<{
        id: string
        payload: string
        createdAt: string
        metadata?: {
            speakerLabel?: string
            speakerId?: string
        }
    }>
}

export function generateHuddleReportMarkdown(huddle: HuddleData, transcriptEntries: TranscriptEntry[]): string {
    const lines: string[] = []

    // Title
    lines.push(`# ${huddle.name}`)
    lines.push('')

    // Group planning items by type
    const groupedItems: Record<PlanningItemType, PlanningItem[]> = {
        idea: [],
        task: [],
        dependency: [],
        owner: [],
        risk: [],
        outcome: [],
        decision: [],
        summary: [],
    }

    for (const item of huddle.planningItems) {
        groupedItems[item.type].push(item)
    }

    // Summary (if exists) - display right after title, before goals
    const summaryItem = groupedItems.summary[0]
    if (summaryItem) {
        lines.push(summaryItem.text)
        lines.push('')
    }

    // Sort items by order, then timestamp
    Object.keys(groupedItems).forEach((type) => {
        const items = groupedItems[type as PlanningItemType]
        items.sort((a, b) => {
            const orderA = a.order ?? Number.POSITIVE_INFINITY
            const orderB = b.order ?? Number.POSITIVE_INFINITY
            if (orderA !== orderB) return orderA - orderB
            return a.timestamp.localeCompare(b.timestamp)
        })
    })

    // Goals (outcomes)
    if (groupedItems.outcome.length > 0) {
        lines.push('## Goals')
        lines.push('')
        for (const goal of groupedItems.outcome) {
            lines.push(`- ${goal.text}`)
        }
        lines.push('')
    }

    // Ideas
    if (groupedItems.idea.length > 0) {
        lines.push('## Ideas')
        lines.push('')
        for (const idea of groupedItems.idea) {
            lines.push(`- ${idea.text}`)
        }
        lines.push('')
    }

    // Tasks
    if (groupedItems.task.length > 0) {
        lines.push('## Tasks')
        lines.push('')
        groupedItems.task.forEach((task, index) => {
            lines.push(`### Task #${index + 1}`)
            lines.push('')
            lines.push(task.text)
            lines.push('')
        })
    }

    // Other sections (risks, dependencies, decisions, owners)
    // Note: summary is displayed at the top, so it's excluded from here
    const otherSections: Array<{ type: PlanningItemType; label: string }> = [
        { type: 'risk', label: 'Risks' },
        { type: 'dependency', label: 'Dependencies' },
        { type: 'decision', label: 'Decisions' },
        { type: 'owner', label: 'Owners' },
    ]

    for (const section of otherSections) {
        const items = groupedItems[section.type]
        if (items.length > 0) {
            lines.push(`## ${section.label}`)
            lines.push('')
            for (const item of items) {
                lines.push(`- ${item.text}`)
            }
            lines.push('')
        }
    }

    // Transcript
    if (transcriptEntries.length > 0) {
        lines.push('## Transcript')
        lines.push('')
        let previousSpeaker: string | null = null
        for (const entry of transcriptEntries) {
            const speaker = entry.speakerLabel || 'Unknown'
            const timestamp = new Date(entry.createdAt).toLocaleTimeString()
            
            // Only show speaker name and add blank line when speaker changes
            if (speaker !== previousSpeaker) {
                // Add blank line before new speaker (except for first entry)
                if (previousSpeaker !== null) {
                    lines.push('')
                }
                lines.push(`**${speaker}** (${timestamp}):`)
                previousSpeaker = speaker
            }
            
            lines.push(entry.text)
        }
    }

    return lines.join('\n')
}

