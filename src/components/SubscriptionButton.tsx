import { useCustomer } from 'autumn-js/react'
import { useConvexAuth } from 'convex/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/components/ui/button'
import { useUpdateSubscriptionStatusMutation, userQueries } from '~/queries'
import { Spinner } from '~/components/ui/Spinner'

/**
 * Subscription button component for the header.
 * Wrapper: waits for Convex auth before mounting the Autumn hooks, to avoid unauthenticated Autumn calls.
 */
export function SubscriptionButton() {
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } = useConvexAuth()

  // Don't mount Autumn hooks until Convex auth is ready
  if (isConvexLoading || !isConvexAuthenticated) {
    return null
  }

  return <AuthenticatedSubscriptionButton />
}

/**
 * Inner implementation that assumes Convex auth is ready and the user is authenticated.
 * Shows current plan name (e.g., "Basic"); on hover switches to "Manage plan" and opens billing portal on click.
 * If not subscribed, shows "Subscribe" and starts checkout directly.
 * Relies on Autumn's `useCustomer` for source of truth.
 */
function AuthenticatedSubscriptionButton() {
  const { customer, openBillingPortal, checkout, isLoading, refetch } = useCustomer()
  const updateSubscriptionStatus = useUpdateSubscriptionStatusMutation()
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [isManaging, setIsManaging] = useState(false)
  const lastSyncedRef = useRef<{
    hasActive: boolean
    planId?: string
    planName?: string
  } | null>(null)
  const hasRefetchedOnceRef = useRef(false)

  // Convex subscription status drives the UI; avoid early returns before all hooks are declared
  const { data: subscriptionStatus, isLoading: isSubscriptionLoading } = useQuery(userQueries.subscriptionStatus())

  // Sync subscription status to Convex whenever Autumn customer data changes
  useEffect(() => {
    if (!customer) return

    const active =
      customer.products?.filter((p) => p.status === 'active' || p.status === 'trialing') ?? []
    const hasActive = active.length > 0
    const current = active[0] ?? null

    const nextState = {
      hasActive,
      planId: current?.id ?? undefined,
      planName: current?.name ?? undefined,
    }

    // Only push an update to Convex if something actually changed
    if (
      !lastSyncedRef.current ||
      lastSyncedRef.current.hasActive !== nextState.hasActive ||
      lastSyncedRef.current.planId !== nextState.planId ||
      lastSyncedRef.current.planName !== nextState.planName
    ) {
      lastSyncedRef.current = nextState
      updateSubscriptionStatus.mutate({
        hasActiveSubscription: nextState.hasActive,
        subscriptionPlanId: nextState.planId,
        subscriptionPlanName: nextState.planName,
      })
    }
  }, [customer, updateSubscriptionStatus])

  // Ensure we refetch customer data once on mount (helps after returning from checkout)
  useEffect(() => {
    if (!isLoading && customer === null && !hasRefetchedOnceRef.current) {
      hasRefetchedOnceRef.current = true
      void refetch()
    }
  }, [customer, isLoading, refetch])

  const getBaseUrl = () => (typeof window !== 'undefined' ? window.location.origin : '')

  // After declaring all hooks, guard render to avoid flashing wrong label
  if (isSubscriptionLoading || subscriptionStatus === undefined || subscriptionStatus === null) {
    return null
  }

  const hasActiveSubscription = subscriptionStatus.hasActiveSubscription ?? false
  const planLabel = subscriptionStatus.subscriptionPlanName || subscriptionStatus.subscriptionPlanId || 'Plan'

  return (
    hasActiveSubscription ? (
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        key={isManaging ? 'loading' : 'idle'}
        onClick={async () => {
          if (isManaging) return
          setIsManaging(true)
          try {
            const { data } = await openBillingPortal({ returnUrl: getBaseUrl() })
            if (data?.url) {
              window.location.href = data.url
            }
          } finally {
            // setIsManaging(false)
          }
        }}
        disabled={isManaging}
        className={`gap-2 px-4 py-2 border dark:border-input group inline-grid grid-cols-1 grid-rows-1 whitespace-nowrap place-items-center cursor-pointer disabled:pointer-events-none disabled:opacity-50 h-8 rounded-md text-sm font-medium ring-offset-background transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${isManaging ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            key={isManaging ? 'loading' : 'idle'}
            className="[grid-area:1/1] w-full h-full relative flex items-center justify-center"
          >
            {isManaging ? (
              <span className="left-1/2 -ml-2 w-full h-full flex items-center justify-center relative"><Spinner size={16} color="currentColor" /></span>
            ) : (
              <div className="grid grid-cols-1 grid-rows-1 place-items-center">
                <span
                  style={{ gridArea: '1 / 1' }}
                  className="[grid-area:1/1] transition-opacity duration-150 hidden md:inline group-hover:opacity-0"
                >
                  {planLabel}
                </span>
                <span
                  style={{ gridArea: '1 / 1' }}
                  className="[grid-area:1/1] transition-opacity duration-150 hidden md:inline opacity-0 group-hover:opacity-100"
                >
                  Manage plan
                </span>
              </div>
            )}
          </motion.span>
        </AnimatePresence>
        <span className="invisible [grid-area:1/1]">{planLabel}</span>
      </motion.button>
    ) : (
      <div className="relative inline-flex items-center group">
        <span className="pointer-events-none absolute right-full mr-2 hidden md:block text-xs text-muted-foreground translate-x-2 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 whitespace-nowrap">
          Fully private huddles & no time limits with your API key
        </span>
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          onClick={async () => {
            if (isUpgrading) return
            setIsUpgrading(true)
            const { data } = await checkout({ productId: 'team_huddle_basic', successUrl: getBaseUrl() })
            if (data?.url) {
              window.location.href = data.url
            }
          }}
          disabled={isUpgrading}
          className="inline-grid grid-cols-1 grid-rows-1 place-items-center rounded-md text-sm font-medium ring-offset-background transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-2 md:px-2.5 py-0 cursor-pointer"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              key={isUpgrading ? 'loading' : 'idle'}
              className="[grid-area:1/1] relative flex items-center justify-center"
            >
              {isUpgrading ? <Spinner size={16} color="rgba(255,255,255,0.8)" /> : 'Upgrade'}
            </motion.span>
          </AnimatePresence>
          <span className="invisible [grid-area:1/1]">Upgrade</span>
        </motion.button>
      </div>
    )
  )
}

