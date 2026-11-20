import { useClerk } from '@clerk/clerk-react'
import { useAction, useConvexAuth } from 'convex/react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../convex/_generated/api'

export function useUpgradeCheckout() {
  const clerk = useClerk()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const checkout = useAction(api.autumn.checkout)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = isLoading || isSubmitting

  async function startCheckout() {
    if (isBusy) return

    if (!isAuthenticated) {
      if (clerk.user) {
        toast.error('Your sign-in could not be verified. Please sign in again.')
      } else {
        clerk.openSignIn()
      }
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error } = await checkout({
        productId: 'team_huddle_basic',
        successUrl: window.location.origin,
      })
      if (error || !data?.url) throw new Error('Checkout URL unavailable')
      window.location.assign(data.url)
    } catch {
      toast.error('Could not open checkout. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return { startCheckout, isBusy, isAuthenticated }
}
