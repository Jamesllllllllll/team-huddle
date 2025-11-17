import { useCustomer } from 'autumn-js/react'
import { Authenticated, Unauthenticated, useConvexAuth } from 'convex/react'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import toast from 'react-hot-toast'
import { formatDate } from '~/utils/dates'

/**
 * Get the base URL for redirects based on environment.
 * Returns localhost:3000 in development, https://teamhuddle.live in production.
 */
function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    const env = (import.meta as any).env
    if (env.PROD) {
      return 'https://teamhuddle.live'
    }
    return 'http://localhost:3000'
  }
  
  const env = (import.meta as any).env
  if (env.PROD) {
    return 'https://teamhuddle.live'
  }
  
  return window.location.origin
}

type SubscriptionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dialog component for managing subscriptions.
 * Contains all the subscription management options from SubscriptionManager.
 */
export function SubscriptionDialog({ open, onOpenChange }: SubscriptionDialogProps) {
  const { customer, checkout, attach, cancel, openBillingPortal, isLoading, refetch } = useCustomer()
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } = useConvexAuth()

  // Wait for authentication
  if (isConvexLoading || !isConvexAuthenticated) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Waiting for authentication...
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Loading subscription information...
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  const allProducts = customer?.products || []
  const activeProducts = allProducts.filter(
    (p) => p.status === 'active' || p.status === 'trialing'
  )
  const hasActiveSubscription = activeProducts.length > 0
  const currentProduct = activeProducts.find((p) => p.id === 'team_huddle_basic') || activeProducts[0]

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Subscription</AlertDialogTitle>
          <AlertDialogDescription>
            Manage your subscription and billing information
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Unauthenticated>
            <p className="text-sm text-muted-foreground">
              Please sign in to manage your subscription.
            </p>
          </Unauthenticated>
          
          <Authenticated>
            {customer ? (
              hasActiveSubscription && currentProduct ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Current Plan</p>
                      <Badge
                        variant={
                          currentProduct.status === 'active'
                            ? 'default'
                            : currentProduct.status === 'trialing'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {currentProduct.status === 'active'
                          ? 'Active'
                          : currentProduct.status === 'trialing'
                            ? 'Trialing'
                            : currentProduct.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {currentProduct.name || currentProduct.id}
                    </p>
                    {currentProduct.current_period_end && (
                      <p className="text-xs text-muted-foreground">
                        Renews on{' '}
                        {formatDate(new Date(currentProduct.current_period_end))}
                      </p>
                    )}
                    {currentProduct.canceled_at && currentProduct.current_period_end && (
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        Cancels on{' '}
                        {formatDate(new Date(currentProduct.current_period_end))}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {currentProduct.id !== 'team_huddle_basic' && (
                      <Button
                        onClick={async () => {
                          try {
                            const { data, error } = await attach({
                              productId: 'team_huddle_basic',
                              successUrl: getBaseUrl(),
                            })
                            if (error) {
                              console.error('Attach error:', error)
                              toast.error(error.message || 'Failed to upgrade')
                              return
                            }
                            if (data && 'checkout_url' in data && data.checkout_url) {
                              window.location.href = data.checkout_url
                            } else {
                              toast.success('Subscription upgraded successfully')
                              await refetch()
                              onOpenChange(false)
                            }
                          } catch (err) {
                            console.error('Upgrade failed:', err)
                            toast.error('Failed to upgrade. Please try again.')
                          }
                        }}
                        variant="default"
                        size="sm"
                      >
                        Upgrade to Team Huddle Basic
                      </Button>
                    )}
                    
                    {!currentProduct.canceled_at ? (
                      <Button
                        onClick={async () => {
                          if (
                            !window.confirm(
                              'Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period.'
                            )
                          ) {
                            return
                          }
                          try {
                            const { error } = await cancel({
                              productId: currentProduct.id,
                            })
                            if (error) {
                              console.error('Cancel error:', error)
                              toast.error(error.message || 'Failed to cancel subscription')
                              return
                            }
                            toast.success('Subscription cancelled successfully')
                            await refetch()
                            onOpenChange(false)
                          } catch (err) {
                            console.error('Cancel failed:', err)
                            toast.error('Failed to cancel subscription. Please try again.')
                          }
                        }}
                        variant="outline"
                        size="sm"
                      >
                        Cancel Subscription
                      </Button>
                    ) : (
                      <Button
                        onClick={async () => {
                          try {
                            const { data, error } = await attach({
                              productId: currentProduct.id,
                              successUrl: getBaseUrl(),
                            })
                            if (error) {
                              console.error('Reactivate error:', error)
                              toast.error(error.message || 'Failed to reactivate subscription')
                              return
                            }
                            if (data && 'checkout_url' in data && data.checkout_url) {
                              window.location.href = data.checkout_url
                            } else {
                              toast.success('Subscription reactivated successfully')
                              await refetch()
                              onOpenChange(false)
                            }
                          } catch (err) {
                            console.error('Reactivate failed:', err)
                            toast.error('Failed to reactivate subscription. Please try again.')
                          }
                        }}
                        variant="default"
                        size="sm"
                      >
                        Reactivate Subscription
                      </Button>
                    )}

                    <Button
                      onClick={async () => {
                        try {
                          const { data, error } = await openBillingPortal({
                            returnUrl: getBaseUrl(),
                          })
                          if (error) {
                            console.error('Billing portal error:', error)
                            toast.error(error.message || 'Failed to open billing portal')
                            return
                          }
                          if (data?.url) {
                            window.location.href = data.url
                          }
                        } catch (err) {
                          console.error('Billing portal failed:', err)
                          toast.error('Failed to open billing portal. Please try again.')
                        }
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Manage Billing
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {customer ? 'No active subscription. Subscribe to get started.' : 'Subscribe to get started.'}
                  </p>
                  <Button
                    onClick={async () => {
                      try {
                        const { data, error } = await checkout({
                          productId: 'team_huddle_basic',
                          successUrl: getBaseUrl(),
                        })
                        if (error) {
                          console.error('Checkout error:', error)
                          toast.error(error.message || 'Failed to start checkout')
                          return
                        }
                        if (data?.url) {
                          window.location.href = data.url
                        } else if (data) {
                          toast.success('Subscription created successfully')
                          await refetch()
                          onOpenChange(false)
                        }
                      } catch (err) {
                        console.error('Checkout failed:', err)
                        toast.error('Failed to start checkout. Please try again.')
                      }
                    }}
                    variant="default"
                    className="w-full"
                  >
                    Subscribe to Team Huddle Basic
                  </Button>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Loading customer information...
              </p>
            )}
          </Authenticated>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

