import * as React from 'react'
import { useConvexAuth } from 'convex/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'

const STORAGE_KEY = 'huddle:user-profile'

type AvatarSource = 'upload' | 'camera' | 'generated' | 'preset'

export type UserAvatar = {
  url: string
  storageId: string
  source: AvatarSource
  updatedAt: string
}

export type UserProfile = {
  clientId: string
  name: string
  avatar: UserAvatar | null
  lastUpdated: string
}

type UserProfileContextValue = {
  profile: UserProfile
  setName: (name: string) => void
  setAvatar: (avatar: UserAvatar | null) => void
  reset: () => void
  isComplete: boolean
  isReady: boolean
}

function generateClientId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `anonymous-${Math.random().toString(36).slice(2, 10)}`
}

function createEmptyProfile(): UserProfile {
  return {
    clientId: generateClientId(),
    name: '',
    avatar: null,
    lastUpdated: new Date(0).toISOString(),
  }
}

const UserProfileContext = React.createContext<UserProfileContextValue | null>(
  null,
)

function readStoredProfile(): UserProfile | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    if (typeof parsed.name !== 'string') {
      return null
    }
    const avatar =
      parsed.avatar &&
      typeof parsed.avatar === 'object' &&
      typeof parsed.avatar.url === 'string' &&
      typeof parsed.avatar.storageId === 'string' &&
      typeof parsed.avatar.source === 'string'
        ? {
            url: parsed.avatar.url,
            storageId: parsed.avatar.storageId,
            source: parsed.avatar.source as AvatarSource,
            updatedAt:
              parsed.avatar.updatedAt ??
              parsed.lastUpdated ??
              new Date().toISOString(),
          }
        : null

    return {
      clientId:
        typeof parsed.clientId === 'string' && parsed.clientId.trim().length > 0
          ? parsed.clientId
          : generateClientId(),
      name: parsed.name.trim(),
      avatar,
      lastUpdated: parsed.lastUpdated ?? avatar?.updatedAt ?? new Date().toISOString(),
    }
  } catch (error) {
    console.warn('Failed to parse stored user profile', error)
    return null
  }
}

function storeProfile(profile: UserProfile) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch (error) {
    console.warn('Failed to persist user profile', error)
  }
}

export function UserProfileProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth()
  
  // Query Convex user data when authenticated
  const convexUserQuery = useQuery({
    ...convexQuery(api.users.current, {}),
    enabled: isAuthenticated,
  })

  const initialProfileRef = React.useRef<{
    profile: UserProfile
    loaded: boolean
  } | null>(null)

  if (!initialProfileRef.current) {
    // Default placeholder profile (no clientId) to avoid side-effects
    const placeholder: UserProfile = {
      clientId: '',
      name: '',
      avatar: null,
      lastUpdated: new Date(0).toISOString(),
    }

    if (typeof window === 'undefined') {
      // On the server, never generate a clientId
      initialProfileRef.current = {
        profile: placeholder,
        loaded: false,
      }
    } else if (isAuthenticated) {
      // Authenticated: wait for Convex user; don't touch localStorage yet
      initialProfileRef.current = {
        profile: placeholder,
        loaded: true,
      }
    } else if (isAuthLoading) {
      // Auth resolving: hold placeholder, let effect hydrate from storage later
      initialProfileRef.current = {
        profile: placeholder,
        loaded: false,
      }
    } else {
      // Not authenticated, auth settled: try storage first
      const stored = readStoredProfile()
      if (stored) {
        initialProfileRef.current = { profile: stored, loaded: true }
      } else {
        // No stored guest profile yet; delay creation to the guest hydration effect
        initialProfileRef.current = { profile: placeholder, loaded: false }
      }
    }
  }

  const [profileState, setProfileState] = React.useState<UserProfile>(() => {
    return initialProfileRef.current!.profile
  })
  const hasLoadedStorageRef = React.useRef<boolean>(
    initialProfileRef.current!.loaded,
  )

  // Wrapper around setProfileState that only updates if values actually changed
  // This prevents unnecessary re-renders when the same values are set
  const setProfile = React.useCallback((newProfile: UserProfile | ((prev: UserProfile) => UserProfile)) => {
    setProfileState((prev) => {
      const next = typeof newProfile === 'function' ? newProfile(prev) : newProfile
      
      // Check if values actually changed
      if (
        prev.clientId === next.clientId &&
        prev.name === next.name &&
        prev.lastUpdated === next.lastUpdated &&
        prev.avatar?.url === next.avatar?.url &&
        prev.avatar?.storageId === next.avatar?.storageId &&
        prev.avatar?.source === next.avatar?.source &&
        prev.avatar?.updatedAt === next.avatar?.updatedAt
      ) {
        // Values haven't changed - return the same object to prevent re-render
        return prev
      }
      
      // Values changed - return new object
      return next
    })
  }, [])

  // profileState is already stable because setProfile only updates when values change
  const profile = profileState

  // Load from localStorage for guest users
  React.useEffect(() => {
    // Skip if authenticated - we'll use Convex data instead
    if (isAuthenticated) {
      return
    }
    // Also skip while auth is still loading to avoid hydrating a guest profile
    // that could trigger side-effects (e.g., observer registration) before
    // the authenticated user is resolved.
    if (isAuthLoading) {
      return
    }
    
    if (hasLoadedStorageRef.current) {
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    const stored = readStoredProfile()
    if (stored) {
      setProfile(stored)
      hasLoadedStorageRef.current = true
      return
    }
    // Create and persist a new guest profile only now (definitively unauthenticated, no storage)
    const fresh = createEmptyProfile()
    setProfile(fresh)
    storeProfile(fresh)
    hasLoadedStorageRef.current = true
  }, [isAuthenticated, isAuthLoading])

  // Track the last Convex user data we've loaded to prevent unnecessary updates
  const lastLoadedDataRef = React.useRef<{
    userId: string
    name: string
    avatarUrl: string | null
    updatedAt: string
  } | null>(null)

  // Load from Convex when authenticated
  React.useEffect(() => {
    if (!isAuthenticated || isAuthLoading) {
      return
    }

    const convexUser = convexUserQuery.data
    if (convexUser) {
      // Only update if this is a different user or the data actually changed
      const currentUserId = convexUser._id
      const currentName = convexUser.name || ''
      const currentAvatarUrl = convexUser.avatarUrl || null
      // Use a stable timestamp - only use updatedAt if it exists, otherwise use a fixed value
      const currentUpdatedAt = convexUser.updatedAt || ''

      const lastLoaded = lastLoadedDataRef.current
      // Check if we need to update (different user or data changed)
      // Use strict comparison to avoid unnecessary updates
      const needsUpdate =
        !lastLoaded ||
        lastLoaded.userId !== currentUserId ||
        lastLoaded.name !== currentName ||
        lastLoaded.avatarUrl !== currentAvatarUrl ||
        lastLoaded.updatedAt !== currentUpdatedAt

      if (needsUpdate) {
        // Convert Convex user to UserProfile format
        // Use Convex user data, ignore localStorage clientId
        // Use a stable timestamp - if updatedAt exists, use it; otherwise use a fixed fallback
        const stableUpdatedAt = currentUpdatedAt || lastLoaded?.updatedAt || new Date(0).toISOString()
        const convexProfile: UserProfile = {
          clientId: currentUserId, // Use Convex _id as clientId for authenticated users
          name: currentName || '', // use empty string if no name
          avatar: currentAvatarUrl
            ? {
                url: currentAvatarUrl,
                storageId: '', // We don't store this in Convex users table currently
                source: 'upload' as AvatarSource, // Default assumption
                updatedAt: stableUpdatedAt,
              }
            : null,
          lastUpdated: stableUpdatedAt,
        }
        setProfile(convexProfile)
        // Also sync localStorage to avoid mismatched IDs on reload or when transitioning
        // between guest and authenticated states.
        try {
          storeProfile({
            ...convexProfile,
            name: convexProfile.name.trim(),
          })
        } catch {
          // non-fatal
        }
        lastLoadedDataRef.current = {
          userId: currentUserId,
          name: currentName,
          avatarUrl: currentAvatarUrl,
          updatedAt: currentUpdatedAt,
        }
      }
    } else if (convexUserQuery.isError || (!convexUserQuery.isLoading && !convexUser)) {
      // If query failed or returned null, reset the ref
      lastLoadedDataRef.current = null
    }
    // Only depend on the actual values, not the object reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    isAuthLoading,
    convexUserQuery.data?._id,
    convexUserQuery.data?.name,
    convexUserQuery.data?.avatarUrl,
    convexUserQuery.data?.updatedAt,
    convexUserQuery.isError,
    convexUserQuery.isLoading,
  ])

  // Only save to localStorage for guest users
  React.useEffect(() => {
    // Don't save to localStorage if authenticated - Convex is the source of truth
    if (isAuthenticated) {
      return
    }
    
    if (!hasLoadedStorageRef.current) {
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    // Trim the name when saving to localStorage to keep storage clean
    const trimmedProfile = {
      ...profile,
      name: profile.name.trim(),
    }
    storeProfile(trimmedProfile)
  }, [profile, isAuthenticated])

  // Stable refetch callback - use refetch directly from the query result
  const refetchConvexUserRef = React.useRef(convexUserQuery.refetch)
  refetchConvexUserRef.current = convexUserQuery.refetch
  
  // Mutations for updating Convex user data when authenticated
  const updateNameFn = useConvexMutation(api.users.updateName)
  const updateAvatarFn = useConvexMutation(api.users.updateAvatar)
  
  const updateNameMutation = useMutation({
    mutationFn: updateNameFn,
    onSuccess: () => {
      // Refetch Convex user data to update the profile
      refetchConvexUserRef.current()
    },
  })

  const updateAvatarMutation = useMutation({
    mutationFn: updateAvatarFn,
    onSuccess: () => {
      // Refetch Convex user data to update the profile
      refetchConvexUserRef.current()
    },
  })

  // Store mutate functions in refs to ensure stable references
  const mutateNameRef = React.useRef(updateNameMutation.mutate)
  const mutateAvatarRef = React.useRef(updateAvatarMutation.mutate)
  mutateNameRef.current = updateNameMutation.mutate
  mutateAvatarRef.current = updateAvatarMutation.mutate

  const setName = React.useCallback((name: string) => {
    if (isAuthenticated) {
      // Update Convex user when authenticated
      mutateNameRef.current({ name })
    } else {
      // Update localStorage for guest users
      setProfile((prev) => ({
        ...prev,
        name: name, // Don't trim during typing - allow spaces
        lastUpdated: new Date().toISOString(),
      }))
    }
  }, [isAuthenticated])

  const setAvatar = React.useCallback((avatar: UserAvatar | null) => {
    if (isAuthenticated) {
      // Update Convex user when authenticated
      mutateAvatarRef.current({ avatarUrl: avatar?.url || undefined })
    } else {
      // Update localStorage for guest users
      setProfile((prev) => ({
        ...prev,
        avatar,
        lastUpdated: new Date().toISOString(),
      }))
    }
  }, [isAuthenticated])

  const reset = React.useCallback(() => {
    setProfile(createEmptyProfile())
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [setProfile])

  // Only recreate context value when profile values actually change
  // Determine readiness:
  // - Authenticated users: ready when auth settled and convex user query fetched
  // - Guests: ready when local storage hydration has completed
  const isReady = React.useMemo(() => {
    if (isAuthenticated) {
      return !isAuthLoading && convexUserQuery.isFetched
    }
    return hasLoadedStorageRef.current
  }, [isAuthenticated, isAuthLoading, convexUserQuery.isFetched])

  const value = React.useMemo(
    () => ({
      profile,
      setName,
      setAvatar,
      reset,
      isComplete: profile.name.trim().length > 0,
      isReady,
    }),
    [profile, reset, setAvatar, setName, isReady],
  )

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile() {
  const context = React.useContext(UserProfileContext)
  if (!context) {
    throw new Error('useUserProfile must be used within UserProfileProvider')
  }
  return context
}


