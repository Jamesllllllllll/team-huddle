import { useMicrophone } from '~/hooks/useMicrophone'
import type { PlanningItemType } from '~/types'

export type TranscriptBadge = {
    id: string
    type: PlanningItemType
    text: string
}

export type TranscriptEntry = {
    id: string
    text: string
    createdAt: string
    speakerLabel: string
    speakerKey: string
    badges: TranscriptBadge[]
}

export type SpeakerStyle = {
    style: Record<string, string>
}

export type TranscriptMetadata = {
    speakerId?: string
    speakerLabel?: string
    planningItemEvents?: Array<{
        kind?: string
        itemId?: string
        itemKey?: string
        itemType?: PlanningItemType
        itemText?: string
    }>
}

export type ParticipantListEntry = {
    id: string
    userId: string
    displayName?: string | null
    avatarUrl?: string | null
    role?: string | null
}

export type OverallRecordingStatus = 'idle' | 'recording'

export type RecordingMode = 'pushToTalk' | 'autoPushToTalk' | 'realtimePrototype'

export type MicrophoneControls = ReturnType<typeof useMicrophone>

