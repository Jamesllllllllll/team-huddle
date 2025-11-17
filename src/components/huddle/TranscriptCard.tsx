import type { CSSProperties } from 'react'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { getInitials, getTranscriptBadgeClasses, getTranscriptBadgeLabel, truncateBadgeText } from './utils'
import { TRANSCRIPT_BADGE_BASE_CLASSES } from './constants'
import { formatTime } from '~/utils/dates'
import type {
    ParticipantListEntry,
    SpeakerStyle,
    TranscriptEntry,
} from './types'

type TranscriptCardProps<TParticipant extends ParticipantListEntry = ParticipantListEntry> = {
    entries: TranscriptEntry[]
    speakerStyles: Map<string, SpeakerStyle>
    participantsByUserId: Map<string, TParticipant>
    participantsByName: Map<string, TParticipant>
    fallbackSpeakerStyle: SpeakerStyle
    microphoneStatusMessage: string | null
    microphoneError: string | null
    lastRecordingDuration: number | null
}

export function TranscriptCard<TParticipant extends ParticipantListEntry = ParticipantListEntry>({
    entries,
    speakerStyles,
    participantsByUserId,
    participantsByName,
    fallbackSpeakerStyle,
    microphoneStatusMessage,
    microphoneError,
    lastRecordingDuration,
}: TranscriptCardProps<TParticipant>) {
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle>Transcript</CardTitle>
                    </div>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {microphoneStatusMessage ? (
                        <p className="font-medium text-amber-600">{microphoneStatusMessage}</p>
                    ) : null}
                    {microphoneError ? (
                        <p className="font-medium text-amber-600">{microphoneError}</p>
                    ) : null}
                    {lastRecordingDuration && process.env.NODE_ENV !== 'development' ? (
                        <p>Last clip: {(lastRecordingDuration / 1000).toFixed(1)}s</p>
                    ) : null}
                </div>
            </CardHeader>
            <CardContent>
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        The conversation hasn&apos;t started yet.
                    </p>
                ) : (
                    <div className="flex max-h-[520px] flex-col gap-6 overflow-y-auto pr-1">
                        {entries.map((entry, index) => {
                            const previousEntry = index > 0 ? entries[index - 1] : null
                            const normalizedSpeakerKey =
                                typeof entry.speakerKey === 'string' ? entry.speakerKey.trim() : ''
                            const normalizedSpeakerLabel =
                                typeof entry.speakerLabel === 'string' ? entry.speakerLabel.trim() : ''
                            const previousSpeakerKey =
                                typeof previousEntry?.speakerKey === 'string'
                                    ? previousEntry.speakerKey.trim()
                                    : ''
                            const isContinuation =
                                previousEntry !== null &&
                                normalizedSpeakerKey.length > 0 &&
                                normalizedSpeakerKey === previousSpeakerKey
                            const showSpeakerMeta = !isContinuation
                            const styleVars: CSSProperties =
                                (speakerStyles.get(normalizedSpeakerKey)?.style ??
                                    speakerStyles.get(entry.speakerKey)?.style ??
                                    fallbackSpeakerStyle.style) as CSSProperties
                            const participantLookupKey =
                                normalizedSpeakerLabel.length > 0
                                    ? normalizedSpeakerLabel.toLowerCase()
                                    : ''
                            const participantMatch =
                                (normalizedSpeakerKey.length > 0
                                    ? participantsByUserId.get(normalizedSpeakerKey)
                                    : undefined) ??
                                (participantLookupKey.length > 0
                                    ? participantsByName.get(participantLookupKey)
                                    : undefined)
                            const fallbackParticipantName =
                                normalizedSpeakerLabel.length > 0 ? normalizedSpeakerLabel : 'Participant'
                            const participantName =
                                typeof participantMatch?.displayName === 'string' &&
                                participantMatch.displayName.trim().length > 0
                                    ? participantMatch.displayName.trim()
                                    : fallbackParticipantName
                            const avatarUrl =
                                typeof participantMatch?.avatarUrl === 'string' &&
                                participantMatch.avatarUrl.trim().length > 0
                                    ? participantMatch.avatarUrl
                                    : null
                            const initials = getInitials(participantName)
                            return (
                                <div key={entry.id} className="flex items-start gap-4" style={styleVars}>
                                    <div className="flex w-[50px] flex-none justify-center pt-0.5">
                                        {showSpeakerMeta ? (
                                            <div className="transcript-avatar flex size-[50px] items-center justify-center overflow-hidden rounded-full border text-sm font-semibold uppercase">
                                                {avatarUrl ? (
                                                    <img
                                                        src={avatarUrl}
                                                        alt={`${participantName} avatar`}
                                                        className="size-full object-cover"
                                                    />
                                                ) : (
                                                    <span>{initials}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div aria-hidden />
                                        )}
                                    </div>
                                    <div
                                        className={`flex min-w-0 flex-1 flex-col gap-1${
                                            showSpeakerMeta ? '' : ' -mt-1'
                                        }`}
                                    >
                                        {showSpeakerMeta ? (
                                            <div className="flex flex-wrap items-baseline gap-2">
                                                <span className="transcript-speaker-name text-sm font-semibold leading-none">
                                                    {participantName}
                                                </span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400 leading-none">
                                                    {formatTime(entry.createdAt)}
                                                </span>
                                            </div>
                                        ) : null}
                                        <p className="transcript-message whitespace-pre-wrap text-sm leading-relaxed">
                                            {entry.text}
                                        </p>
                                        {entry.badges.length > 0 ? (
                                            <div className="flex flex-wrap gap-2 pt-2">
                                                {entry.badges.map((badge) => {
                                                    const badgeLabel = getTranscriptBadgeLabel(badge.type)
                                                    const badgeText = truncateBadgeText(badge.text)
                                                    const badgeClassName = `${TRANSCRIPT_BADGE_BASE_CLASSES} ${getTranscriptBadgeClasses(badge.type)}`
                                                    return (
                                                        <span key={`${entry.id}-${badge.id}`} className={badgeClassName}>
                                                            <span className="font-semibold">{badgeLabel} created:</span>
                                                            <span className="font-normal">{badgeText}</span>
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

