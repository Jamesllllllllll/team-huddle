import { useUser } from '@clerk/clerk-react'
import { useConvexAuth } from 'convex/react'
import { useEffect, useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useUserProfile } from '../context/UserProfileContext'

/**
 * Hook to automatically store/update the current user in Convex after Clerk authentication.
 * Also migrates guest data if the user had a guest clientId before signing up.
 * Returns loading and authentication states combined.
 */
export function useStoreUser() {
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth()
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser()
  const { profile } = useUserProfile()
  const [userId, setUserId] = useState<Id<'users'> | null>(null)
  const hasMigratedRef = useRef(false)
  
  const storeUser = useConvexMutation(api.users.store)
  const storeUserMutation = useMutation({
    mutationFn: storeUser,
    onSuccess: (id) => {
      setUserId(id)
      hasMigratedRef.current = true
    },
  })

  // Track the guest clientId that we're migrating from to prevent re-migration
  // This ensures we only migrate once per guest session, even if profile.clientId changes
  const migratingGuestIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    // If Clerk isn't loaded yet, don't do anything
    if (!clerkLoaded) {
      return
    }

    // If Convex is still loading, wait
    if (convexLoading) {
      return
    }

    // If the user is not authenticated in Convex, don't do anything
    if (!convexAuthenticated || !clerkUser) {
      setUserId(null)
      hasMigratedRef.current = false
      migratingGuestIdRef.current = undefined
      return
    }

    // Skip if we've already migrated this session
    if (hasMigratedRef.current) {
      return
    }

    // Store the user in the database.
    // The storeUser mutation gets the user information via ctx.auth.getUserIdentity()
    // on the server. We also pass the guest clientId to migrate their data.
    async function createUser() {
      try {
        // Only migrate guest data if:
        // 1. There's a guest clientId in localStorage
        // 2. It's different from the Clerk user ID (so it's actually a guest ID, not the logged-in user)
        // 3. We haven't already migrated this specific guest ID
        const guestClientId = profile.clientId || undefined
        const clerkExternalId = clerkUser?.id
        
        // Check if we're already migrating this guest ID
        if (migratingGuestIdRef.current === guestClientId) {
          return // Already processing this migration
        }
        
        // Only pass guestClientId if it's actually different from the Clerk ID
        // This prevents syncing a new guest clientId when user logs in on a different device
        const shouldMigrate = guestClientId && 
          clerkExternalId && 
          guestClientId !== clerkExternalId &&
          !guestClientId.startsWith('user_') // Clerk IDs start with 'user_', guest IDs don't
        
        // Mark that we're migrating this guest ID
        if (shouldMigrate) {
          migratingGuestIdRef.current = guestClientId
        }
        
        // Migrate guest profile data (name and avatar) if available
        // This ensures the user's chosen name and avatar are preserved when they sign up
        const guestName = shouldMigrate && profile.name?.trim() ? profile.name.trim() : undefined
        const guestAvatarUrl = shouldMigrate && profile.avatar?.url ? profile.avatar.url : undefined
        
        // Extract primary email from Clerk user object
        // Clerk stores emails in email_addresses array, with primary_email_address_id pointing to the primary one
        const primaryEmailAddressId = clerkUser?.primaryEmailAddressId
        const primaryEmail = clerkUser?.emailAddresses?.find(
          (email: any) => email.id === primaryEmailAddressId
        )?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || undefined
        
        const id = await storeUserMutation.mutateAsync({ 
          guestClientId: shouldMigrate ? guestClientId : undefined,
          guestName: guestName || undefined,
          guestAvatarUrl: guestAvatarUrl || undefined,
          clerkEmail: primaryEmail, // Pass email as fallback if identity.email is not available
        })
        setUserId(id)
        hasMigratedRef.current = true
      } catch (error: any) {
        // If it's an auth error, it might be a timing issue - don't log as error
        // The user might not be fully authenticated yet, so we'll retry on next render
        if (error?.message?.includes('authentication') || error?.message?.includes('auth')) {
          console.warn('Auth not ready yet, will retry:', error.message)
          hasMigratedRef.current = false // Allow retry
          migratingGuestIdRef.current = undefined // Reset so we can retry
        } else {
          console.error('Error storing user:', error)
          // Don't reset hasMigratedRef on other errors - avoid infinite retry loops
        }
      }
    }

    // Add a small delay to ensure the JWT token is fully validated
    const timeoutId = setTimeout(() => {
      createUser()
    }, 100)
    
    return () => {
      clearTimeout(timeoutId)
      // Reset userId when user logs out or changes
      setUserId(null)
      // Don't reset hasMigratedRef here - only reset when user actually changes
      // This prevents re-running the migration when the effect cleanup runs during re-renders
    }
    // Only depend on authentication state and user identity - not on mutation objects or profile.clientId
    // The profile.clientId might change after migration (guest ID -> Convex user ID), but we don't want to re-migrate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexAuthenticated, convexLoading, clerkUser?.id, clerkLoaded])

  // Combine the local state with the state from context
  return {
    isLoading: convexLoading || (convexAuthenticated && userId === null && !clerkLoaded),
    isAuthenticated: convexAuthenticated && userId !== null && clerkLoaded,
    userId,
  }
}

