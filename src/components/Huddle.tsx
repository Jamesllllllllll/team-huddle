import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useSuspenseQuery, useQuery } from '@tanstack/react-query'
import { useRouter, useNavigate, useSearch } from '@tanstack/react-router'
import {
    huddleQueries,
    useAddObserverMutation,
    useAddParticipantMutation,
    useClearPresenceMutation,
    useCreatePlanningItemMutation,
    useDeletePlanningItemMutation,
    useEndHuddleMutation,
    useRemoveParticipantMutation,
    useUpsertPresenceMutation,
    useStartHuddleMutation,
    useUpdatePlanningItemMutation,
    useUpdateHuddleNameMutation,
    useDeleteHuddleMutation,
    useSetInviteOnlyMutation,
    useSetPrivateMutation,
    useInviteUserMutation,
    useRemoveInviteMutation,
    useAutoEndHuddleMutation,
    linearQueries,
} from '~/queries'
import {
    PLANNING_ITEM_TYPE_LABELS,
    PLANNING_ITEM_TYPES,
    type PlanningItemType,
} from '~/types'
import { EditableText } from './EditableText'
import { DevTranscriptToolbar } from './DevTranscriptToolbar'
import { ParticipantsPanel } from './huddle/ParticipantsPanel'
import { RecordingControlsCard } from './huddle/RecordingControlsCard'
import { TranscriptCard } from './huddle/TranscriptCard'
import { FreeHuddleTimer } from './huddle/FreeHuddleTimer'
import { ReportModal } from './huddle/ReportModal'
import { formatDateTime } from '~/utils/dates'
import { LinearAuthDialog } from './huddle/LinearAuthDialog'
import { LinearProjectDialog } from './huddle/LinearProjectDialog'
import { DevCountdown } from './huddle/DevCountdown'
import { RealtimePrototypeCard } from './huddle/RealtimePrototypeCard'
import { PlanningBoard } from './huddle/PlanningBoard'
import { SupportingSections } from './huddle/SupportingSections'
import { SummaryCard } from './huddle/SummaryCard'
import { HuddleHeader } from './huddle/HuddleHeader'
import { NameDialog } from './huddle/NameDialog'
import { DeleteHuddleDialog } from './huddle/DeleteHuddleDialog'
import { DevDiagnostics } from './huddle/DevDiagnostics'
import { PlanningItemList } from './huddle/PlanningItemList'
import { ResearchDebug } from './huddle/ResearchDebug'
import {
    FALLBACK_SPEAKER_STYLE,
    PLANNING_EMPTY_MESSAGES,
    PRIMARY_COLUMN_CONFIG,
    PRESENCE_HEARTBEAT_INTERVAL_MS,
    SUPPORTING_SECTIONS,
    DEV_TOOLBAR_STORAGE_KEY,
    RECORDING_MODE_STORAGE_KEY,
} from './huddle/constants'
import {
    createSpeakerStyle,
    extractBadgesFromMetadata,
    getInitials,
    hashStringToSeed,
    normalizeAudioBlob,
} from './huddle/utils'
import type {
    OverallRecordingStatus,
    SpeakerStyle,
    TranscriptMetadata,
    TranscriptEntry,
    RecordingMode,
    MicrophoneControls,
} from './huddle/types'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
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
import { useUserProfile } from '~/context/UserProfileContext'
import { Input } from '~/components/ui/input'
import { useMicrophone } from '~/hooks/useMicrophone'
import { useDarkMode } from '~/hooks/useDarkMode'
import {
    useVoiceActivityRecorder,
    type VoiceActivityTurn,
} from '~/hooks/useVoiceActivityRecorder'
import { useRealtimePrototype } from '~/hooks/useRealtimePrototype'
import { speakToHuddle } from '~/server/speakToHuddle'
import { requestHuddleAutoTitle } from '~/server/generateHuddleTitle'
import { performResearch } from '~/server/research'
import { Sparkles, Download, Trash2 } from 'lucide-react'
import { Linear } from '~/components/assets/icons/LinearLogo'
import { useCustomer } from 'autumn-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../convex/_generated/api'
import { FREE_HUDDLE_DURATION_MS } from '~/shared/huddle'

export function Huddle({ slug }: { slug: string }) {
    const router = useRouter()
    const { data: huddle } = useSuspenseQuery(huddleQueries.detail(slug))
    const microphone = useMicrophone()
    const huddleContentRef = useRef<typeof HuddleContent | null>(null)
    if (!huddleContentRef.current) {
        huddleContentRef.current = HuddleContent
    }
    const StableHuddleContent = huddleContentRef.current
    const queryClient = useQueryClient()

    // Track whether this huddle was ever loaded in this session to distinguish
    // initial 404 from an in-session deletion.
    const hadHuddleRef = useRef<boolean>(Boolean(huddle))

    useEffect(() => {
        if (huddle) {
            hadHuddleRef.current = true
            return
        }
        // If we previously had the huddle and now it's gone, it was likely deleted.
        if (hadHuddleRef.current && !huddle) {
            toast.error('Huddle was deleted')
            void router.navigate({ to: '/' })
            return
        }
        // Otherwise (first load and missing), just navigate without a toast.
        if (!huddle) {
            void router.navigate({ to: '/' })
        }
    }, [huddle, router])

    // Ensure any streaming queries for this huddle are fully torn down when unmounting,
    // so navigating back doesn't try to reuse a closed stream.
    // Use cancelQueries instead of removeQueries to avoid race conditions with the
    // Convex subscription cleanup. cancelQueries will stop the stream without trying
    // to unsubscribe from already-cleaned subscriptions.
    useEffect(() => {
        return () => {
            try {
                const { queryKey } = huddleQueries.detail(slug)
                // Cancel the query to stop streaming, but don't remove it from cache
                // This avoids the race condition where unsubscribe might be undefined
                void queryClient.cancelQueries({ queryKey })
            } catch (error) {
                // Ignore errors during cleanup - the subscription may already be torn down
                // This can happen if the component unmounts while the Convex subscription
                // is in the process of cleaning up, causing unsubscribe to be undefined
                if (import.meta.env.DEV) {
                    console.debug('[Huddle] Error during query cleanup (safe to ignore):', error)
                }
            }
        }
    }, [queryClient, slug])

    if (!huddle) {
        return null
    }

    type HuddleData = typeof huddle

    return StableHuddleContent ? (
        <StableHuddleContent slug={slug} huddle={huddle} microphone={microphone} />
    ) : null

    function HuddleContent({
        slug,
        huddle,
        microphone,
    }: {
        slug: string
        huddle: HuddleData
        microphone: MicrophoneControls
    }) {
        const { profile, isComplete, isReady, setName } = useUserProfile()
        const { isDark } = useDarkMode()

        // Get primary-foreground color for border animation
        const primaryForegroundColor = useMemo(() => {
            if (typeof window === 'undefined') return 'transparent'
            const root = document.documentElement
            const color = getComputedStyle(root).getPropertyValue('--primary-foreground').trim()
            return color || 'transparent'
        }, [])
        const createPlanningItem = useCreatePlanningItemMutation()
        const updatePlanningItem = useUpdatePlanningItemMutation()
        const deletePlanningItem = useDeletePlanningItemMutation()
        const addParticipant = useAddParticipantMutation()
        const {
            mutateAsync: registerObserverAsync,
            isPending: isRegisterObserverPending,
        } = useAddObserverMutation()
        const removeParticipant = useRemoveParticipantMutation()
        const clearPresence = useClearPresenceMutation()
        const endHuddleMutation = useEndHuddleMutation()
        const startHuddleMutation = useStartHuddleMutation()
        const updateHuddleName = useUpdateHuddleNameMutation(slug)
        const deleteHuddleMutation = useDeleteHuddleMutation()
        const { mutate: upsertPresenceMutate } = useUpsertPresenceMutation()
        const setInviteOnly = useSetInviteOnlyMutation()
        const setPrivate = useSetPrivateMutation()
        const inviteUser = useInviteUserMutation()
        const removeInvite = useRemoveInviteMutation()
        const autoEndHuddle = useAutoEndHuddleMutation()

        const debugLog = useCallback(
            (...args: Array<unknown>) => {
                if (import.meta.env.DEV) {
                    console.log('[HuddleDebug]', ...args)
                }
            },
            [],
        )

        const [newItemType, setNewItemType] = useState<PlanningItemType>('idea')
        const [newItemText, setNewItemText] = useState('')
        const [isReportModalOpen, setIsReportModalOpen] = useState(false)
        const [isLinearAuthDialogOpen, setIsLinearAuthDialogOpen] = useState(false)
        const [isLinearProjectDialogOpen, setIsLinearProjectDialogOpen] = useState(false)
        const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
        const navigate = useNavigate({ from: '/huddles/$huddleSlug' })
        const search = useSearch({ from: '/huddles/$huddleSlug' })
        const itemId = (search as any).itemId as string | undefined
        const shareKey = (search as any).shareKey as string | undefined
        const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
        const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
        const previousItemsRef = useRef<Array<(typeof huddle.planningItems)[number]>>([])
        const [newlyAddedItemIds, setNewlyAddedItemIds] = useState<Set<string>>(new Set())
        const isDevEnvironment = import.meta.env.DEV
        const storageKey = `${DEV_TOOLBAR_STORAGE_KEY}:${slug}`
        const [isDevToolbarVisible, setIsDevToolbarVisible] = useState(false)
        const recordingModeStorageKey = `${RECORDING_MODE_STORAGE_KEY}:${slug}`
        const [recordingMode, setRecordingMode] = useState<RecordingMode>('autoPushToTalk')
        const [autoDetectionActive, setAutoDetectionActive] = useState(false)
        const [autoRecorderMessage, setAutoRecorderMessage] = useState<string | null>(null)
        const rawProfileName = typeof profile.name === 'string' ? profile.name : ''
        // Delay opening the name dialog until profile is ready to avoid flashing anonymous prompt
        const [isNameDialogOpen, setIsNameDialogOpen] = useState<boolean>(false)
        useEffect(() => {
            if (!isReady) return
            setIsNameDialogOpen(!isComplete)
        }, [isReady, isComplete])
        const [nameDialogValue, setNameDialogValue] = useState(rawProfileName)

        useEffect(() => {
            if (!isReady) return
            const nextName = typeof profile.name === 'string' ? profile.name : ''
            if (!nextName.trim()) {
                setIsNameDialogOpen(true)
                setNameDialogValue(nextName)
            }
        }, [profile.name, isReady])

        // Subscription status from Autumn
        const { customer, checkout } = useCustomer()
        const activeProductsForUser =
            customer?.products?.filter((p) => p.status === 'active' || p.status === 'trialing') ?? []
        const userHasActiveSubscription = activeProductsForUser.length > 0
        const getBaseUrl = () =>
            (typeof window !== 'undefined' ? window.location.origin : '') || 'http://localhost:3000'
        const handleSubscribe = useCallback(async () => {
            const { data } = await checkout({
                productId: 'team_huddle_basic',
                successUrl: getBaseUrl(),
            })
            if (data?.url) {
                window.location.href = data.url
            }
        }, [checkout])
        // Detect if the huddle ended due to the free time limit (explicit flag from server)
        const endedByTimeLimit = huddle.endedByTimeLimit === true

        useEffect(() => {
            if (!isDevEnvironment) return
            if (typeof window === 'undefined') return

            try {
                const storedValue = window.localStorage.getItem(storageKey)
                if (storedValue !== null) {
                    setIsDevToolbarVisible(storedValue === 'true')
                }
            } catch (error) {
                console.warn('Failed to read dev toolbar preference', error)
            }
        }, [isDevEnvironment, storageKey])

        useEffect(() => {
            if (!isDevEnvironment) return
            if (typeof window === 'undefined') return

            try {
                window.localStorage.setItem(
                    storageKey,
                    isDevToolbarVisible ? 'true' : 'false',
                )
            } catch (error) {
                console.warn('Failed to write dev toolbar preference', error)
            }
        }, [isDevEnvironment, isDevToolbarVisible, storageKey])

        const recordingModeInitRef = useRef(false)

        useEffect(() => {
            if (recordingModeInitRef.current) {
                return
            }

            let mode: RecordingMode = 'autoPushToTalk'

            if (typeof window !== 'undefined') {
                try {
                    const storedMode = window.localStorage.getItem(recordingModeStorageKey)
                    if (
                        storedMode === 'pushToTalk' ||
                        storedMode === 'autoPushToTalk' ||
                        (isDevEnvironment && storedMode === 'realtimePrototype')
                    ) {
                        mode = storedMode as RecordingMode
                    }
                } catch (error) {
                    console.warn('Failed to read recording mode preference', error)
                }
            }

            if (mode !== recordingMode) {
                setRecordingMode(mode)
            }
            setAutoDetectionActive(false)
            recordingModeInitRef.current = true
        }, [isDevEnvironment, recordingMode, recordingModeStorageKey, setRecordingMode])

        useEffect(() => {
            if (!isDevEnvironment) return
            if (typeof window === 'undefined') return
            try {
                window.localStorage.setItem(recordingModeStorageKey, recordingMode)
            } catch (error) {
                console.warn('Failed to persist recording mode preference', error)
            }
        }, [isDevEnvironment, recordingMode, recordingModeStorageKey])

        const rawTranscriptChunks = huddle.transcriptChunks
        const huddleId = huddle._id
        const isOwner =
            huddle.createdBy === profile.clientId ||
            (typeof profile.name === 'string' &&
                profile.name.trim().length > 0 &&
                huddle.createdBy === profile.name.trim())
        const isHuddleCompleted = huddle.status === 'completed'
        const isTimeLimited = huddle.isTimeLimited !== false
        const isPrivate = huddle.isPrivate === true
        const isInviteOnly = huddle.isInviteOnly === true
        const invitedUserIds = huddle.invitedUserIds ?? []
        const isInvited = invitedUserIds.includes(profile.clientId)
        const hasValidShareKey = !isPrivate || (typeof shareKey === 'string' && shareKey === huddle.privateAccessKey)

        // Track current time to detect time limit expiration in real-time
        const [currentTime, setCurrentTime] = useState(() => Date.now())

        // Update current time every second to detect expiration
        useEffect(() => {
            if (isHuddleCompleted || !isTimeLimited) return

            const interval = setInterval(() => {
                setCurrentTime(Date.now())
            }, 1000)

            return () => clearInterval(interval)
        }, [isHuddleCompleted, isTimeLimited])

        // Compute free time limit expiration locally to gate UI immediately
        const isFreeLimitExceeded = useMemo(() => {
            if (!isTimeLimited) return false
            const createdAtMs = new Date(huddle.createdAt).getTime()
            if (Number.isNaN(createdAtMs)) return false
            return currentTime - createdAtMs >= FREE_HUDDLE_DURATION_MS
        }, [isTimeLimited, huddle.createdAt, currentTime])

        // Huddle is inactive if completed OR if time limit exceeded (even if server hasn't confirmed yet)
        const isHuddleActive = !isHuddleCompleted && !isFreeLimitExceeded

        // If anyone opens an expired, non-completed free huddle, attempt to auto-end once
        const hasAttemptedAutoEndRef = useRef(false)
        useEffect(() => {
            if (hasAttemptedAutoEndRef.current) return
            if (isHuddleCompleted) return
            if (!isTimeLimited) return
            const createdAtMs = new Date(huddle.createdAt).getTime()
            if (Number.isNaN(createdAtMs)) return
            const elapsedMs = currentTime - createdAtMs
            if (elapsedMs < FREE_HUDDLE_DURATION_MS) return
            hasAttemptedAutoEndRef.current = true
            void autoEndHuddle.mutateAsync({ huddleId })
        }, [isTimeLimited, isHuddleCompleted, huddle.createdAt, huddleId, autoEndHuddle, currentTime])

        // Auto-end when time limit is exceeded while on the page
        const hasAutoEndedWhileOnPageRef = useRef(false)
        useEffect(() => {
            if (hasAutoEndedWhileOnPageRef.current) return
            if (isHuddleCompleted) return
            if (!isTimeLimited) return
            if (!isFreeLimitExceeded) return

            hasAutoEndedWhileOnPageRef.current = true
            void autoEndHuddle.mutateAsync({ huddleId })
        }, [isFreeLimitExceeded, isHuddleCompleted, isTimeLimited, huddleId, autoEndHuddle])

        // Check Linear authentication status (non-blocking, optional feature)
        // Get Linear user ID from localStorage (stored after first auth)
        const linearUserId = typeof window !== 'undefined'
            ? localStorage.getItem('huddle:linear-user-id')
            : null

        const { data: hasLinearToken = false } = useQuery({
            ...linearQueries.hasToken(linearUserId || ''),
            retry: false,
            staleTime: 60 * 1000, // Cache for 1 minute
            enabled: Boolean(
                typeof window !== 'undefined' &&
                linearUserId &&
                linearUserId.trim().length > 0
            ),
            // Suppress errors - this is an optional feature
            throwOnError: false,
        })

        // Check if Linear was just connected and open project dialog
        useEffect(() => {
            if (typeof window === 'undefined') return

            const justConnected = sessionStorage.getItem('linear-just-connected')
            if (justConnected === 'true' && hasLinearToken) {
                // Clear the flag
                sessionStorage.removeItem('linear-just-connected')
                // Open the project dialog
                setIsLinearProjectDialogOpen(true)
            }
        }, [hasLinearToken])

        const currentParticipant = useMemo(
            () =>
                huddle.participants.find(
                    (participant) => participant.userId === profile.clientId,
                ),
            [huddle.participants, profile.clientId],
        )

        const isParticipant = useMemo(
            () =>
                typeof currentParticipant !== 'undefined' &&
                (currentParticipant.role ?? '').toLowerCase() !== 'observer',
            [currentParticipant],
        )

        const canJoin = useMemo(() => {
            if (isOwner) return true
            if (isPrivate && !hasValidShareKey) return false
            // If private and has valid share key, allow access regardless of invite-only
            if (isPrivate && hasValidShareKey) return true
            if (!isInviteOnly) return true
            if (isParticipant) return true // Can rejoin if previously a participant
            return isInvited
        }, [isOwner, isInviteOnly, isParticipant, isInvited, isPrivate, hasValidShareKey])

        const speakingUserIds = useMemo(() => {
            const ids = new Set<string>()
            for (const entry of huddle.presence) {
                if (entry.isSpeaking) {
                    ids.add(entry.userId)
                }
            }
            return ids
        }, [huddle.presence])

        const recordingUserIds = useMemo(() => {
            const ids = new Set<string>()
            for (const entry of huddle.presence) {
                if (entry.isRecording === true) {
                    ids.add(entry.userId)
                }
            }
            return ids
        }, [huddle.presence])

        const participantsByUserId = useMemo(() => {
            const map = new Map<string, (typeof huddle.participants)[number]>()
            for (const participant of huddle.participants) {
                if (typeof participant.userId === 'string' && participant.userId.trim().length > 0) {
                    map.set(participant.userId, participant)
                }
            }
            return map
        }, [huddle.participants])

        const ownerDisplayName = useMemo(() => {
            const ownerParticipant = participantsByUserId.get(huddle.createdBy)
            const trimmedDisplayName =
                ownerParticipant?.displayName && ownerParticipant.displayName.trim().length > 0
                    ? ownerParticipant.displayName.trim()
                    : null
            if (trimmedDisplayName) {
                return trimmedDisplayName
            }
            const trimmedProfileName =
                typeof profile.name === 'string' && profile.name.trim().length > 0
                    ? profile.name.trim()
                    : null
            if (
                trimmedProfileName &&
                (huddle.createdBy === profile.clientId || huddle.createdBy === trimmedProfileName)
            ) {
                return trimmedProfileName
            }
            return huddle.createdBy
        }, [huddle.createdBy, participantsByUserId, profile.clientId, profile.name])

        const isRealtimePrototypeActive =
            isDevEnvironment && recordingMode === 'realtimePrototype'

        const realtimePrototype = useRealtimePrototype({
            enabled: isRealtimePrototypeActive,
            huddleSlug: slug,
        })

        const {
            status: realtimeStatus,
            error: realtimeError,
            clientSecret: realtimeClientSecret,
            session: realtimeSession,
            callId: realtimeCallId,
            remoteStream: realtimeRemoteStream,
            expiresAt: realtimeSecretExpiry,
            connect: connectRealtime,
            disconnect: disconnectRealtime,
            refreshSecret: refreshRealtimeSecret,
        } = realtimePrototype


        const realtimeAudioRef = useRef<HTMLAudioElement | null>(null)

        const realtimeSecretExpiryLabel = useMemo(() => {
            if (!realtimeSecretExpiry) {
                return null
            }
            const msRemaining = realtimeSecretExpiry * 1000 - Date.now()
            if (!Number.isFinite(msRemaining)) {
                return null
            }
            if (msRemaining <= 0) {
                return 'Client secret expired'
            }
            if (msRemaining < 60_000) {
                return `${Math.max(1, Math.round(msRemaining / 1000))}s until secret expiry`
            }
            return `${Math.round(msRemaining / 60000)}m until secret expiry`
        }, [realtimeSecretExpiry])

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

        const isRealtimeSessionReady =
            (realtimeStatus === 'ready' || realtimeStatus === 'connected') &&
            Boolean(realtimeClientSecret)

        const realtimeStatusLabel = useMemo(() => {
            switch (realtimeStatus) {
                case 'fetchingSecret':
                    return 'Minting client secret…'
                case 'ready':
                    return 'Secret ready'
                case 'connecting':
                    return 'Connecting…'
                case 'connected':
                    return 'Connected'
                case 'error':
                    return 'Session error'
                default:
                    return 'Idle'
            }
        }, [realtimeStatus])

        const maskedRealtimeSecret = useMemo(() => {
            const secret = realtimeClientSecret
            if (!secret) {
                return null
            }
            if (secret.length <= 12) {
                return secret
            }
            return `${secret.slice(0, 6)}…${secret.slice(-4)}`
        }, [realtimeClientSecret])

        const participantsByName = useMemo(() => {
            const map = new Map<string, (typeof huddle.participants)[number]>()
            for (const participant of huddle.participants) {
                const name =
                    typeof participant.displayName === 'string' ? participant.displayName.trim() : ''
                if (name.length > 0) {
                    map.set(name.toLowerCase(), participant)
                }
            }
            return map
        }, [huddle.participants])

        type ParticipantSnapshot = {
            displayName: string
            avatarUrl: string | null
            role: 'observer' | 'participant'
        }

        type PresenceToastKind = 'observer-joined' | 'participant-joined' | 'participant-left'

        const previousParticipantsRef = useRef<Map<string, ParticipantSnapshot> | null>(null)

        const showPresenceToast = useCallback((kind: PresenceToastKind, snapshot: ParticipantSnapshot) => {
            const labels: Record<PresenceToastKind, string> = {
                'observer-joined': 'Observing',
                'participant-joined': 'Joined',
                'participant-left': 'Left',
            }

            const messages: Record<PresenceToastKind, string> = {
                'observer-joined': 'is observing the huddle.',
                'participant-joined': 'joined the huddle.',
                'participant-left': 'left the huddle.',
            }

            const accents: Record<PresenceToastKind, string> = {
                'observer-joined':
                    'bg-indigo-100 dark:bg-indigo-500/20',
                'participant-joined':
                    'bg-emerald-100 dark:bg-emerald-500/20',
                'participant-left':
                    'bg-rose-100 dark:bg-rose-500/20',
            }

            const initials = getInitials(snapshot.displayName)

            toast(
                () => (
                    <div className="flex-1 p-4">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 pt-0.5">
                                <div className="flex size-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold uppercase">
                                    {snapshot.avatarUrl ? (
                                        <img
                                            src={snapshot.avatarUrl}
                                            alt={`${snapshot.displayName} avatar`}
                                            className="size-full object-cover"
                                        />
                                    ) : (
                                        <span>{initials}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-semibold">
                                        {snapshot.displayName}
                                    </p>
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${accents[kind]}`}
                                    >
                                        {labels[kind]}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm">
                                    {messages[kind]}
                                </p>
                            </div>
                        </div>
                    </div>
                ),
                {
                    duration: 4000,
                    position: 'top-right',
                },
            )
        }, [])

        useEffect(() => {
            debugLog('participants updated', {
                total: huddle.participants.length,
                participantRoles: huddle.participants.map((participant) => ({
                    userId: participant.userId,
                    role: participant.role,
                })),
            })
        }, [debugLog, huddle.participants])

        useEffect(() => {
            if (typeof window === 'undefined') {
                return
            }

            const currentUserId =
                typeof profile.clientId === 'string' ? profile.clientId.trim() : ''
            if (currentUserId.length === 0) {
                return
            }

            const currentParticipants = new Map<string, ParticipantSnapshot>()
            for (const participant of huddle.participants) {
                const userId =
                    typeof participant.userId === 'string' ? participant.userId.trim() : ''
                if (!userId) {
                    continue
                }

                const rawName =
                    typeof participant.displayName === 'string'
                        ? participant.displayName.trim()
                        : ''
                const displayName = rawName.length > 0 ? rawName : 'Anonymous'
                const avatarUrl =
                    typeof participant.avatarUrl === 'string' && participant.avatarUrl.trim().length > 0
                        ? participant.avatarUrl.trim()
                        : null
                const role =
                    typeof participant.role === 'string' && participant.role.trim().toLowerCase() === 'observer'
                        ? 'observer'
                        : 'participant'

                currentParticipants.set(userId, {
                    displayName,
                    avatarUrl,
                    role,
                })
            }

            const previousParticipants = previousParticipantsRef.current
            previousParticipantsRef.current = currentParticipants

            if (!previousParticipants) {
                return
            }

            currentParticipants.forEach((snapshot, userId) => {
                if (userId === currentUserId) {
                    return
                }
                const previousSnapshot = previousParticipants.get(userId)
                if (!previousSnapshot) {
                    if (snapshot.role === 'observer') {
                        showPresenceToast('observer-joined', snapshot)
                    } else {
                        showPresenceToast('participant-joined', snapshot)
                    }
                    return
                }

                if (previousSnapshot.role !== snapshot.role) {
                    if (snapshot.role === 'observer') {
                        showPresenceToast('observer-joined', snapshot)
                    } else if (previousSnapshot.role === 'observer') {
                        showPresenceToast('participant-joined', snapshot)
                    }
                }
            })

            previousParticipants.forEach((snapshot, userId) => {
                if (userId === currentUserId) {
                    return
                }
                if (!currentParticipants.has(userId) && snapshot.role === 'participant') {
                    showPresenceToast('participant-left', snapshot)
                }
            })
        }, [huddle.participants, profile.clientId, showPresenceToast])

        const isJoining = addParticipant.isPending
        const isLeaving = removeParticipant.isPending || clearPresence.isPending

        const {
            permission: microphonePermission,
            isRecording: isRecordingAudio,
            error: microphoneError,
            isSupported: isMicrophoneSupported,
            requestPermission: requestMicrophonePermission,
            startRecording,
            stopRecording,
        } = microphone

        const [microphoneStatusMessage, setMicrophoneStatusMessage] = useState<string | null>(null)
        const [lastRecordingDuration, setLastRecordingDuration] = useState<number | null>(null)
        const [conversationId, setConversationId] = useState<string | null>(null)
        const isPushToTalkReady =
            isParticipant && isMicrophoneSupported && microphonePermission === 'granted'
        const startPushToTalk = useCallback(async () => {
            if (!isMicrophoneSupported) {
                setMicrophoneStatusMessage('Microphone recording is not supported in this browser.')
                return
            }
            if (microphonePermission !== 'granted') {
                try {
                    await requestMicrophonePermission()
                    debugLog('microphone permission requested')
                    setMicrophoneStatusMessage('Microphone access granted. Tap start recording to begin.')
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : 'Microphone permission denied.'
                    setMicrophoneStatusMessage(message)
                    return
                }
                return
            }

            setMicrophoneStatusMessage(null)

            try {
                await startRecording()
                debugLog('recording started')
            } catch (error) {
                console.error('Failed to start recording', error)
                const message =
                    error instanceof Error ? error.message : 'Unable to start microphone recording.'
                setMicrophoneStatusMessage(message)
            }
        }, [
            debugLog,
            isMicrophoneSupported,
            microphonePermission,
            requestMicrophonePermission,
            startRecording,
        ])

        const submitRecording = useCallback(
            async ({
                blob,
                mimeType,
                durationMs,
            }: {
                blob: Blob
                mimeType: string
                durationMs: number
            }) => {
                // Skip processing for audio clips less than 3 seconds
                const MIN_DURATION_MS = 3000
                if (durationMs < MIN_DURATION_MS) {
                    toast('Audio clips less than 3 seconds are not captured', {
                        icon: 'ℹ️',
                        duration: 3000,
                    })
                    return
                }
                if (!isParticipant) {
                    throw new Error('Join the huddle before sending audio.')
                }

                const audioFile = normalizeAudioBlob(blob)
                const normalizedMimeType = audioFile.type || mimeType
                const speakerLabel =
                    (profile.name && profile.name.trim().length > 0 ? profile.name.trim() : null) ??
                    'Participant'

                const formData = new FormData()
                formData.set('audio', audioFile, audioFile.name)
                formData.set('huddleId', String(huddleId))
                formData.set('huddleSlug', slug)
                formData.set('speakerId', profile.clientId)
                formData.set('speakerLabel', speakerLabel)
                formData.set('mimeType', normalizedMimeType)
                formData.set('durationMs', String(Math.round(durationMs)))

                if (conversationId) {
                    formData.set('conversationId', conversationId)
                }

                const requestId =
                    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
                formData.set('requestId', requestId)

                try {
                    const response = await speakToHuddle({ data: formData })
                    setConversationId(response?.conversationId ?? null)
                    debugLog('recording processed', { response })
                } catch (submissionError) {
                    throw submissionError instanceof Error
                        ? submissionError
                        : new Error('Failed to process the microphone recording.')
                }
            },
            [
                conversationId,
                debugLog,
                huddleId,
                isParticipant,
                profile.clientId,
                profile.name,
                setConversationId,
                slug,
            ],
        )

        const handleAutoTurn = useCallback(
            async ({ blob, mimeType, durationMs }: VoiceActivityTurn) => {
                if (!isParticipant) {
                    toast.error('Join the huddle before sending audio.')
                    return
                }
                setAutoRecorderMessage(null)
                setLastRecordingDuration(durationMs)
                try {
                    await submitRecording({ blob, mimeType, durationMs })
                } catch (submissionError) {
                    console.error('Failed to process auto-detected recording', submissionError)
                    const fallbackMessage = 'Unable to process the automatically captured audio.'
                    const message =
                        submissionError instanceof Error && submissionError.message
                            ? submissionError.message
                            : fallbackMessage
                    setAutoRecorderMessage(message)
                    toast.error(message)
                }
            },
            [isParticipant, submitRecording],
        )

        const stopPushToTalk = useCallback(async () => {
            try {
                const result = await stopRecording()
                if (!result) {
                    debugLog('stop recording: no result - recorder may not have been active')
                    setMicrophoneStatusMessage('No recording was captured. Make sure to hold the button while speaking.')
                    return
                }
                if (result.blob.size === 0) {
                    debugLog('stop recording: empty blob')
                    setMicrophoneStatusMessage('Recording was empty. Please try again.')
                    return
                }

                setLastRecordingDuration(result.durationMs)
                setMicrophoneStatusMessage(null)
                await submitRecording({
                    blob: result.blob,
                    mimeType: result.mimeType,
                    durationMs: result.durationMs,
                })
            } catch (error) {
                console.error('Failed to process voice recording', error)
                const fallbackMessage = 'Unable to process the microphone recording.'
                const message =
                    error instanceof Error && error.message
                        ? error.message
                        : fallbackMessage
                setMicrophoneStatusMessage(message)
                toast.error(message)
            }
        }, [debugLog, setMicrophoneStatusMessage, stopRecording, submitRecording])

        const isAutoDetectionMode = recordingMode === 'autoPushToTalk'

        const autoRecorder = useVoiceActivityRecorder({
            enabled:
                isAutoDetectionMode &&
                autoDetectionActive &&
                isParticipant &&
                isHuddleActive &&
                isDevEnvironment,
            onTurn: handleAutoTurn,
            preferredMimeType: 'audio/webm;codecs=opus',
            startThreshold: 0.065,
            stopThreshold: 0.035,
            minCaptureMs: 800,
            minSilenceMs: 900,
        })

        const {
            status: autoRecorderStatus,
            error: autoRecorderError,
            isListening: isAutoListening,
            isCapturing: isAutoCapturing,
            turnCount: autoTurnCount,
            stop: stopAutoRecorder,
        } = autoRecorder

        const autoDetectionForcedOffRef = useRef(false)

        useEffect(() => {
            if (!isAutoDetectionMode) {
                if (autoDetectionActive) {
                    autoDetectionForcedOffRef.current = false
                    setAutoDetectionActive(false)
                    stopAutoRecorder()
                }
            }
        }, [autoDetectionActive, isAutoDetectionMode, stopAutoRecorder])

        useEffect(() => {
            if (!isParticipant || !isHuddleActive) {
                if (autoDetectionActive) {
                    autoDetectionForcedOffRef.current = true
                    setAutoDetectionActive(false)
                    stopAutoRecorder()
                }
                return
            }
            if (
                isAutoDetectionMode &&
                !autoDetectionActive &&
                autoDetectionForcedOffRef.current
            ) {
                setAutoDetectionActive(true)
                autoDetectionForcedOffRef.current = false
            }
        }, [
            autoDetectionActive,
            isAutoDetectionMode,
            isHuddleActive,
            isParticipant,
            stopAutoRecorder,
        ])

        useEffect(() => {
            if (autoRecorderError) {
                setAutoRecorderMessage(autoRecorderError)
            }
        }, [autoRecorderError])

        useEffect(() => {
            if (!autoDetectionActive) {
                setAutoRecorderMessage(null)
            }
        }, [autoDetectionActive])

        const isRealtimeConnected =
            isRealtimePrototypeActive && realtimeStatus === 'connected'

        const overallRecordingStatus = useMemo<OverallRecordingStatus>(
            () => {
                if (isRecordingAudio || isAutoCapturing || isRealtimeConnected) {
                    return 'recording'
                }
                return 'idle'
            },
            [isAutoCapturing, isRecordingAudio, isRealtimeConnected],
        )

        useEffect(() => {
            debugLog('state snapshot', {
                isParticipant,
                isHuddleActive,
                isDevEnvironment,
                isPushToTalkReady,
                overallRecordingStatus,
                hasMicrophonePermission: microphonePermission,
            })
        }, [
            debugLog,
            isParticipant,
            isHuddleActive,
            isDevEnvironment,
            isPushToTalkReady,
            overallRecordingStatus,
            microphonePermission,
        ])

        const [presenceHeartbeatTick, setPresenceHeartbeatTick] = useState(0)
        const lastRecordingPresenceRef = useRef<{
            huddleId: typeof huddleId
            isRecording: boolean
            lastSentAt: number
        } | null>(null)

        useEffect(() => {
            if (!isParticipant) {
                debugLog('presence heartbeat skipped (not participant)')
                lastRecordingPresenceRef.current = null
                return
            }
            if (typeof window === 'undefined') {
                debugLog('presence heartbeat skipped (no window)')
                return
            }
            debugLog('presence heartbeat started', {
                intervalMs: PRESENCE_HEARTBEAT_INTERVAL_MS,
            })
            const intervalId = window.setInterval(() => {
                setPresenceHeartbeatTick((tick) => tick + 1)
            }, PRESENCE_HEARTBEAT_INTERVAL_MS)
            return () => {
                window.clearInterval(intervalId)
                debugLog('presence heartbeat stopped')
            }
        }, [debugLog, isParticipant])

        useEffect(() => {
            if (!isParticipant) {
                debugLog('presence effect skipped (not participant)')
                lastRecordingPresenceRef.current = null
                return
            }
            const userId =
                typeof profile.clientId === 'string' ? profile.clientId.trim() : ''
            if (userId.length === 0) {
                debugLog('presence effect skipped (missing userId)')
                return
            }
            const nextIsRecording = overallRecordingStatus === 'recording'
            const previous = lastRecordingPresenceRef.current
            const now = Date.now()
            debugLog('presence effect run', {
                nextIsRecording,
                previous,
                huddleId,
            })
            const shouldSend =
                !previous ||
                previous.huddleId !== huddleId ||
                previous.isRecording !== nextIsRecording ||
                now - previous.lastSentAt >= PRESENCE_HEARTBEAT_INTERVAL_MS
            if (!shouldSend) {
                debugLog('presence effect no-op (recent heartbeat)')
                return
            }
            const snapshot = { huddleId, isRecording: nextIsRecording, lastSentAt: now }
            lastRecordingPresenceRef.current = snapshot
            const updatedAt = new Date().toISOString()
            debugLog('presence mutate dispatch', { snapshot, updatedAt })
            upsertPresenceMutate(
                {
                    huddleId,
                    userId,
                    isSpeaking: false,
                    isRecording: nextIsRecording,
                    updatedAt,
                },
                {
                    onError: (error) => {
                        console.error('Failed to sync recording presence', error)
                        lastRecordingPresenceRef.current = previous ?? null
                        debugLog('presence mutate failed', { error })
                    },
                },
            )
        }, [
            huddleId,
            isParticipant,
            overallRecordingStatus,
            presenceHeartbeatTick,
            profile.clientId,
            upsertPresenceMutate,
            debugLog,
        ])

        const isDetectionSwitchOn = isAutoDetectionMode
        const isAutoRecorderRunning =
            autoDetectionActive && (isAutoListening || isAutoCapturing)

        const buttonColorClass = useMemo(() => {
            if (!isMicrophoneSupported) {
                return 'bg-slate-500 hover:bg-slate-500 focus:ring-slate-200'
            }
            if (isDetectionSwitchOn) {
                if (!autoDetectionActive) {
                    return 'bg-slate-500 hover:bg-slate-600 focus:ring-slate-200'
                }
                if (autoRecorderStatus === 'capturing' || autoRecorderStatus === 'error') {
                    return 'bg-rose-600 hover:bg-rose-500 focus:ring-rose-200'
                }
                return 'bg-sky-500 hover:bg-sky-400 focus:ring-sky-200'
            }
            if (microphonePermission !== 'granted') {
                return 'bg-amber-500 hover:bg-amber-400 focus:ring-amber-200'
            }
            if (overallRecordingStatus === 'recording') {
                return 'bg-rose-600 hover:bg-rose-500 focus:ring-rose-200'
            }
            return 'bg-emerald-700 hover:bg-emerald-600 focus:ring-emerald-200'
        }, [
            autoDetectionActive,
            autoRecorderStatus,
            isDetectionSwitchOn,
            isMicrophoneSupported,
            microphonePermission,
            overallRecordingStatus,
        ])

        const buttonLabel = useMemo(() => {
            if (!isMicrophoneSupported) {
                return 'Not supported'
            }
            if (isDetectionSwitchOn) {
                if (!autoDetectionActive) {
                    return 'Start listening'
                }
                if (autoRecorderStatus === 'capturing') {
                    return 'Recording…'
                }
                if (autoRecorderStatus === 'requesting') {
                    return 'Requesting microphone…'
                }
                if (autoRecorderStatus === 'error') {
                    return 'Retry detection'
                }
                return 'Listening…'
            }
            if (!isParticipant) {
                return 'Join to participate'
            }
            if (!isHuddleActive) {
                return 'Huddle complete'
            }
            if (microphonePermission !== 'granted') {
                return 'Grant access'
            }
            if (overallRecordingStatus === 'recording') {
                return 'Stop recording'
            }
            return 'Start recording'
        }, [
            autoDetectionActive,
            autoRecorderStatus,
            isDetectionSwitchOn,
            isHuddleActive,
            isParticipant,
            isMicrophoneSupported,
            microphonePermission,
            overallRecordingStatus,
        ])

        const primaryStatus = useMemo(() => {
            if (!isMicrophoneSupported) {
                return 'Recording is not supported in this browser.'
            }
            if (isDetectionSwitchOn) {
                if (!isParticipant) {
                    return 'Join the huddle to enable auto detection.'
                }
                if (!isHuddleActive) {
                    return 'Detection is disabled after the huddle wraps.'
                }
                if (!autoDetectionActive) {
                    return 'Auto detection is paused.'
                }
                switch (autoRecorderStatus) {
                    case 'requesting':
                        return 'Requesting microphone access…'
                    case 'capturing':
                        return 'Recording…'
                    case 'error':
                        return 'Auto detection encountered an error.'
                    default:
                        return 'Listening… tap to pause detection'
                }
            }
            if (!isParticipant) {
                return 'Join the huddle to record manually.'
            }
            if (!isHuddleActive) {
                return 'Recording is disabled after the huddle wraps.'
            }
            if (microphonePermission !== 'granted') {
                return 'Grant microphone access to record manually.'
            }
            if (overallRecordingStatus === 'recording') {
                return 'Recording… tap to stop when you finish speaking.'
            }
            return 'Tap the button before you speak.'
        }, [
            autoDetectionActive,
            autoRecorderStatus,
            isDetectionSwitchOn,
            isHuddleActive,
            isParticipant,
            isMicrophoneSupported,
            microphonePermission,
            overallRecordingStatus,
        ])

        const devTurnCountLabel = useMemo(() => {
            if (!isDevEnvironment) {
                return null
            }
            return `Turns: ${autoTurnCount}`
        }, [autoTurnCount, isDevEnvironment])

        const showRecordingEqualizer =
            (isDetectionSwitchOn && autoRecorderStatus === 'capturing') ||
            (!isDetectionSwitchOn && overallRecordingStatus === 'recording')

        const buttonDisabled = !isHuddleActive || !isMicrophoneSupported

        const handleRecordingModeChange = useCallback(
            (value: string) => {
                if (
                    value === 'realtimePrototype' ||
                    value === 'pushToTalk' ||
                    value === 'autoPushToTalk'
                ) {
                    setRecordingMode(value as RecordingMode)
                    autoDetectionForcedOffRef.current = false
                    if (autoDetectionActive) {
                        setAutoDetectionActive(false)
                        stopAutoRecorder()
                    }
                    setAutoRecorderMessage(null)
                }
            },
            [
                autoDetectionActive,
                setAutoDetectionActive,
                setAutoRecorderMessage,
                setRecordingMode,
                stopAutoRecorder,
            ],
        )

        const handleDetectionSwitchChange = useCallback(
            (checked: boolean) => {
                if (checked) {
                    autoDetectionForcedOffRef.current = false
                    setRecordingMode('autoPushToTalk')
                    if (autoDetectionActive) {
                        setAutoDetectionActive(false)
                        stopAutoRecorder()
                    }
                    setAutoRecorderMessage(null)
                } else {
                    if (autoDetectionActive) {
                        autoDetectionForcedOffRef.current = false
                        setAutoDetectionActive(false)
                        stopAutoRecorder()
                    }
                    setRecordingMode('pushToTalk')
                    setAutoRecorderMessage(null)
                }
            },
            [
                autoDetectionActive,
                setAutoDetectionActive,
                setAutoRecorderMessage,
                setRecordingMode,
                stopAutoRecorder,
            ],
        )

        const handleToggleRecording = useCallback(async () => {
            // If not a participant, join the huddle first
            if (!isParticipant) {
                await handleJoin()
                return
            }

            if (recordingMode === 'autoPushToTalk') {
                if (!isHuddleActive) {
                    toast.error('Auto detection is disabled once the huddle completes.')
                    return
                }
                if (autoDetectionActive) {
                    autoDetectionForcedOffRef.current = false
                    setAutoDetectionActive(false)
                    stopAutoRecorder()
                    setAutoRecorderMessage(null)
                } else {
                    autoDetectionForcedOffRef.current = false
                    setAutoDetectionActive(true)
                    setAutoRecorderMessage(null)
                }
                return
            }

            if (recordingMode === 'realtimePrototype') {
                if (realtimeStatus === 'connected') {
                    disconnectRealtime()
                } else {
                    await connectRealtime()
                }
                return
            }

            if (!isHuddleActive) {
                return
            }

            if (recordingMode === 'pushToTalk') {
                if (overallRecordingStatus === 'recording') {
                    await stopPushToTalk()
                } else {
                    await startPushToTalk()
                }
            }
        }, [
            autoDetectionActive,
            autoDetectionForcedOffRef,
            connectRealtime,
            disconnectRealtime,
            handleJoin,
            isHuddleActive,
            isParticipant,
            overallRecordingStatus,
            recordingMode,
            realtimeStatus,
            setAutoDetectionActive,
            startPushToTalk,
            stopAutoRecorder,
            stopPushToTalk,
            toast,
            setAutoRecorderMessage,
        ])

        const micIconColorClass = useMemo(() => {
            return ''
        }, [
            autoDetectionActive,
            autoRecorderStatus,
            isDetectionSwitchOn,
            isMicrophoneSupported,
            microphonePermission,
            overallRecordingStatus,
        ])

        async function handleJoin() {
            if (!canJoin) {
                toast.error('You’re not invited to this huddle.')
                return
            }
            if (!isComplete) {
                toast.error('Add your name before joining the huddle.')
                return
            }

            try {
                await addParticipant.mutateAsync({
                    huddleId,
                    userId: profile.clientId,
                    displayName: profile.name.trim(),
                    avatarUrl: profile.avatar?.url ?? undefined,
                })
                toast.success('You joined the huddle.')
                debugLog('join huddle success', { huddleId })
            } catch (error) {
                console.error('Failed to join huddle', error)
                toast.error('Unable to join this huddle right now.')
                debugLog('join huddle failed', { error })
            }
        }

        async function handleLeave() {
            try {
                await removeParticipant.mutateAsync({
                    huddleId,
                    userId: profile.clientId,
                })
                if (!isDevEnvironment) {
                    await clearPresence.mutateAsync({
                        huddleId,
                        userId: profile.clientId,
                    })
                }
                toast.success('You left the huddle.')
                debugLog('leave huddle success', { huddleId })
            } catch (error) {
                console.error('Failed to leave huddle', error)
                toast.error('Unable to leave the huddle. Please try again.')
                debugLog('leave huddle failed', { error })
            }
        }

        async function handleEndHuddle() {
            if (isHuddleCompleted) {
                return
            }
            try {
                await endHuddleMutation.mutateAsync({
                    huddleId,
                    userId: profile.clientId,
                })
                
                // Generate AI summary only once when End huddle is clicked
                // Check if summary exists or if we've already attempted generation
                const hasGoal = groupedItems.outcome.length > 0
                const hasTask = groupedItems.task.length > 0
                const currentHasSummary = groupedItems.summary.length > 0
                const shouldGenerate = hasGoal && hasTask && !currentHasSummary && !summaryGenerationAttemptedRef.current

                if (shouldGenerate) {
                    // Mark as attempted immediately to prevent duplicate attempts
                    summaryGenerationAttemptedRef.current = true
                    setIsGeneratingSummary(true)
                    try {
                        const { generateHuddleSummary } = await import('~/server/generateHuddleSummary')
                        await generateHuddleSummary({
                            data: { huddleId },
                        })
                    } catch (summaryError) {
                        // Log but don't fail the end huddle operation
                        console.error('Failed to generate summary', summaryError)
                    } finally {
                        setIsGeneratingSummary(false)
                    }
                }

                toast.success('Huddle marked as complete. Time to celebrate the wins.')
            } catch (error) {
                console.error('Failed to end huddle', error)
                toast.error('Unable to mark the huddle as complete.')
            }
        }

        async function handleStartHuddle() {
            if (isHuddleActive) {
                return
            }
            try {
                await startHuddleMutation.mutateAsync({
                    huddleId,
                    userId: profile.clientId,
                })
                toast.success('Huddle restarted — let the ideas flow.')
            } catch (error) {
                console.error('Failed to start huddle', error)
                toast.error('Unable to start the huddle.')
            }
        }

        const transcriptEntries = useMemo<TranscriptEntry[]>(() => {
            return rawTranscriptChunks.map((entry) => {
                const metadata = entry.metadata as TranscriptMetadata | undefined
                const fallbackSource = entry.source ?? 'System'
                const speakerLabel =
                    (typeof metadata?.speakerLabel === 'string' && metadata.speakerLabel.trim() !== ''
                        ? metadata.speakerLabel
                        : fallbackSource).trim()
                const normalizedSpeakerId =
                    typeof metadata?.speakerId === 'string' ? metadata.speakerId.trim() : ''
                const speakerKey = (normalizedSpeakerId.length > 0 ? normalizedSpeakerId : undefined) ?? speakerLabel

                return {
                    id: entry.id,
                    text: entry.payload,
                    createdAt: entry.createdAt,
                    speakerLabel,
                    speakerKey,
                    badges: extractBadgesFromMetadata(metadata),
                }
            })
        }, [rawTranscriptChunks])

        const conversationSeed = useMemo(
            () => hashStringToSeed(String(huddle._id ?? slug)),
            [huddle._id, slug],
        )

        const speakerStyles = useMemo(() => {
            const assignments = new Map<string, SpeakerStyle>()
            let offset = 0
            for (const entry of transcriptEntries) {
                if (assignments.has(entry.speakerKey)) continue
                assignments.set(entry.speakerKey, createSpeakerStyle(conversationSeed, offset))
                offset += 1
            }
            return assignments
        }, [conversationSeed, transcriptEntries])

        // Assign colors to participants for planning item badges
        const participantColors = useMemo(() => {
            const assignments = new Map<string, {
                borderColorLight: string
                borderColorDark: string
                textColorLight: string
                textColorDark: string
            }>()
            const huddleSeed = hashStringToSeed(huddle._id)
            let offset = 0

            // Collect all unique participant identifiers
            const participantKeys = new Set<string>()
            for (const participant of huddle.participants) {
                if (participant.userId && participant.userId.trim().length > 0) {
                    participantKeys.add(participant.userId.trim())
                }
                if (participant.displayName && participant.displayName.trim().length > 0) {
                    participantKeys.add(participant.displayName.trim().toLowerCase())
                }
            }

            // Also collect from planning items (for items created by speakers not in participants list)
            for (const item of huddle.planningItems) {
                if (item.speakerId && item.speakerId.trim().length > 0) {
                    participantKeys.add(item.speakerId.trim())
                }
                if (item.speakerLabel && item.speakerLabel.trim().length > 0) {
                    participantKeys.add(item.speakerLabel.trim().toLowerCase())
                }
            }

            // Assign colors to each unique participant
            for (const key of participantKeys) {
                if (assignments.has(key)) continue
                const style = createSpeakerStyle(huddleSeed, offset)
                // Extract border and text colors from the style for both light and dark modes
                assignments.set(key, {
                    borderColorLight: style.style['--bubble-border-light'] || 'hsl(215, 20%, 82%)',
                    borderColorDark: style.style['--bubble-border-dark'] || 'hsl(215, 23%, 35%)',
                    textColorLight: style.style['--bubble-text-light'] || 'hsl(217, 19%, 27%)',
                    textColorDark: style.style['--bubble-text-dark'] || 'hsl(214, 32%, 92%)',
                })
                offset += 1
            }

            return assignments
        }, [huddle._id, huddle.participants, huddle.planningItems, isDark])

        const hasConversationStarted = transcriptEntries.length > 0

        const planningItemsById = useMemo(() => {
            type Item = (typeof huddle.planningItems)[number]
            const map: Record<string, Item> = {}
            for (const item of huddle.planningItems) {
                map[item.id] = item
            }
            return map
        }, [huddle.planningItems])

        // Detect voice-triggered removals and show toast, and track newly added items
        useEffect(() => {
            const currentItemIds = new Set(huddle.planningItems.map((item) => item.id))
            const previousItems = previousItemsRef.current

            // Initialize on first run
            if (previousItems.length === 0) {
                previousItemsRef.current = [...huddle.planningItems]
                return
            }

            const previousItemIds = new Set(previousItems.map((item) => item.id))

            // Find items that were removed
            for (const previousItem of previousItems) {
                if (!currentItemIds.has(previousItem.id)) {
                    // Item was removed
                    const itemType = PLANNING_ITEM_TYPE_LABELS[previousItem.type] ?? 'item'
                    toast.success(`${itemType} removed`, {
                        icon: '🗑️',
                    })
                }
            }

            // Find items that were newly added
            const newItems: string[] = []
            for (const item of huddle.planningItems) {
                if (!previousItemIds.has(item.id)) {
                    newItems.push(item.id)
                }
            }

            // Add newly added items to the set and remove them after 1 second
            if (newItems.length > 0) {
                setNewlyAddedItemIds((prev) => {
                    const updated = new Set(prev)
                    for (const id of newItems) {
                        updated.add(id)
                        // Remove after 1 second
                        setTimeout(() => {
                            setNewlyAddedItemIds((current) => {
                                const next = new Set(current)
                                next.delete(id)
                                return next
                            })
                        }, 1000)
                    }
                    return updated
                })
            }

            // Update previous items
            previousItemsRef.current = [...huddle.planningItems]
        }, [huddle.planningItems])

        const groupedItems = useMemo(() => {
            type Item = (typeof huddle.planningItems)[number]
            const groups: Record<PlanningItemType, Array<Item>> = PLANNING_ITEM_TYPES.reduce(
                (acc, type) => {
                    acc[type] = []
                    return acc
                },
                {} as Record<PlanningItemType, Array<Item>>,
            )

            for (const item of huddle.planningItems) {
                groups[item.type]?.push(item)
            }

            PLANNING_ITEM_TYPES.forEach((type) => {
                groups[type] = [...groups[type]].sort((a, b) => {
                    const orderA = a.order ?? Number.POSITIVE_INFINITY
                    const orderB = b.order ?? Number.POSITIVE_INFINITY
                    if (orderA !== orderB) return orderA - orderB
                    return a.timestamp.localeCompare(b.timestamp)
                })
            })

            return groups
        }, [huddle.planningItems])

        // Get tasks for Linear export
        const tasksForLinear = useMemo(() => {
            return groupedItems.task.map((task) => ({ text: task.text }))
        }, [groupedItems.task])

        // Track if we've already attempted summary generation (prevents regeneration)
        // Initialize to true if summary already exists (e.g., huddle was already completed)
        const summaryGenerationAttemptedRef = useRef(groupedItems.summary.length > 0)
        const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)

        const autoTitleAttemptedGoalIdsRef = useRef(new Set<string>())
        const previousPlanningItemsCountRef = useRef(huddle.planningItems.length)
        const lastCreatedItemIdRef = useRef<string | null>(null)

        // Watch for new planning items and update URL
        useEffect(() => {
            const currentCount = huddle.planningItems.length
            const previousCount = previousPlanningItemsCountRef.current

            // If a new item was added
            if (currentCount > previousCount && currentCount > 0) {
                // Find the most recently created item (by timestamp)
                const sortedItems = [...huddle.planningItems].sort((a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )
                const newestItem = sortedItems[0]

                // Only update if this is a different item than the last one we processed
                if (newestItem && newestItem.id !== lastCreatedItemIdRef.current) {
                    lastCreatedItemIdRef.current = newestItem.id

                    // Update URL with the new itemId
                    void router.navigate({
                        to: '/huddles/$huddleSlug',
                        params: { huddleSlug: slug },
                        search: {
                            itemId: newestItem.id,
                        },
                        replace: false,
                    })
                }
            }

            previousPlanningItemsCountRef.current = currentCount
        }, [huddle.planningItems, router, slug])

        useEffect(() => {
            if (typeof huddle.autoTitleGeneratedAt === 'string') {
                return
            }
            const goalItems = groupedItems.outcome ?? []
            if (goalItems.length === 0) {
                return
            }
            const primaryGoal = goalItems[0]
            if (!primaryGoal || typeof primaryGoal.id !== 'string') {
                return
            }
            if (typeof primaryGoal.text !== 'string' || primaryGoal.text.trim().length === 0) {
                return
            }
            if (autoTitleAttemptedGoalIdsRef.current.has(primaryGoal.id)) {
                return
            }
            autoTitleAttemptedGoalIdsRef.current.add(primaryGoal.id)
            void requestHuddleAutoTitle({
                data: {
                    huddleId: huddle._id as string,
                    goalId: primaryGoal.id,
                },
            }).catch((error) => {
                console.error('Failed to request auto-generated huddle title', error)
                autoTitleAttemptedGoalIdsRef.current.delete(primaryGoal.id)
            })
        }, [groupedItems, huddle._id, huddle.autoTitleGeneratedAt])

        const renderItemList = useCallback((
            items: Array<(typeof huddle.planningItems)[number]>,
            type: PlanningItemType,
        ) => {
            return (
                <PlanningItemList
                    items={items}
                    type={type}
                    participantsByUserId={participantsByUserId}
                    participantsByName={participantsByName}
                    participantColors={participantColors}
                    planningItemsById={planningItemsById}
                    highlightedItemId={highlightedItemId}
                    newlyAddedItemIds={newlyAddedItemIds}
                    primaryForegroundColor={primaryForegroundColor}
                    isDark={isDark}
                    huddleId={huddle._id}
                    itemRefs={itemRefs}
                    onItemRef={(id) => {
                        return (el: HTMLElement | null) => {
                            if (el) {
                                itemRefs.current.set(id, el)
                            } else {
                                itemRefs.current.delete(id)
                            }
                        }
                    }}
                    onUpdateItem={(id, text) => {
                        updatePlanningItem.mutate({
                            id,
                            huddleId: huddle._id,
                            text,
                        })
                    }}
                    onDeleteItem={(id) => {
                        deletePlanningItem.mutate({
                            id,
                            huddleId: huddle._id,
                        })
                    }}
                    // Research feature disabled - keeping code for future use
                    // onResearchClick={async (itemId, itemText) => {
                    //     try {
                    //         await performResearch({
                    //             data: {
                    //                 planningItemId: itemId,
                    //                 huddleId: huddle._id,
                    //                 query: itemText,
                    //             },
                    //         })
                    //         toast.success('Research started')
                    //     } catch (error) {
                    //         console.error('Failed to start research', error)
                    //         toast.error(
                    //             error instanceof Error
                    //                 ? error.message
                    //                 : 'Failed to start research',
                    //         )
                    //     }
                    // }}
                    onResearchClick={undefined}
                    canEdit={isParticipant}
                />
            )
        }, [
            participantsByUserId,
            participantsByName,
            participantColors,
            planningItemsById,
            highlightedItemId,
            newlyAddedItemIds,
            primaryForegroundColor,
            isDark,
            huddle._id,
            itemRefs,
            updatePlanningItem,
            deletePlanningItem,
            isParticipant,
        ])

        const resolveJoinTimestamp = useCallback(
            (participant: (typeof huddle.participants)[number]) => {
                const parsed = Date.parse(participant.joinedAt)
                if (!Number.isNaN(parsed)) {
                    return parsed
                }
                return Number.MAX_SAFE_INTEGER
            },
            [],
        )

        const participantEntries = useMemo(
            () =>
                huddle.participants
                    .filter((entry) => (entry.role ?? '').toLowerCase() !== 'observer')
                    .slice()
                    .sort(
                        (a, b) => resolveJoinTimestamp(a) - resolveJoinTimestamp(b),
                    ),
            [huddle.participants, resolveJoinTimestamp],
        )
        const observerEntries = useMemo(
            () =>
                huddle.participants
                    .filter((entry) => (entry.role ?? '').toLowerCase() === 'observer')
                    .slice()
                    .sort(
                        (a, b) => resolveJoinTimestamp(a) - resolveJoinTimestamp(b),
                    ),
            [huddle.participants, resolveJoinTimestamp],
        )
        // Find any existing record for the current user in this huddle (participant or observer)
        const currentUserEntry = useMemo(
            () => huddle.participants.find((p) => p.userId === profile.clientId) ?? null,
            [huddle.participants, profile.clientId],
        )
        const isAutoObserverRegistrationEnabled = true
        const shouldRegisterObserver = useMemo(
            () =>
                isAutoObserverRegistrationEnabled &&
                !isParticipant &&
                typeof profile.clientId === 'string' &&
                profile.clientId.trim().length > 0 &&
                (!isPrivate || hasValidShareKey) &&
                // Only register when we are certain there is no record yet for this user.
                currentUserEntry === null,
            [
                currentUserEntry,
                isAutoObserverRegistrationEnabled,
                isParticipant,
                profile.clientId,
                isPrivate,
                hasValidShareKey,
            ],
        )

        const observerRequestKeyRef = useRef<string | null>(null)
        const observerRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
        useEffect(() => {
            if (!shouldRegisterObserver) {
                observerRequestKeyRef.current = null
                if (observerRetryTimerRef.current) {
                    clearTimeout(observerRetryTimerRef.current)
                    observerRetryTimerRef.current = null
                }
            }
        }, [shouldRegisterObserver])

        useEffect(() => {
            if (!isAutoObserverRegistrationEnabled) {
                debugLog('observer registration disabled temporarily')
                return
            }
            if (!shouldRegisterObserver) {
                debugLog('observer registration skipped', {
                    shouldRegisterObserver,
                    requestKey: observerRequestKeyRef.current,
                })
                return
            }
            if (isRegisterObserverPending) {
                // Retry shortly if a previous call is still pending
                if (!observerRetryTimerRef.current) {
                    observerRetryTimerRef.current = setTimeout(() => {
                        observerRetryTimerRef.current = null
                        // Trigger effect re-run by updating a stable dep via no-op; rely on deps changes
                        debugLog('observer registration retry scheduled')
                    }, 500)
                }
                return
            }
            debugLog('observer registration effect fired', {
                requestKey: observerRequestKeyRef.current,
            })
            const requestKey = `${huddleId}:${profile.clientId}`
            if (observerRequestKeyRef.current === requestKey) {
                debugLog('observer registration suppressed (duplicate request)', {
                    requestKey,
                })
                return
            }
            observerRequestKeyRef.current = requestKey
            const controller = new AbortController()
                ; (async () => {
                    const name =
                        typeof profile.name === 'string' && profile.name.trim().length > 0
                            ? profile.name.trim()
                            : undefined
                    try {
                        await registerObserverAsync({
                            huddleId,
                            userId: profile.clientId,
                            displayName: name ?? 'Anonymous',
                            avatarUrl: profile.avatar?.url ?? undefined,
                        })
                        debugLog('observer registration succeeded', { requestKey })
                        observerRequestKeyRef.current = null
                    } catch (error) {
                        if (!controller.signal.aborted) {
                            console.error('Failed to register observer', error)
                        }
                        observerRequestKeyRef.current = null
                    }
                })()
            return () => {
                controller.abort()
                if (observerRequestKeyRef.current === requestKey) {
                    observerRequestKeyRef.current = null
                }
                if (observerRetryTimerRef.current) {
                    clearTimeout(observerRetryTimerRef.current)
                    observerRetryTimerRef.current = null
                }
            }
        }, [
            huddleId,
            profile.avatar?.url,
            profile.clientId,
            profile.name,
            isAutoObserverRegistrationEnabled,
            shouldRegisterObserver,
            isRegisterObserverPending,
            registerObserverAsync,
            debugLog,
        ])

        const handleToggleInviteOnly = useCallback(
            async (enabled: boolean) => {
                try {
                    await setInviteOnly.mutateAsync({
                        huddleId,
                        userId: profile.clientId,
                        isInviteOnly: enabled,
                    })
                    toast.success(enabled ? 'Huddle is now invite-only' : 'Huddle is now public')
                } catch (error) {
                    console.error('Failed to toggle invite-only', error)
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : 'Failed to update invite-only settings',
                    )
                }
            },
            [huddleId, profile.clientId, setInviteOnly],
        )

        const handleTogglePrivate = useCallback(
            async (enabled: boolean) => {
                try {
                    await setPrivate.mutateAsync({
                        huddleId,
                        userId: profile.clientId,
                        isPrivate: enabled,
                    })
                    // If making private, turn off invite-only so anyone with the share link can join
                    if (enabled && isInviteOnly) {
                        await setInviteOnly.mutateAsync({
                            huddleId,
                            userId: profile.clientId,
                            isInviteOnly: false,
                        })
                    }
                    toast.success(enabled ? 'Huddle is now private' : 'Huddle is now public')
                } catch (error) {
                    console.error('Failed to toggle private mode', error)
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : 'Failed to update privacy settings',
                    )
                }
            },
            [huddleId, profile.clientId, setPrivate, setInviteOnly, isInviteOnly],
        )

        const handleInviteUser = useCallback(
            async (userId: string, displayName?: string, avatarUrl?: string) => {
                try {
                    await inviteUser.mutateAsync({
                        huddleId,
                        userId: profile.clientId,
                        inviteUserId: userId,
                        displayName,
                        avatarUrl,
                    })
                    toast.success('User invited successfully')
                } catch (error) {
                    console.error('Failed to invite user', error)
                    toast.error(
                        error instanceof Error ? error.message : 'Failed to invite user',
                    )
                }
            },
            [huddleId, profile.clientId, inviteUser],
        )

        const handleRemoveInvite = useCallback(
            async (removeUserId: string) => {
                try {
                    await removeInvite.mutateAsync({
                        huddleId,
                        userId: profile.clientId,
                        removeUserId,
                    })
                    toast.success('Invitation removed')
                } catch (error) {
                    console.error('Failed to remove invite', error)
                    toast.error(
                        error instanceof Error ? error.message : 'Failed to remove invitation',
                    )
                }
            },
            [huddleId, profile.clientId, removeInvite],
        )

        const handleAutoEndHuddle = useCallback(async () => {
            try {
                await autoEndHuddle.mutateAsync({ huddleId })
                toast.success('Free huddle time limit reached. Huddle has been automatically ended.')
            } catch (error) {
                console.error('Failed to auto-end huddle', error)
                // Don't show error toast for auto-end, just log it
            }
        }, [huddleId, autoEndHuddle])

        const participantsPanel = (
            <ParticipantsPanel
                participants={participantEntries}
                observers={observerEntries}
                speakingUserIds={speakingUserIds}
                recordingUserIds={recordingUserIds}
                currentUserId={profile.clientId}
                isParticipant={isParticipant}
                isJoining={isJoining}
                isLeaving={isLeaving}
                isOwner={isOwner}
                isHuddleActive={isHuddleActive}
                isStartPending={startHuddleMutation.isPending}
                isEndPending={endHuddleMutation.isPending}
                canJoin={canJoin}
                isInviteOnly={isInviteOnly}
                invitedUserIds={invitedUserIds}
                isPrivate={isPrivate}
                canTogglePrivate={isOwner && userHasActiveSubscription}
                privateAccessKey={huddle.privateAccessKey}
                huddleSlug={slug}
                isFreeLimitExceeded={isFreeLimitExceeded}
                isOwnerHasNoSubscription={isOwner && !userHasActiveSubscription}
                canShowHuddleAction={
                    // Show End button when active; when completed, only allow restart if not time-limited
                    isHuddleActive || (!isTimeLimited && isHuddleCompleted)
                }
                onSubscribe={isOwner && !userHasActiveSubscription ? handleSubscribe : undefined}
                onStartHuddle={handleStartHuddle}
                onEndHuddle={handleEndHuddle}
                onJoin={handleJoin}
                onLeave={handleLeave}
                onToggleInviteOnly={handleToggleInviteOnly}
                onTogglePrivate={handleTogglePrivate}
                onInviteUser={handleInviteUser}
                onRemoveInvite={handleRemoveInvite}
            />
        )

        return (
            <>
                <div className="flex min-h-full flex-col">
                    <div className="mx-auto flex w-full flex-1 items-start gap-x-8 p-6">
                        <aside className="sticky top-8 hidden w-72 shrink-0 lg:block">
                            <div className="space-y-4">
                                {participantsPanel}
                                {import.meta.env.DEV ? (
                                    <>
                                        {/* ResearchDebug disabled - research features hidden */}
                                        {/* <ResearchDebug
                                        planningItems={huddle.planningItems}
                                        huddleId={huddle._id}
                                    /> */}
                                        <DevDiagnostics
                                            userHasActiveSubscription={userHasActiveSubscription}
                                            isTimeLimited={isTimeLimited}
                                            createdAt={huddle.createdAt}
                                            participants={huddle.participants}
                                            participantEntries={participantEntries}
                                            observerEntries={observerEntries}
                                        />
                                    </>
                                ) : null}
                            </div>
                        </aside>
                        <main className="flex-1 space-y-8 max-w-7xl">
                            <div className="lg:hidden">
                                {participantsPanel}
                                {import.meta.env.DEV ? (
                                    <div className="mt-4 space-y-4">
                                        {/* ResearchDebug disabled - research features hidden */}
                                        {/* <ResearchDebug
                                        planningItems={huddle.planningItems}
                                        huddleId={huddle._id}
                                    /> */}
                                        <DevDiagnostics
                                            userHasActiveSubscription={userHasActiveSubscription}
                                            isTimeLimited={isTimeLimited}
                                            createdAt={huddle.createdAt}
                                            participants={huddle.participants}
                                            participantEntries={participantEntries}
                                            observerEntries={observerEntries}
                                        />
                                    </div>
                                ) : null}
                            </div>
                            
                            <HuddleHeader
                                huddleName={huddle.name}
                                huddleId={huddle._id}
                                createdAt={huddle.createdAt}
                                ownerDisplayName={ownerDisplayName}
                                isOwner={isOwner}
                                isHuddleCompleted={isHuddleCompleted}
                                hasLinearToken={hasLinearToken}
                                linearProjectUrl={huddle.linearProjectUrl}
                                clientId={profile.clientId}
                                onUpdateName={async (name) => {
                                    await updateHuddleName.mutateAsync({
                                        huddleId: huddle._id,
                                        userId: profile.clientId,
                                        name,
                                    })
                                }}
                                onOpenReport={() => setIsReportModalOpen(true)}
                                onOpenLinearProject={() => setIsLinearProjectDialogOpen(true)}
                                onConnectLinear={async () => {
                                    try {
                                        const { getLinearAuthUrl } = await import('~/server/linear')
                                        const { authUrl } = await getLinearAuthUrl({
                                            data: { userId: profile.clientId },
                                        })
                                        sessionStorage.setItem('linear-oauth-return-url', window.location.href)
                                        window.location.href = authUrl
                                    } catch (error) {
                                        console.error('Failed to initiate Linear OAuth', error)
                                        toast.error('Failed to start Linear authentication')
                                    }
                                }}
                            />

                            {/* Summary section - shown only if there's a generated summary or one is being generated */}
                            {(groupedItems.summary.length > 0 || isGeneratingSummary) && (
                                <SummaryCard
                                    items={groupedItems.summary}
                                    renderItemList={renderItemList}
                                    isLoading={isGeneratingSummary}
                                />
                            )}


                            {isHuddleActive ? (
                                <RecordingControlsCard
                                    isDetectionSwitchOn={isDetectionSwitchOn}
                                    autoDetectionActive={autoDetectionActive}
                                    overallRecordingStatus={overallRecordingStatus}
                                    onDetectionSwitchChange={handleDetectionSwitchChange}
                                    onToggleRecording={handleToggleRecording}
                                    buttonDisabled={buttonDisabled}
                                    buttonColorClass={buttonColorClass}
                                    micIconColorClass={micIconColorClass}
                                    showRecordingEqualizer={showRecordingEqualizer}
                                    buttonLabel={buttonLabel}
                                    primaryStatus={primaryStatus}
                                    turnCountLabel={devTurnCountLabel}
                                    isParticipant={isParticipant}
                                    microphonePermission={microphonePermission}
                                />
                            ) : null}

                            {isRealtimePrototypeActive ? (
                                <RealtimePrototypeCard
                                    realtimeStatus={realtimeStatus}
                                    realtimeStatusLabel={realtimeStatusLabel}
                                    maskedRealtimeSecret={maskedRealtimeSecret}
                                    realtimeCallId={realtimeCallId}
                                    realtimeSecretExpiryLabel={realtimeSecretExpiryLabel}
                                    realtimeError={realtimeError}
                                    isRealtimeSessionReady={isRealtimeSessionReady}
                                    isHuddleCompleted={isHuddleCompleted}
                                    isParticipant={isParticipant}
                                    realtimeRemoteStream={realtimeRemoteStream}
                                    onToggleRecording={handleToggleRecording}
                                    onRefreshSecret={refreshRealtimeSecret}
                                />
                            ) : null}

                            <PlanningBoard
                                groupedItems={groupedItems}
                                renderItemList={renderItemList}
                            />

                            {hasConversationStarted ? (
                                <SupportingSections
                                    groupedItems={groupedItems}
                                    renderItemList={renderItemList}
                                />
                            ) : null}

                            <TranscriptCard
                                entries={transcriptEntries}
                                speakerStyles={speakerStyles}
                                participantsByUserId={participantsByUserId}
                                participantsByName={participantsByName}
                                fallbackSpeakerStyle={FALLBACK_SPEAKER_STYLE}
                                microphoneStatusMessage={microphoneStatusMessage}
                                microphoneError={microphoneError}
                                lastRecordingDuration={lastRecordingDuration}
                            />

                            {isDevEnvironment ? (
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={isDevToolbarVisible ? 'secondary' : 'outline'}
                                        onClick={() => setIsDevToolbarVisible((previous) => !previous)}
                                    >
                                        {isDevToolbarVisible ? 'Hide developer toolbar' : 'Show developer toolbar'}
                                    </Button>
                                </div>
                            ) : null}
                        </main>
                        {isDevEnvironment && isDevToolbarVisible ? (
                            <aside className="sticky top-8 hidden shrink-0 xl:block">
                                <DevTranscriptToolbar
                                    huddleId={huddle._id}
                                    planningItems={huddle.planningItems}
                                    transcriptChunks={huddle.transcriptChunks}
                                />
                            </aside>
                        ) : null}
                    </div>
                    <ReportModal
                        open={isReportModalOpen}
                        onOpenChange={setIsReportModalOpen}
                        huddle={huddle}
                        transcriptEntries={transcriptEntries}
                    />
                    <NameDialog
                        open={isNameDialogOpen}
                        onOpenChange={setIsNameDialogOpen}
                        currentName={rawProfileName}
                        isComplete={isComplete}
                        isReady={isReady}
                        currentParticipant={currentParticipant}
                        huddleId={huddle._id}
                        clientId={profile.clientId}
                        avatarUrl={profile.avatar?.url}
                        onSetName={setName}
                        onRegisterObserver={registerObserverAsync}
                        onAddParticipant={addParticipant.mutateAsync}
                    />
                    <LinearAuthDialog
                        open={isLinearAuthDialogOpen}
                        onOpenChange={setIsLinearAuthDialogOpen}
                        userId={profile.clientId}
                        onAuthenticated={() => {
                            setIsLinearAuthDialogOpen(false)
                            setIsLinearProjectDialogOpen(true)
                        }}
                    />
                    <LinearProjectDialog
                        open={isLinearProjectDialogOpen}
                        onOpenChange={setIsLinearProjectDialogOpen}
                        userId={profile.clientId}
                        huddleId={huddle._id}
                        huddleSlug={slug || huddle.slug || ''}
                        projectName={huddle.name}
                        tasks={tasksForLinear}
                        onSuccess={() => {
                            setIsLinearProjectDialogOpen(false)
                        }}
                        onReauthenticate={() => {
                            setIsLinearAuthDialogOpen(true)
                        }}
                    />
                    {isOwner ? (
                        <DeleteHuddleDialog
                            open={isDeleteDialogOpen}
                            onOpenChange={setIsDeleteDialogOpen}
                            huddleName={huddle.name}
                            huddleId={huddle._id}
                            userId={profile.clientId}
                            isPending={deleteHuddleMutation.isPending}
                            onDelete={deleteHuddleMutation.mutateAsync}
                            onNavigate={() => void navigate({ to: '/' })}
                        />
                    ) : null}
                    <div className="h-8" />
                </div>
                {isTimeLimited ? (
                    <FreeHuddleTimer
                        createdAt={huddle.createdAt}
                        isCompleted={isHuddleCompleted}
                        onAutoEnd={handleAutoEndHuddle}
                        isOwner={isOwner}
                        hasActiveSubscription={userHasActiveSubscription}
                        onSubscribe={
                            isOwner && !userHasActiveSubscription ? handleSubscribe : undefined
                        }
                    />
                ) : null}
            </>
        )
    }
}
