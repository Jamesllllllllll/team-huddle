import * as React from 'react'
import { useConvexAuth } from 'convex/react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/components/ui/button'
import { userQueries } from '~/queries'

type OpenAIApiKeyButtonProps = {
  onOpenDialog: () => void
}

/**
 * Button component for managing OpenAI API key in the header.
 * Shows "+ API Key" when no key is set, or "API Key" when a key exists.
 * Only visible to authenticated users with active subscriptions.
 */
export function OpenAIApiKeyButton({ onOpenDialog }: OpenAIApiKeyButtonProps) {
  const { isAuthenticated } = useConvexAuth()
  const subscriptionStatusQuery = useQuery({
    ...userQueries.subscriptionStatus(),
    enabled: isAuthenticated,
  })
  const hasApiKeyQuery = useQuery({
    ...userQueries.hasOpenAIApiKey(),
    enabled: isAuthenticated,
  })

  const hasSubscription = subscriptionStatusQuery.data?.hasActiveSubscription ?? false
  const hasApiKey = hasApiKeyQuery.data ?? false

  // Only show for authenticated users with subscriptions
  if (!isAuthenticated || !hasSubscription) {
    return null
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 px-2 md:px-3"
      onClick={onOpenDialog}
    >
      <span className="hidden md:inline">
        {hasApiKey ? 'API Key' : '+ API Key'}
      </span>
    </Button>
  )
}

