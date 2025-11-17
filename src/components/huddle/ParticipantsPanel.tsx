import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '~/hooks/use-is-mobile'
import { Button } from '~/components/ui/button'
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '~/components/ui/accordion'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import { Switch } from '~/components/ui/switch'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'
import { getInitials } from './utils'
import type { ParticipantListEntry } from './types'
import { Spinner } from '~/components/ui/Spinner'
import { motion, AnimatePresence } from 'motion/react'
import { SignedOut, SignInButton } from '@clerk/clerk-react'
import { Sparkles, Copy } from 'lucide-react'
import toast from 'react-hot-toast'


type ParticipantsPanelProps<T extends ParticipantListEntry = ParticipantListEntry> = {
    participants: T[]
    observers: T[]
    speakingUserIds: Set<string>
    recordingUserIds: Set<string>
    currentUserId?: string | null
    isParticipant: boolean
    isJoining: boolean
    isLeaving: boolean
    isOwner: boolean
    isHuddleActive: boolean
    isStartPending: boolean
    isEndPending: boolean
    canJoin: boolean
    isInviteOnly: boolean
    invitedUserIds: string[]
    isPrivate?: boolean
    canTogglePrivate?: boolean
    privateAccessKey?: string | null
    huddleSlug?: string
    isFreeLimitExceeded?: boolean
    isOwnerHasNoSubscription?: boolean
    canShowHuddleAction?: boolean
    onSubscribe?: () => void
    onStartHuddle: () => Promise<void> | void
    onEndHuddle: () => Promise<void> | void
    onJoin: () => void
    onLeave: () => void
    onToggleInviteOnly: (enabled: boolean) => Promise<void> | void
    onTogglePrivate?: (enabled: boolean) => Promise<void> | void
    onInviteUser: (userId: string, displayName?: string, avatarUrl?: string) => Promise<void> | void
    onRemoveInvite: (userId: string) => Promise<void> | void
}

export function ParticipantsPanel<T extends ParticipantListEntry = ParticipantListEntry>({
    participants,
    observers,
    speakingUserIds,
    recordingUserIds,
    currentUserId,
    isParticipant,
    isJoining,
    isLeaving,
    isOwner,
    isHuddleActive,
    isStartPending,
    isEndPending,
    canJoin,
    isInviteOnly,
    invitedUserIds,
    isPrivate = false,
    canTogglePrivate = false,
    privateAccessKey = null,
    huddleSlug = '',
    isFreeLimitExceeded = false,
    isOwnerHasNoSubscription = false,
    canShowHuddleAction = false,
    onSubscribe,
    onStartHuddle,
    onEndHuddle,
    onJoin,
    onLeave,
    onToggleInviteOnly,
    onTogglePrivate,
    onInviteUser,
    onRemoveInvite,
}: ParticipantsPanelProps<T>) {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const [inviteUserId, setInviteUserId] = useState('')
    const [isInvitePending, setIsInvitePending] = useState(false)
    const { isMobile } = useIsMobile()
    const [accordionValue, setAccordionValue] = useState<string>(() => {
        // Start expanded on desktop, collapsed on mobile
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            return 'participants'
        }
        return ''
    })
    
    useEffect(() => {
        // On desktop, always keep expanded; on mobile, allow collapsing
        if (!isMobile) {
            setAccordionValue('participants')
        }
    }, [isMobile])

    const huddleActionLabel = isHuddleActive ? 'End huddle' : 'Start huddle'
    const huddleActionPendingLabel = isHuddleActive ? 'Ending…' : 'Starting…'
    const huddleActionDescription = useMemo(() => {
        if (isHuddleActive) {
            return 'Ending the huddle will stop new recordings and mark the session as complete.'
        }
        return 'Starting the huddle will allow participants to begin contributing and recording.'
    }, [isHuddleActive])

    const handleConfirm = useCallback(async () => {
        try {
            if (isHuddleActive) {
                await onEndHuddle()
            } else {
                await onStartHuddle()
            }
        } finally {
            setIsConfirmOpen(false)
        }
    }, [isHuddleActive, onEndHuddle, onStartHuddle])

    const huddleActionDisabled = isHuddleActive ? isEndPending : isStartPending

    const handleCopyShareLink = useCallback(async () => {
        if (typeof window === 'undefined') return

        // Build the URL with shareKey if private
        const baseUrl = window.location.origin
        let url = `${baseUrl}/huddles/${huddleSlug}`

        if (isPrivate && privateAccessKey) {
            url += `?shareKey=${encodeURIComponent(privateAccessKey)}`
        }

        try {
            if (navigator && 'clipboard' in navigator) {
                await navigator.clipboard.writeText(url)
            } else {
                const textarea = document.createElement('textarea')
                textarea.value = url
                textarea.style.position = 'fixed'
                textarea.style.opacity = '0'
                document.body.appendChild(textarea)
                textarea.focus()
                textarea.select()
                document.execCommand('copy')
                document.body.removeChild(textarea)
            }
            toast.success('Invite link copied')
        } catch (error) {
            console.error('Failed to copy link', error)
            toast.error('Failed to copy link')
        }
    }, [huddleSlug, isPrivate, privateAccessKey])

    // Compact participant list for mobile collapsed view
    const compactParticipantsView = (
        <div className="flex flex-wrap items-center gap-2">
            {participants.map((participant) => {
                const rawName = typeof participant.displayName === 'string' ? participant.displayName.trim() : ''
                const hasName = rawName.length > 0
                const safeName = hasName ? rawName : 'Anonymous'
                const initials = hasName ? getInitials(rawName) : '??'
                const isSpeaking = speakingUserIds.has(participant.userId)
                const isRecording = recordingUserIds.has(participant.userId) || isSpeaking
                const status = isRecording ? 'recording' : 'participating'
                const statusColor = isRecording ? 'bg-rose-500' : 'bg-emerald-500'
                
                return (
                    <div key={participant.id} className="flex items-center gap-1.5">
                        <div className="relative">
                            {isRecording && (
                                <motion.div
                                    className="absolute inset-0 rounded-full bg-rose-500/30"
                                    animate={{
                                        scale: [1, 1.5, 1.5],
                                        opacity: [0.6, 0, 0],
                                    }}
                                    transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: 'easeOut',
                                    }}
                                />
                            )}
                            <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold uppercase text-slate-700 dark:border-gray-600 dark:bg-gray-800 dark:text-slate-200 relative">
                                {participant.avatarUrl ? (
                                    <img
                                        src={participant.avatarUrl}
                                        alt={`${safeName} avatar`}
                                        className="size-full object-cover"
                                    />
                                ) : (
                                    <span>{initials}</span>
                                )}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white dark:border-gray-900 ${statusColor}`} />
                        </div>
                        <span className="text-xs font-medium truncate max-w-[80px]">{safeName}</span>
                    </div>
                )
            })}
        </div>
    )

    return (
        <Card className="gap-2 pb-0 rounded-b-lg">
            <Accordion 
                type="single" 
                collapsible 
                value={isMobile ? accordionValue : 'participants'}
                onValueChange={(value) => {
                    // On desktop, always keep expanded
                    if (!isMobile) {
                        setAccordionValue('participants')
                    } else {
                        setAccordionValue(value || '')
                    }
                }}
                className="w-full"
            >
                <AccordionItem value="participants" className="border-none">
                    <CardHeader className="pb-2">
                        <AccordionTrigger className="lg:pointer-events-none lg:opacity-100 [&>svg]:lg:hidden hover:no-underline py-2">
                            <CardTitle className="text-left">Participants</CardTitle>
                        </AccordionTrigger>
                        {/* Show compact view when collapsed on mobile */}
                        {accordionValue !== 'participants' && (
                            <div className="lg:hidden py-2">
                                {participants.length === 0 ? (
                                    <p className="italic text-sm">No active collaborators yet.</p>
                                ) : (
                                    compactParticipantsView
                                )}
                            </div>
                        )}
                        {!isParticipant && accordionValue === 'participants' ? (
                            <p className="text-sm pt-2">
                                You&apos;re currently observing. Join to appear in the participant list and share updates.
                            </p>
                        ) : null}
                    </CardHeader>
                    <CardContent className="flex flex-col text-sm pt-0">
                        <AccordionContent className="lg:block">
                            <section className="m-0 py-4">
                                {participants.length === 0 ? (
                                    <p className="italic">No active collaborators yet.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {participants.map((participant) => (
                                            <li key={participant.id}>
                                                <ParticipantRow
                                                    participant={participant}
                                                    isObserver={false}
                                                    speakingUserIds={speakingUserIds}
                                                    recordingUserIds={recordingUserIds}
                                                    currentUserId={currentUserId}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                            <section className="flex flex-col gap-4 border-t py-4 m-0">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold uppercase tracking-wide">
                                        Observers
                                    </h4>
                                </div>
                                {observers.length === 0 ? (
                                    <p className="italic text-muted-foreground">No observers at the moment.</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {observers.map((participant) => (
                                            <li key={participant.id}>
                                                <ParticipantRow
                                                    participant={participant}
                                                    isObserver={true}
                                                    speakingUserIds={speakingUserIds}
                                                    recordingUserIds={recordingUserIds}
                                                    currentUserId={currentUserId}
                                                    canInviteObserver={isOwner && isInviteOnly}
                                                    onInviteObserver={async (p) =>
                                                        onInviteUser(
                                                            p.userId,
                                                            p.displayName ?? undefined,
                                                            p.avatarUrl ?? undefined,
                                                        )
                                                    }
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                            {isHuddleActive && isParticipant ? (
                                <section className="border-t pb-4 pt-6 m-0 px-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-center gap-2"
                                        onClick={handleCopyShareLink}
                                    >
                                        <Copy className="h-4 w-4" />
                                        <span>Copy invite link</span>
                                    </Button>
                                    <p className="mt-1 text-xs text-muted-foreground text-center">
                                        {isPrivate
                                            ? 'Share this link so others can access this private huddle.'
                                            : 'Share this link so others can join this huddle.'}
                                    </p>
                                </section>
                            ) : null}
                            {isOwner && isHuddleActive ? (
                                <section className="border-t py-4">
                                    {!isPrivate && (
                                        <div className="flex items-center justify-between gap-3 py-2">
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="invite-only-switch" className="text-sm font-medium">
                                                    {isInviteOnly ? 'Invite-only' : 'Open'}
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    {isInviteOnly ? 'Invite observers to participate' : 'Anyone can participate'}
                                                </p>
                                            </div>
                                            <Switch
                                                id="invite-only-switch"
                                                className="cursor-pointer"
                                                checked={isInviteOnly}
                                                onCheckedChange={async (checked) => {
                                                    try {
                                                        await onToggleInviteOnly(checked)
                                                    } catch (error) {
                                                        console.error('Failed to toggle invite-only', error)
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                    {isOwner ? (
                                        <div className="flex items-center justify-between gap-3 py-2">
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="private-switch" className="text-sm font-medium">
                                                    Private
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    {canTogglePrivate
                                                        ? 'Only users with a special share link can join.'
                                                        : 'Available with a subscription.'}
                                                </p>
                                            </div>
                                            <Switch
                                                id="private-switch"
                                                className={canTogglePrivate ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                                                checked={isPrivate}
                                                disabled={!canTogglePrivate}
                                                onCheckedChange={async (checked) => {
                                                    if (!canTogglePrivate) return
                                                    try {
                                                        await onTogglePrivate?.(checked)
                                                    } catch (error) {
                                                        console.error('Failed to toggle private mode', error)
                                                    }
                                                }}
                                            />
                                        </div>
                                    ) : null}
                                </section>
                            ) : null}
                        </AccordionContent>
                    </CardContent>
            <CardFooter className="flex flex-col items-center gap-4 rounded-b-lg justify-center gap-x-4 border-t bg-muted p-6">
                {isHuddleActive ? (
                    <>
                        {isParticipant ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onLeave}
                                disabled={isLeaving}
                                className="w-full max-w-48"
                            >
                                {isLeaving ? 'Leaving…' : 'Leave huddle'}
                            </Button>
                        ) : canJoin ? (
                            <Button type="button" onClick={onJoin} disabled={isJoining} className="w-full max-w-48">
                                {isJoining ? 'Joining…' : 'Join huddle'}
                            </Button>
                        ) : isInviteOnly ? (
                            <p className="text-sm text-muted-foreground text-center">
                                This huddle is invite-only.<br />Ask the owner to invite you.
                            </p>
                        ) : null}
                    </>
                ) : null}
                {!isHuddleActive ? (
                    <div className="flex flex-col items-center gap-3 w-full">
                        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                            <Sparkles className="h-3 w-3" />
                            <span>Huddle marked complete</span>
                        </div>
                        {isOwner ? (
                            <SignedOut>
                                <div className="flex flex-col items-center gap-2 w-full">
                                    <p className="text-xs text-muted-foreground text-center">
                                        Sign in &amp; upgrade to remove Huddle time limits
                                    </p>
                                    <SignInButton mode="modal">
                                        <Button type="button" className="w-full max-w-48">
                                            Sign in
                                        </Button>
                                    </SignInButton>
                                </div>
                            </SignedOut>
                        ) : null}
                    </div>
                ) : null}
                {isOwner && canShowHuddleAction ? (
                    <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                        <AlertDialogTrigger asChild>
                            <Button
                                type="button"
                                className="w-full max-w-48 border-primary-foreground"
                                variant="outline"
                                disabled={huddleActionDisabled}
                            >
                                {huddleActionDisabled ? huddleActionPendingLabel : huddleActionLabel}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{huddleActionLabel}</AlertDialogTitle>
                                <AlertDialogDescription>{huddleActionDescription}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleConfirm}
                                    className={isHuddleActive ? 'bg-rose-600 hover:bg-rose-500' : undefined}
                                    disabled={huddleActionDisabled}
                                >
                                    {huddleActionDisabled ? huddleActionPendingLabel : huddleActionLabel}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                ) : null}
            </CardFooter>
                </AccordionItem>
            </Accordion>
        </Card>
    )
}

function UpgradeActionButton({ onSubscribe }: { onSubscribe: () => void }) {
    const [loading, setLoading] = useState(false)
    return (
        <Button
            type="button"
            onClick={async () => {
                if (loading) return
                setLoading(true)
                await Promise.resolve(onSubscribe())
            }}
            disabled={loading}
            className="w-full max-w-48"
        >
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    key={loading ? 'loading' : 'idle'}
                    className="flex items-center gap-2"
                >
                    {loading ? <Spinner size={16} color="rgba(255,255,255,0.85)" /> : 'Upgrade'}
                </motion.span>
            </AnimatePresence>
        </Button>
    )
}

type ParticipantRowProps = {
    participant: ParticipantListEntry
    isObserver: boolean
    speakingUserIds: Set<string>
    recordingUserIds: Set<string>
    currentUserId?: string | null
    canInviteObserver?: boolean
    onInviteObserver?: (participant: ParticipantListEntry) => Promise<void> | void
}

function ParticipantRow({
    participant,
    isObserver,
    speakingUserIds,
    recordingUserIds,
    currentUserId,
    canInviteObserver,
    onInviteObserver,
}: ParticipantRowProps) {
    const [isInviting, setIsInviting] = useState(false)
    const rawName = typeof participant.displayName === 'string' ? participant.displayName.trim() : ''
    const hasName = rawName.length > 0
    const safeName = hasName ? rawName : 'Anonymous'
    const initials = hasName ? getInitials(rawName) : '??'

    // Use client-only check to avoid hydration mismatch
    const [isCurrentUser, setIsCurrentUser] = useState(false)
    useEffect(() => {
        setIsCurrentUser(participant.userId === currentUserId)
    }, [participant.userId, currentUserId])

    const isSpeaking = speakingUserIds.has(participant.userId)
    const isRecording = recordingUserIds.has(participant.userId) || isSpeaking

    const status = isRecording ? 'recording' : isObserver ? 'observer' : 'participating'

    const statusStyles: Record<
        'participating' | 'observer' | 'recording',
        { wrapper: string; text: string; label: string }
    > = {
        participating: {
            wrapper: 'bg-emerald-100 p-1 text-emerald-500 dark:bg-emerald-900 dark:text-emerald-300',
            text: 'text-emerald-600 dark:text-emerald-300 dark:text-emerald-300',
            label: 'Participating',
        },
        observer: {
            wrapper: 'bg-gray-100/10 p-1 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
            text: 'text-gray-600 dark:text-gray-300 dark:text-gray-300',
            label: 'Observer',
        },
        recording: {
            wrapper: 'bg-rose-100 p-1 text-rose-500 dark:bg-rose-900 dark:text-rose-300',
            text: 'text-rose-600 dark:text-rose-300 dark:text-rose-300',
            label: 'Recording',
        },
    }

    const statusView = statusStyles[status]

    return (
        <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-2">
                <div className="flex size-10 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-sm font-semibold uppercase text-slate-700 dark:border-gray-600 dark:bg-gray-800 dark:text-slate-200">
                    {participant.avatarUrl ? (
                        <img
                            src={participant.avatarUrl}
                            alt={`${safeName} avatar`}
                            className="size-full object-cover"
                        />
                    ) : (
                        <span>{initials}</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative flex-none flex items-center justify-center">
                        {isRecording ? (
                            <motion.div
                                className="absolute rounded-full bg-rose-500/30 dark:bg-rose-300/30"
                                style={{
                                    width: '12px',
                                    height: '12px',
                                }}
                                animate={{
                                    scale: [1, 2.5, 2.5],
                                    opacity: [0.6, 0, 0],
                                }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    ease: 'easeOut',
                                }}
                            />
                        ) : null}
                        <div className={`relative rounded-full ${statusView.wrapper}`}>
                            <div className="size-2 rounded-full bg-current" />
                        </div>
                    </div>
                    <span className="text-sm font-semibold">
                        {safeName}
                        {isCurrentUser ? ' (You)' : ''}
                    </span>
                </div>
            </div>

            {isObserver && canInviteObserver ? (
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                            if (!onInviteObserver || isInviting) return
                            try {
                                setIsInviting(true)
                                await onInviteObserver(participant)
                            } finally {
                                setIsInviting(false)
                            }
                        }}
                        disabled={isInviting}
                        className="h-7 px-3 text-xs"
                    >
                        {isInviting ? 'Inviting…' : 'Invite'}
                    </Button>
                </div>
            ) : null}
        </div>
    )
}

