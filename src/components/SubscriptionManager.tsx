import { useCustomer } from 'autumn-js/react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Authenticated, Unauthenticated, useConvexAuth } from 'convex/react'
import toast from 'react-hot-toast'
import { useEffect, useRef } from 'react'
import { Badge } from '~/components/ui/badge'
import { formatDate } from '~/utils/dates'
import { useUpdateSubscriptionStatusMutation } from '~/queries'

/**
 * Get the base URL for redirects based on environment.
 * Returns localhost:3000 in development, https://teamhuddle.live in production.
 */
function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: use environment variable or default
    const env = (import.meta as any).env
    if (env.PROD) {
      return 'https://teamhuddle.live'
    }
    return 'http://localhost:3000'
  }
  
  // Client-side: use current origin or environment-based URL
  const env = (import.meta as any).env
  if (env.PROD) {
    // In production, use the production URL
    return 'https://teamhuddle.live'
  }
  
  // In development, use current origin (localhost:3000)
  return window.location.origin
}

/**
 * Subscription management component for logged-in users.
 * Displays current subscription status and allows users to manage their subscriptions.
 */
export function SubscriptionManager() {
  const { customer, checkout, attach, cancel, openBillingPortal, isLoading, refetch } = useCustomer()
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } = useConvexAuth()
  const updateSubscriptionStatus = useUpdateSubscriptionStatusMutation()
  
  // Debug: Log customer data in dev (only once when customer changes, not on every render)
  const lastLoggedCustomerIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (import.meta.env.DEV) {
      const customerId = customer?.id || undefined
      // Only log if customer ID actually changed
      if (customerId !== lastLoggedCustomerIdRef.current) {
        lastLoggedCustomerIdRef.current = customerId
        if (customer) {
          console.log('[SubscriptionManager] Customer loaded:', {
            customerId: customer.id,
            productCount: customer.products?.length || 0,
            activeProducts: customer.products?.filter(p => p.status === 'active' || p.status === 'trialing').length || 0,
          })
        } else if (!isLoading && isConvexAuthenticated) {
          console.warn('[SubscriptionManager] No customer data after loading. Possible causes:')
          console.warn('1. Customer not created in Autumn yet')
          console.warn('2. Customer ID mismatch between Convex auth and Autumn')
          console.warn('3. Autumn API error (check Convex logs)')
        }
      }
    }
  }, [customer?.id, isLoading, isConvexAuthenticated])

  // Sync plan info to Convex whenever customer data is available/changes
  useEffect(() => {
    if (!isConvexAuthenticated || isConvexLoading) return
    if (!customer) return

    const activeProducts = (customer.products || []).filter(
      (p) => p.status === 'active' || p.status === 'trialing',
    )
    const currentProduct = activeProducts.find((p) => p.id === 'team_huddle_basic') || activeProducts[0]
    const hasActive = activeProducts.length > 0
    const planId = currentProduct?.id || undefined
    const planName = currentProduct?.name || undefined

    updateSubscriptionStatus.mutate({
      hasActiveSubscription: hasActive,
      subscriptionPlanId: planId,
      subscriptionPlanName: planName,
    })
  }, [customer, isConvexAuthenticated, isConvexLoading, updateSubscriptionStatus])

  // Wait for Convex authentication before showing subscription options
  // Note: useCustomer() will handle its own loading state and customer data fetching
  // Only block if Convex auth isn't ready - let useCustomer() handle its own loading
  if (isConvexLoading || !isConvexAuthenticated) {
    if (import.meta.env.DEV) {
      console.log('[SubscriptionManager] Waiting for Convex auth:', {
        isConvexLoading,
        isConvexAuthenticated,
      })
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Waiting for authentication...
            {import.meta.env.DEV && (
              <span className="block text-xs mt-1 text-muted-foreground/70">
                {isConvexLoading && 'Initializing Convex... '}
                {!isConvexAuthenticated && 'Not authenticated in Convex'}
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    )
  }

  // Show loading state from useCustomer() separately
  if (isLoading) {
    if (import.meta.env.DEV) {
      console.log('[SubscriptionManager] useCustomer() is loading:', {
        isLoading,
        hasCustomer: !!customer,
      })
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Loading subscription information...
            {import.meta.env.DEV && (
              <span className="block text-xs mt-1 text-muted-foreground/70">
                Fetching customer data from Autumn...
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>
          Manage your subscription and billing information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Unauthenticated>
          <p className="text-sm text-muted-foreground">
            Please sign in to manage your subscription.
          </p>
        </Unauthenticated>
        
        <Authenticated>
          {customer ? (
            (() => {
              // Show all products, not just active ones, for debugging
              const allProducts = customer.products || []
              const activeProducts = allProducts.filter(
                (p) => p.status === 'active' || p.status === 'trialing'
              )
              const hasActiveSubscription = activeProducts.length > 0
              const currentProduct = activeProducts.find((p) => p.id === 'team_huddle_basic') || activeProducts[0]
              
              // In dev, show all products for debugging
              if (import.meta.env.DEV && allProducts.length > 0 && !hasActiveSubscription) {
                console.warn('[SubscriptionManager] Found products but none are active/trialing:', allProducts)
              }

              return (
                <div className="space-y-4">
                  {hasActiveSubscription && currentProduct ? (
                    <>
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

                      <div className="flex flex-wrap gap-2">
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
                    </>
                  ) : (
                    <div className="space-y-4">
                      {import.meta.env.DEV && customer?.products && customer.products.length > 0 ? (
                        <div className="space-y-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                          <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                            Debug: Found {customer.products.length} product(s) but none are active:
                          </p>
                          {customer.products.map((p) => (
                            <div key={p.id} className="text-xs text-yellow-700 dark:text-yellow-300">
                              • {p.name || p.id} - Status: {p.status}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {import.meta.env.DEV && !customer ? (
                        <div className="space-y-2 p-3 rounded-md">
                          <p className="text-xs font-semibold">
                            Debug: No customer data loaded
                          </p>
                          <p className="text-xs">
                            Customer exists in Autumn but not loading. This might be a customer ID mismatch.
                            Check Convex logs for the customerId being sent by the identify function.
                          </p>
                          <p className="text-xs mt-2">
                            Expected customer ID in Autumn: <code className="px-1 rounded">user_35Wq5rDl5jSNofnV7rPTCxRk6Vc</code>
                            <br />
                            Check Convex logs to see what customerId the identify function is returning.
                          </p>
                        </div>
                      ) : null}
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
                              // Payment details already on file - show confirmation
                              toast.success('Subscription created successfully')
                              await refetch()
                            }
                          } catch (err) {
                            console.error('Checkout failed:', err)
                            toast.error('Failed to start checkout. Please try again.')
                          }
                        }}
                        variant="default"
                      >
                        Subscribe to Team Huddle Basic
                      </Button>
                    </div>
                  )}
                </div>
              )
            })()
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Loading customer information...
              </p>
            </div>
          )}
        </Authenticated>
      </CardContent>
    </Card>
  )
}

