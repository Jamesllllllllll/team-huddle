import { useMemo, useState, useEffect } from 'react'
import { Mic, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Switch } from '~/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import type { OverallRecordingStatus } from './types'

const MIC_PERMISSION_TOOLTIP_DISMISSED_KEY = 'huddle:mic-permission-tooltip-dismissed'

type RecordingControlsCardProps = {
    isDetectionSwitchOn: boolean
    autoDetectionActive: boolean
    overallRecordingStatus: OverallRecordingStatus
    onDetectionSwitchChange: (checked: boolean) => void
    onToggleRecording: () => void
    buttonDisabled: boolean
    buttonColorClass: string
    micIconColorClass: string
    showRecordingEqualizer: boolean
    buttonLabel: string
    primaryStatus: string
    turnCountLabel?: string | null
    isParticipant: boolean
    microphonePermission: 'granted' | 'denied' | 'prompt' | 'pending' | 'idle' | null
}

export function RecordingControlsCard({
    isDetectionSwitchOn,
    autoDetectionActive,
    overallRecordingStatus,
    onDetectionSwitchChange,
    onToggleRecording,
    buttonDisabled,
    buttonColorClass,
    micIconColorClass,
    showRecordingEqualizer,
    buttonLabel,
    primaryStatus,
    turnCountLabel,
    isParticipant,
    microphonePermission,
}: RecordingControlsCardProps) {
    // Check if tooltip was previously dismissed
    const [isTooltipDismissed, setIsTooltipDismissed] = useState(() => {
        if (typeof window === 'undefined') return false
        try {
            return localStorage.getItem(MIC_PERMISSION_TOOLTIP_DISMISSED_KEY) === 'true'
        } catch {
            return false
        }
    })

    // Determine tooltip text based on participant status and mic permission
    const tooltipText = useMemo(() => {
        if (!isParticipant) {
            return null // No tooltip if not a participant
        }
        if (microphonePermission !== 'granted') {
            return 'Give Mic Permission'
        }
        return null // Don't show tooltip when permission is granted
    }, [isParticipant, microphonePermission])

    // Force show tooltip if permission not granted and not dismissed
    const shouldForceShowTooltip = useMemo(() => {
        return (
            isParticipant &&
            microphonePermission !== 'granted' &&
            !isTooltipDismissed &&
            tooltipText !== null
        )
    }, [isParticipant, microphonePermission, isTooltipDismissed, tooltipText])

    const [isTooltipOpen, setIsTooltipOpen] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false
        try {
            const wasDismissed = localStorage.getItem(MIC_PERMISSION_TOOLTIP_DISMISSED_KEY) === 'true'
            const hasTooltip = isParticipant && microphonePermission !== 'granted'
            return hasTooltip && !wasDismissed
        } catch {
            return false
        }
    })

    // Sync tooltip state when shouldForceShowTooltip changes
    useEffect(() => {
        if (shouldForceShowTooltip) {
            setIsTooltipOpen(true)
        } else if (microphonePermission === 'granted' || isTooltipDismissed) {
            setIsTooltipOpen(false)
        }
    }, [shouldForceShowTooltip, microphonePermission, isTooltipDismissed])

    // Prevent tooltip from opening on hover unless we want to force show it
    const handleTooltipOpenChange = (open: boolean) => {
        // Only allow opening if we're forcing it to show
        if (open && shouldForceShowTooltip) {
            setIsTooltipOpen(true)
        } else {
            setIsTooltipOpen(false)
        }
    }

    // Clear dismissal state when permission is granted
    useEffect(() => {
        if (microphonePermission === 'granted') {
            setIsTooltipOpen(false)
            try {
                localStorage.removeItem(MIC_PERMISSION_TOOLTIP_DISMISSED_KEY)
                setIsTooltipDismissed(false)
            } catch {
                // Ignore localStorage errors
            }
        }
    }, [microphonePermission])

    const handleDismissTooltip = () => {
        setIsTooltipOpen(false)
        try {
            localStorage.setItem(MIC_PERMISSION_TOOLTIP_DISMISSED_KEY, 'true')
            setIsTooltipDismissed(true)
        } catch {
            // Ignore localStorage errors
        }
    }
    return (
        <div className="text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide">
                        {isDetectionSwitchOn ? 'Auto-record' : 'Tap to record'}
                    </span>
                    <Switch
                        checked={isDetectionSwitchOn}
                        onCheckedChange={onDetectionSwitchChange}
                        aria-label="Toggle automatic speech detection"
                    />
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 items-start">
                {tooltipText ? (
                    <Tooltip
                        open={isTooltipOpen}
                        onOpenChange={handleTooltipOpenChange}
                    >
                        <TooltipTrigger
                            asChild>
                            <motion.button
                                type="button"
                                onClick={onToggleRecording}
                                disabled={buttonDisabled}
                                layout
                                transition={{
                                    layout: { duration: 0.3, ease: 'easeInOut' }
                                }}
                                className={`cursor-pointer group relative flex items-center gap-4 rounded-full px-6 py-3 text-lg font-semibold text-white transition-colors focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${buttonColorClass}`}
                                aria-pressed={
                                    isDetectionSwitchOn ? autoDetectionActive : overallRecordingStatus === 'recording'
                                }
                            >
                                <span className="relative flex items-center gap-4">
                                    <span className="grid size-11 place-items-center rounded-full bg-white/15 shadow-inner">
                                        <Mic className={`size-6 drop-shadow-sm ${micIconColorClass}`} strokeWidth={1.8} />
                                    </span>
                                    <span className="flex items-center gap-3">
                                        <span>{buttonLabel}</span>
                                        {showRecordingEqualizer ? (
                                            <span className="recording-equalizer ml-1 flex h-4 items-end gap-[3px]">
                                                <span />
                                                <span />
                                                <span />
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                            </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end">
                            <div className="flex items-center gap-2">
                                <p>{tooltipText}</p>
                                {shouldForceShowTooltip && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDismissTooltip()
                                        }}
                                        className="ml-1 -mr-1 flex items-center justify-center rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-background/50"
                                        aria-label="Dismiss tooltip"
                                    >
                                        <X className="size-3" />
                                    </button>
                                )}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <motion.button
                        type="button"
                        onClick={onToggleRecording}
                        disabled={buttonDisabled}
                        layout
                        transition={{
                            layout: { duration: 0.3, ease: 'easeInOut' }
                        }}
                        className={`cursor-pointer group relative flex items-center gap-4 rounded-full px-6 py-3 text-lg font-semibold text-white transition-colors focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${buttonColorClass}`}
                        aria-pressed={
                            isDetectionSwitchOn ? autoDetectionActive : overallRecordingStatus === 'recording'
                        }
                    >
                        <span className="relative flex items-center gap-4">
                            <span className="grid size-11 place-items-center rounded-full bg-white/15 shadow-inner">
                                <Mic className={`size-6 drop-shadow-sm ${micIconColorClass}`} strokeWidth={1.8} />
                            </span>
                            <span className="flex items-center gap-3">
                                <span>{buttonLabel}</span>
                                {showRecordingEqualizer ? (
                                    <span className="recording-equalizer ml-1 flex h-4 items-end gap-[3px]">
                                        <span />
                                        <span />
                                        <span />
                                    </span>
                                ) : null}
                            </span>
                        </span>
                    </motion.button>
                )}
            </div>
        </div>
    )
}

