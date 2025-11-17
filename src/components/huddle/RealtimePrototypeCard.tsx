import { useRef, useEffect } from 'react'
import { Button } from '~/components/ui/button'

type RealtimePrototypeCardProps = {
    realtimeStatus: 'idle' | 'fetchingSecret' | 'ready' | 'connecting' | 'connected' | 'error'
    realtimeStatusLabel: string
    maskedRealtimeSecret: string | null
    realtimeCallId: string | null
    realtimeSecretExpiryLabel: string | null
    realtimeError: string | null
    isRealtimeSessionReady: boolean
    isHuddleCompleted: boolean
    isParticipant: boolean
    realtimeRemoteStream: MediaStream | null
    onToggleRecording: () => void
    onRefreshSecret: () => void
}

export function RealtimePrototypeCard({
    realtimeStatus,
    realtimeStatusLabel,
    maskedRealtimeSecret,
    realtimeCallId,
    realtimeSecretExpiryLabel,
    realtimeError,
    isRealtimeSessionReady,
    isHuddleCompleted,
    isParticipant,
    realtimeRemoteStream,
    onToggleRecording,
    onRefreshSecret,
}: RealtimePrototypeCardProps) {
    const realtimeAudioRef = useRef<HTMLAudioElement | null>(null)

    useEffect(() => {
        const element = realtimeAudioRef.current
        if (!element) {
            return
        }
        if (realtimeRemoteStream) {
            element.srcObject = realtimeRemoteStream
            const playback = element.play()
            if (playback instanceof Promise) {
                playback.catch((playError) => {
                    console.warn('[RealtimePrototype] Failed to autoplay remote audio', playError)
                })
            }
        } else {
            element.srcObject = null
        }
    }, [realtimeRemoteStream])

    return (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 text-sm shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/15">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-base font-semibold">Realtime prototype active</p>
                    <p className="text-xs uppercase tracking-wide">
                        {realtimeStatusLabel}
                    </p>
                    {maskedRealtimeSecret ? (
                        <p className="text-xs">
                            Client secret: {maskedRealtimeSecret}
                        </p>
                    ) : null}
                    {realtimeCallId ? (
                        <p className="text-xs">
                            Call ID: {realtimeCallId.split('/').pop()}
                        </p>
                    ) : null}
                    {realtimeSecretExpiryLabel ? (
                        <p className="text-xs">
                            {realtimeSecretExpiryLabel}
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        onClick={onToggleRecording}
                        disabled={
                            realtimeStatus === 'connecting' ||
                            isHuddleCompleted ||
                            !isParticipant
                        }
                    >
                        {realtimeStatus === 'connecting'
                            ? 'Connecting…'
                            : realtimeStatus === 'connected'
                                ? 'Disconnect stream'
                                : 'Connect stream'}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            void onRefreshSecret()
                        }}
                        disabled={
                            realtimeStatus === 'fetchingSecret' ||
                            realtimeStatus === 'connecting' ||
                            realtimeStatus === 'connected'
                        }
                    >
                        {realtimeStatus === 'fetchingSecret'
                            ? 'Refreshing…'
                            : 'Refresh secret'}
                    </Button>
                </div>
            </div>
            <audio ref={realtimeAudioRef} autoPlay playsInline className="hidden" />
            {realtimeError ? (
                <p className="mt-3 text-xs font-medium">
                    {realtimeError}
                </p>
            ) : null}
            {!realtimeError && !isRealtimeSessionReady ? (
                <p className="mt-3 text-xs">
                    Session details will appear once the prototype handshake succeeds.
                </p>
            ) : null}
        </div>
    )
}

