import * as React from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  huddleQueries,
  useAddParticipantMutation,
  useCreateHuddleMutation,
  useResetAllHuddlesMutation,
  userQueries,
} from '~/queries'
import { Loader } from '~/components/Loader'
import { UserProfileSetup } from '~/components/UserProfileSetup'
import { useUserProfile } from '~/context/UserProfileContext'
import { formatDate } from '~/utils/dates'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { ChevronRight, Lock } from 'lucide-react'
import { PricingTable } from 'autumn-js/react'
import { useQuery } from '@tanstack/react-query'
import { useConvexAuth } from 'convex/react'

const HOME_DEBUG_TAG = '[HomeRoute]'
const isHomeDebugEnabled = import.meta.env.DEV

declare global {
  interface Window {
    HUDDLE_DEBUG_LOGS?: boolean
  }
}

// eslint-disable-next-line no-console
const homeDebugLog = (message: string, details?: Record<string, unknown>) => {
  // Disabled for now to reduce console noise while debugging Autumn subscription
  return
}

export const Route = createFileRoute('/')({
  component: Home,
  pendingComponent: () => <Loader />,
})

type PendingAction =
  | { type: 'create' }
  | { type: 'navigate'; slug: string }

function Home() {
  const huddlesQuery = useSuspenseQuery(huddleQueries.list())
  const createHuddle = useCreateHuddleMutation()
  const addParticipant = useAddParticipantMutation()
  const resetAllHuddles = useResetAllHuddlesMutation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  const { profile, isComplete, setName } = useUserProfile()
  const [profileAlertOpen, setProfileAlertOpen] = React.useState(false)
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null)
  const [nameDialogValue, setNameDialogValue] = React.useState(profile.name)
  
  const { isAuthenticated } = useConvexAuth()
  const subscriptionStatusQuery = useQuery({
    ...userQueries.subscriptionStatus(),
    enabled: isAuthenticated, // Only query when authenticated
  })
  const hasApiKeyQuery = useQuery({
    ...userQueries.hasOpenAIApiKey(),
    enabled: isAuthenticated, // Only query when authenticated
  })
  
  const hasSubscription = subscriptionStatusQuery.data?.hasActiveSubscription ?? false
  const hasApiKey = hasApiKeyQuery.data ?? false

  const renderCountRef = React.useRef(0)
  renderCountRef.current += 1
  homeDebugLog('render', {
    renderCount: renderCountRef.current,
    isComplete,
    profileAlertOpen,
    pendingActionType: pendingAction?.type ?? null,
    pendingActionSlug: pendingAction?.type === 'navigate' ? pendingAction.slug : null,
    huddleCount: huddlesQuery.data.length,
    createPending: createHuddle.isPending,
    addParticipantPending: addParticipant.isPending,
    resetPending: resetAllHuddles.isPending,
  })

  const executeAction = React.useCallback(
    async (action: PendingAction, isFree = false) => {
      homeDebugLog('executeAction called', action)
      if (action.type === 'navigate') {
        await router.navigate({
          to: '/huddles/$huddleSlug',
          params: { huddleSlug: action.slug },
        })
        return
      }

      const timestamp = new Date()
      const slug = `huddle-${timestamp.getTime().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`
      const name = `New Huddle ${timestamp.toLocaleTimeString()}`

      try {
        const huddleId = await createHuddle.mutateAsync({
          slug,
          name,
          createdBy: profile.clientId,
          status: 'active',
          forceTimeLimited: isFree, // Force time-limited for free huddles
        })

        await addParticipant.mutateAsync({
          huddleId,
          userId: profile.clientId,
          displayName: profile.name.trim(),
          avatarUrl: profile.avatar?.url ?? undefined,
        })

        await router.navigate({
          to: '/huddles/$huddleSlug',
          params: { huddleSlug: slug },
        })
        homeDebugLog('huddle created and navigated', { slug, huddleId })
      } catch (error) {
        console.error('Failed to create huddle', error)
        homeDebugLog('create huddle failed', {
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        toast.error('Unable to create a new huddle.')
      }
    },
    [addParticipant, createHuddle, profile, router],
  )

  React.useEffect(() => {
    if (!isComplete || !pendingAction) {
      return
    }

    let cancelled = false
    const action = pendingAction
    setPendingAction(null)
      ; (async () => {
        try {
          await executeAction(action)
          if (!cancelled) {
            setProfileAlertOpen(false)
          }
        } catch (error) {
          console.error('Failed to finish pending action', error)
          toast.error('Something went wrong. Please try again.')
        }
      })()

    return () => {
      cancelled = true
    }
  }, [executeAction, isComplete, pendingAction])

  function handleCreateHuddleIntent() {
    homeDebugLog('handleCreateHuddleIntent')
    if (!isComplete) {
      homeDebugLog('blocking create huddle - profile incomplete')
      setPendingAction({ type: 'create' })
      setNameDialogValue(profile.name)
      setProfileAlertOpen(true)
      return
    }

    executeAction({ type: 'create' })
  }
  

  function handleAttemptJoin(
    event: React.MouseEvent<HTMLAnchorElement>,
    slug: string,
    huddle?: { isPrivate?: boolean; createdBy?: string },
  ) {
    homeDebugLog('handleAttemptJoin', { slug })
    event.preventDefault()
    
    // Check if huddle is private and user is not owner
    if (huddle) {
      const isPrivate = huddle.isPrivate === true
      const isOwner = huddle.createdBy === profile.clientId || 
        (typeof profile.name === 'string' && profile.name.trim().length > 0 && 
         huddle.createdBy === profile.name.trim())
      if (isPrivate && !isOwner) {
        toast.error('This huddle is private. You need a share link to access it.')
        return
      }
    }
    
    if (!isComplete) {
      homeDebugLog('blocking join - profile incomplete', { slug })
      setPendingAction({ type: 'navigate', slug })
      setNameDialogValue(profile.name)
      setProfileAlertOpen(true)
      return
    }

    executeAction({ type: 'navigate', slug })
  }

  async function handleResetAllHuddles() {
    homeDebugLog('handleResetAllHuddles intent')
    const confirmed = window.confirm(
      'Reset all huddles? This clears all huddles and related data, then re-seeds a sample huddle.\n\n' +
      (import.meta.env.DEV
        ? 'This will work in dev mode.'
        : 'This requires HUDDLE_ALLOW_DEV_RESET=true in production.'),
    )
    if (!confirmed) {
      homeDebugLog('reset cancelled')
      return
    }
    try {
      await resetAllHuddles.mutateAsync(undefined)
      await queryClient.invalidateQueries()
      toast.success('All huddles reset successfully.')
      homeDebugLog('reset completed')
    } catch (error) {
      console.error('Failed to reset huddles', error)
      homeDebugLog('reset failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      const errorMessage = error instanceof Error ? error.message : 'Unable to reset huddles right now.'
      toast.error(errorMessage)
    }
  }

  function handleAlertAction() {
    const trimmed = nameDialogValue.trim()
    if (!trimmed) {
      return
    }
    setName(trimmed)
  }

  React.useEffect(() => {
    homeDebugLog('profile updated', {
      name: profile.name,
      hasAvatar: Boolean(profile.avatar),
      clientId: profile.clientId,
      isComplete,
    })
  }, [isComplete, profile])

  React.useEffect(() => {
    homeDebugLog('profile alert state', { profileAlertOpen })
  }, [profileAlertOpen])

  React.useEffect(() => {
    homeDebugLog('pending action changed', {
      pendingActionType: pendingAction?.type ?? null,
      pendingActionSlug: pendingAction?.type === 'navigate' ? pendingAction.slug : null,
    })
  }, [pendingAction])

  React.useEffect(() => {
    homeDebugLog('query data updated', {
      huddleCount: huddlesQuery.data.length,
      huddleNames: huddlesQuery.data.map((huddle) => huddle.name),
    })
  }, [huddlesQuery.data])

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Huddles</h1>
          <p className="text-sm">
            Launch a new planning session or jump back into an existing one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {import.meta.env.DEV && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleResetAllHuddles}
              disabled={resetAllHuddles.isPending}
              title="Reset all huddles (dev only - works in prod if HUDDLE_ALLOW_DEV_RESET=true)"
            >
              {resetAllHuddles.isPending ? 'Resetting…' : 'Reset All Huddles'}
            </Button>
          )}
          <Button
            type="button"
            onClick={handleCreateHuddleIntent}
            disabled={createHuddle.isPending || addParticipant.isPending}
          >
            {createHuddle.isPending || addParticipant.isPending
              ? 'Creating…'
              : 'Create New Huddle'}
          </Button>
        </div>
      </header>

      {/* Profile Management */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <UserProfileSetup nameInputRef={nameInputRef} />
        </div>
      </div>

      {huddlesQuery.data.length === 0 ? (
        <p className="text-slate-500">No huddles yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {huddlesQuery.data.map((huddle) => {
            const participantList = Array.isArray(huddle.participants) ? huddle.participants : []
            const participantNames = participantList
              .filter(
                (participant) =>
                  (participant.role ?? '').toLowerCase() !== 'observer' &&
                  typeof participant.displayName === 'string' &&
                  participant.displayName.trim().length > 0,
              )
              .map((participant) => participant.displayName!.trim())
            const fallbackNames = participantList
              .filter((participant) => (participant.role ?? '').toLowerCase() !== 'observer')
              .map((participant) => participant.displayName?.trim() ?? 'Anonymous')
            const displayNames =
              participantNames.length > 0
                ? participantNames
                : fallbackNames.length > 0
                  ? fallbackNames
                  : ['No participants yet']
            const statusLabel = huddle.status === 'completed' ? 'Ended' : 'In progress'
            const statusTone =
              huddle.status === 'completed'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/10 dark:text-emerald-300 dark:border-emerald-800/50'
                : 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/10 dark:text-sky-300 dark:border-sky-800/50'
            
            const isPrivate = huddle.isPrivate === true
            const isOwner = huddle.createdBy === profile.clientId || 
              (typeof profile.name === 'string' && profile.name.trim().length > 0 && 
               huddle.createdBy === profile.name.trim())
            const canAccess = !isPrivate || isOwner
            const isPrivateAndNoAccess = isPrivate && !isOwner

            return (
              <div
                key={huddle._id}
                className={isPrivateAndNoAccess ? 'cursor-not-allowed' : 'group block'}
              >
                {canAccess ? (
                  <Link
                    to="/huddles/$huddleSlug"
                    params={{ huddleSlug: huddle.slug }}
                    onClick={(event) => handleAttemptJoin(event, huddle.slug, huddle)}
                    className="block"
                  >
                    <Card className="group-hover:border-primary transition duration-200">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <CardTitle className="text-xl font-semibold">
                              {huddle.name}
                            </CardTitle>
                            <CardDescription>
                              Created {formatDate(huddle.createdAt)}
                            </CardDescription>
                          </div>
                          {isPrivate && (
                            <Badge
                              variant="outline"
                              className="shrink-0 flex items-center gap-1"
                            >
                              <Lock className="h-3 w-3" />
                              Private
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <section>
                          <p className="text-xs font-semibold uppercase tracking-wide">
                            Participants
                          </p>
                          <p className="mt-1 text-smline-clamp-3">
                            {displayNames.join(', ')}
                          </p>
                        </section>
                      </CardContent>
                      <CardFooter className="flex items-center justify-between">
                        <Badge
                          aria-label={`Huddle status: ${statusLabel}`}
                          className={statusTone}
                        >
                          {statusLabel}
                        </Badge>
                        <Badge className="mr-2 group-hover:gap-2 group-hover:mr-1.5 transition-all duration-300">
                          View huddle
                          <ChevronRight className="size-6" />
                        </Badge>
                      </CardFooter>
                    </Card>
                  </Link>
                ) : (
                  <Card className="opacity-60">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <CardTitle className="text-xl font-semibold">
                            {huddle.name}
                          </CardTitle>
                          <CardDescription>
                            Created {formatDate(huddle.createdAt)}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 flex items-center gap-1"
                        >
                          <Lock className="h-3 w-3" />
                          Private
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <section>
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          Participants
                        </p>
                        <p className="mt-1 text-smline-clamp-3">
                          {displayNames.join(', ')}
                        </p>
                      </section>
                    </CardContent>
                    <CardFooter className="flex items-center justify-between">
                      <Badge
                        aria-label={`Huddle status: ${statusLabel}`}
                        className={statusTone}
                      >
                        {statusLabel}
                      </Badge>
                      <Badge className="mr-2 opacity-50">
                        View huddle
                        <ChevronRight className="size-6" />
                      </Badge>
                    </CardFooter>
                  </Card>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={profileAlertOpen} onOpenChange={(open) => {
        setProfileAlertOpen(open)
        if (!open) {
          setPendingAction(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enter your name to continue</AlertDialogTitle>
            <AlertDialogDescription>
              Add your name to create or join a huddle so teammates know who you are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4 space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="home-name-dialog-input"
            >
              First name
            </label>
            <Input
              id="home-name-dialog-input"
              placeholder="Jane"
              value={nameDialogValue}
              maxLength={60}
              onChange={(event) => setNameDialogValue(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setProfileAlertOpen(false)
                setPendingAction(null)
              }}
            >
              Maybe later
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={handleAlertAction}
              disabled={!nameDialogValue.trim()}
            >
              Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
