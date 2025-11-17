import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent } from '~/components/ui/card'
import { Clock } from 'lucide-react'
import { FREE_HUDDLE_DURATION_MS } from '~/shared/huddle'

type FreeHuddleTimerProps = {
    createdAt: string
    isCompleted: boolean
    onAutoEnd: () => void
    isOwner?: boolean
    hasActiveSubscription?: boolean
    onSubscribe?: () => void
}

export function FreeHuddleTimer({
    createdAt,
    isCompleted,
    onAutoEnd,
    isOwner = false,
    hasActiveSubscription = false,
    onSubscribe,
}: FreeHuddleTimerProps) {
    const [loading, setLoading] = useState(false)
    const [currentTime, setCurrentTime] = useState(Date.now())
    const hasCalledAutoEnd = useRef(false)

    useEffect(() => {
        if (isCompleted) {
            return
        }

        const interval = setInterval(() => {
            setCurrentTime(Date.now())
        }, 1000) // Update every second

        return () => clearInterval(interval)
    }, [isCompleted])

    const { remainingMs, isExpired } = useMemo(() => {
        const createdAtMs = new Date(createdAt).getTime()
        if (Number.isNaN(createdAtMs)) {
            return { remainingMs: 0, isExpired: true }
        }
        const elapsedMs = currentTime - createdAtMs
        const remainingMs = Math.max(0, FREE_HUDDLE_DURATION_MS - elapsedMs)
        const isExpired = remainingMs === 0

        return { remainingMs, isExpired }
    }, [createdAt, currentTime])

    // Auto-end when expired (only once) — any viewer can initiate; server validates expiration
    useEffect(() => {
        if (isExpired && !isCompleted && !hasCalledAutoEnd.current) {
            hasCalledAutoEnd.current = true
            onAutoEnd()
        }
    }, [isExpired, isCompleted, onAutoEnd])

    // Reset the flag if huddle is completed or reactivated
    useEffect(() => {
        if (isCompleted) {
            hasCalledAutoEnd.current = false
        }
    }, [isCompleted])

    // Don't show if already completed
    if (isCompleted) {
        return null
    }

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    const isWarning = remainingMs < 5 * 60 * 1000 // Less than 5 minutes remaining
    const isCritical = remainingMs < 2 * 60 * 1000 // Less than 2 minutes remaining

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-4 right-4 z-50 max-w-sm"
            >
                <Card
                    className={`shadow-lg py-3 ${
                        isCritical
                            ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950'
                            : isWarning
                              ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
                              : 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
                    }`}
                >
                    <CardContent className="px-3">
                        <div className="flex items-start gap-3">
                            <Clock
                                className={`mt-0.5 shrink-0 ${
                                    isCritical
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : isWarning
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-blue-600 dark:text-blue-400'
                                }`}
                                size={20}
                            />
                            <div className="flex-1 space-y-1">
                                <p
                                    className={`text-sm font-semibold ${
                                        isCritical
                                            ? 'text-rose-900 dark:text-rose-100'
                                            : isWarning
                                              ? 'text-amber-900 dark:text-amber-100'
                                              : 'text-blue-900 dark:text-blue-100'
                                    }`}
                                >
                                    Free Huddles are limited to {Math.floor(FREE_HUDDLE_DURATION_MS / 60000)} minutes
                                </p>
                                <p
                                    className={`text-xs ${
                                        isCritical
                                            ? 'text-rose-700 dark:text-rose-300'
                                            : isWarning
                                              ? 'text-amber-700 dark:text-amber-300'
                                              : 'text-blue-700 dark:text-blue-300'
                                    }`}
                                >
                                    Time remaining:{' '}
                                    <span className="font-mono font-semibold">
                                        {formatTime(remainingMs)}
                                    </span>
                                </p>
                                <p
                                    className={`text-xs ${
                                        isCritical
                                            ? 'text-rose-700 dark:text-rose-300'
                                            : isWarning
                                              ? 'text-amber-700 dark:text-amber-300'
                                              : 'text-blue-700 dark:text-blue-300'
                                    }`}
                                >
                    {isOwner && !hasActiveSubscription && onSubscribe ? (
                        <button
                            type="button"
                            onClick={async () => {
                                if (loading) return
                                setLoading(true)
                                await Promise.resolve(onSubscribe())
                            }}
                            disabled={loading}
                            className="cursor-pointer text-gray-900 dark:text-gray-100 underline underline-offset-2 hover:opacity-80 transition inline-flex items-center gap-1"
                        >
                            {loading ? (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                </svg>
                            ) : null}
                            {loading ? 'One moment…' : 'Upgrade to make this go away!'}
                        </button>
                    ) : (
                        'Huddle will end automatically when time expires'
                    )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </AnimatePresence>
    )
}

