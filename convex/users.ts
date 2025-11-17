import { v } from 'convex/values'
import { internalMutation, mutation, query, QueryCtx, MutationCtx } from './_generated/server'

/**
 * Store or update the current authenticated user in Convex.
 * This should be called after a user signs in with Clerk.
 * Optionally migrates guest data if a guest clientId is provided.
 */
export const store = mutation({
  args: {
    // Optional: guest clientId to migrate from (from localStorage)
    guestClientId: v.optional(v.string()),
    // Optional: guest profile data to migrate (name and avatar from localStorage)
    guestName: v.optional(v.string()),
    guestAvatarUrl: v.optional(v.string()),
    // Optional: email from Clerk (fallback if identity.email is not available)
    clerkEmail: v.optional(v.string()),
  },
  handler: async (ctx, { guestClientId, guestName, guestAvatarUrl, clerkEmail }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Called storeUser without authentication present')
    }

    // Use tokenIdentifier as recommended by Convex docs for user lookups
    const tokenIdentifier = identity.tokenIdentifier
    // Also keep externalId (Clerk user ID) for backwards compatibility and Autumn integration
    const externalId = identity.subject

    // Check if we've already stored this user before using tokenIdentifier
    // Note: This follows the Convex recommended pattern
    const existing = await ctx.db
      .query('users')
      .withIndex('by_token', (q) => q.eq('tokenIdentifier', tokenIdentifier))
      .unique()

    const now = new Date().toISOString()

    // Prefer guest profile data over Clerk identity data when migrating
    // This ensures the user's chosen name and avatar are preserved.
    // Never use "Anonymous" - use guest name if available, otherwise Clerk name,
    // otherwise derive a name from email (identity.email or clerkEmail) before requiring manual input.
    const emailForName = identity.email?.trim() || clerkEmail?.trim() || null
    const emailLocalPart =
      emailForName && emailForName.includes('@')
        ? emailForName.split('@')[0]?.trim()
        : null
    // Determine name source priority for safe updates
    const trimmedGuestName = guestName?.trim() || ''
    const trimmedIdentityName = identity.name?.trim() || ''
    const derivedEmailName = emailLocalPart || ''
    let nameSource: 'guest' | 'identity' | 'emailDerived' | 'none' = 'none'
    let computedName = ''
    if (trimmedGuestName) {
      nameSource = 'guest'
      computedName = trimmedGuestName
    } else if (trimmedIdentityName) {
      nameSource = 'identity'
      computedName = trimmedIdentityName
    } else if (derivedEmailName) {
      nameSource = 'emailDerived'
      computedName = derivedEmailName
    } else {
      nameSource = 'none'
      computedName = ''
    }

    const name = computedName || null
    if (!name || name.length === 0) {
      throw new Error('Name is required. Please set your name before signing up.')
    }

    // Prefer guest avatar over Clerk picture
    const avatarUrl = guestAvatarUrl || identity.pictureUrl || undefined
    
    // Extract email: prefer identity.email (from JWT), fallback to clerkEmail (from client)
    // This ensures we always get the primary email address from Clerk
    const email = identity.email?.trim() || clerkEmail?.trim() || undefined
    
    const userData = {
      name,
      tokenIdentifier,
      externalId,
      email,
      avatarUrl,
      updatedAt: now,
    }

    if (existing) {
      // If we've seen this identity before, update with new data
      // Prefer guest profile data if provided (for migration scenarios)
      // Also backfill tokenIdentifier if it's missing (for existing users)
      // Important: Avoid overwriting an existing, user-edited name with an email-derived fallback.
      // Only update the name if it comes from a stronger source (guest or identity), or if the existing name is empty.
      const shouldUpdateName =
        !!trimmedGuestName ||
        !!trimmedIdentityName ||
        !existing.name

      const updatedName = shouldUpdateName ? userData.name : existing.name

      const needsUpdate = 
        existing.name !== updatedName || 
        existing.email !== userData.email ||
        existing.avatarUrl !== userData.avatarUrl ||
        !existing.tokenIdentifier // Backfill tokenIdentifier for existing users
      
      if (needsUpdate) {
        // Don't overwrite migratedFromGuestId if it's already set
        const updateDataBase = existing.migratedFromGuestId
          ? userData
          : { ...userData, migratedFromGuestId: guestClientId }
        const updateData = { ...updateDataBase, name: updatedName }
        
        await ctx.db.patch(existing._id, updateData)
      }
      
      // If we have a guest ID and haven't migrated yet, migrate the data
      if (guestClientId && !existing.migratedFromGuestId && guestClientId !== externalId) {
        await migrateGuestData(ctx, guestClientId, externalId)
      }
      
      return existing._id
    }

    // If it's a new identity, create a new `User`.
    const userId = await ctx.db.insert('users', {
      ...userData,
      migratedFromGuestId: guestClientId,
      createdAt: now,
    })

    // If we have a guest ID to migrate from, migrate all their data
    if (guestClientId && guestClientId !== externalId) {
      await migrateGuestData(ctx, guestClientId, externalId)
    }

    return userId
  },
})

/**
 * Migrate all guest data (huddles, participants, presence, etc.) from guest clientId to Clerk externalId.
 */
async function migrateGuestData(
  ctx: MutationCtx,
  oldGuestId: string,
  newClerkId: string,
) {
  // Skip if they're the same (shouldn't happen, but be safe)
  if (oldGuestId === newClerkId) {
    return
  }

  // 1. Migrate huddles created by this guest
  const huddles = await ctx.db
    .query('huddles')
    .withIndex('by_createdBy', (q) => q.eq('createdBy', oldGuestId))
    .collect()

  for (const huddle of huddles) {
    await ctx.db.patch(huddle._id, { createdBy: newClerkId })
  }

  // 2. Migrate invited user IDs in huddles
  const allHuddles = await ctx.db.query('huddles').collect()
  for (const huddle of allHuddles) {
    const invitedUserIds = huddle.invitedUserIds ?? []
    if (invitedUserIds.includes(oldGuestId)) {
      await ctx.db.patch(huddle._id, {
        invitedUserIds: invitedUserIds.map((id) => (id === oldGuestId ? newClerkId : id)),
      })
    }
  }

  // 3. Migrate participants
  const participants = await ctx.db
    .query('participants')
    .withIndex('by_user', (q) => q.eq('userId', oldGuestId))
    .collect()

  for (const participant of participants) {
    await ctx.db.patch(participant._id, { userId: newClerkId })
  }

  // 4. Migrate presence
  const presence = await ctx.db
    .query('presence')
    .withIndex('by_user', (q) => q.eq('userId', oldGuestId))
    .collect()

  for (const presenceEntry of presence) {
    await ctx.db.patch(presenceEntry._id, { userId: newClerkId })
  }

  // 5. Migrate planning items speakerId
  const planningItems = await ctx.db
    .query('planningItems')
    .filter((q) => q.eq(q.field('speakerId'), oldGuestId))
    .collect()

  for (const item of planningItems) {
    await ctx.db.patch(item._id, { speakerId: newClerkId })
  }

  // 6. Migrate linear tokens (if any exist with old guest ID)
  const linearTokens = await ctx.db
    .query('linearTokens')
    .withIndex('by_user', (q) => q.eq('userId', oldGuestId))
    .collect()

  for (const token of linearTokens) {
    await ctx.db.patch(token._id, { userId: newClerkId })
  }
}

/**
 * Get the current authenticated user.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx)
  },
})

/**
 * Helper to get the current user from context.
 * Returns null if not authenticated.
 * Uses tokenIdentifier as recommended by Convex docs.
 */
export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return null
  }
  return await userByTokenIdentifier(ctx, identity.tokenIdentifier)
}

/**
 * Get user by token identifier (recommended by Convex docs).
 * Falls back to externalId lookup if tokenIdentifier is not available.
 */
async function userByTokenIdentifier(ctx: QueryCtx, tokenIdentifier: string) {
  // First try to find by tokenIdentifier
  const byToken = await ctx.db
    .query('users')
    .withIndex('by_token', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique()
  
  if (byToken) {
    return byToken
  }
  
  // If not found and we have an identity, try falling back to externalId
  // This handles the case where existing users don't have tokenIdentifier yet
  const identity = await ctx.auth.getUserIdentity()
  if (identity?.subject) {
    return await userByExternalId(ctx, identity.subject)
  }
  
  return null
}

/**
 * Get user by Clerk external ID (for backwards compatibility and Autumn integration).
 */
async function userByExternalId(ctx: QueryCtx, externalId: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_external_id', (q) => q.eq('externalId', externalId))
    .unique()
}

/**
 * Get user by Clerk external ID (public query).
 */
export const byExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    return await userByExternalId(ctx, externalId)
  },
})

/**
 * Update the current user's name.
 * Never allows "Anonymous" - requires a real name.
 */
export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    const trimmedName = name.trim()
    // Never allow "Anonymous" as a name
    if (trimmedName.toLowerCase() === 'anonymous') {
      throw new Error('Please enter your actual name, not "Anonymous"')
    }
    await ctx.db.patch(user._id, {
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    })
    return user._id
  },
})

/**
 * Update the current user's avatar URL.
 */
export const updateAvatar = mutation({
  args: { avatarUrl: v.optional(v.string()) },
  handler: async (ctx, { avatarUrl }) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.patch(user._id, {
      avatarUrl: avatarUrl || undefined,
      updatedAt: new Date().toISOString(),
    })
    return user._id
  },
})

/**
 * Internal mutation for webhook handling (optional - for syncing with Clerk webhooks).
 * This can be used if you set up Clerk webhooks to automatically sync user data.
 * Note: Webhooks don't have JWT tokens, so we use externalId for lookups.
 * The tokenIdentifier will be set when the user next logs in via the store mutation.
 */
export const upsertFromClerk = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const externalId = data.id
    if (!externalId) {
      console.warn('Clerk webhook data missing user ID')
      return
    }

    const existing = await userByExternalId(ctx, externalId)
    const now = new Date().toISOString()

    const userData = {
      name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'Anonymous',
      externalId,
      email: data.email_addresses?.[0]?.email_address ?? undefined,
      avatarUrl: data.image_url ?? undefined,
      updatedAt: now,
    }

    if (existing) {
      // Update existing user (don't overwrite tokenIdentifier if it exists)
      await ctx.db.patch(existing._id, {
        ...userData,
        // Keep existing tokenIdentifier if it exists
        tokenIdentifier: existing.tokenIdentifier,
      })
    } else {
      // For new users from webhooks, we can't set tokenIdentifier yet
      // It will be set when they log in via the store mutation
      // Use a placeholder that will be updated on first login
      await ctx.db.insert('users', {
        ...userData,
        tokenIdentifier: `webhook_${externalId}`, // Placeholder - will be updated on login
        createdAt: now,
      })
    }
  },
})

/**
 * Internal mutation for webhook handling - delete user when deleted in Clerk.
 */
export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await userByExternalId(ctx, clerkUserId)
    if (user !== null) {
      await ctx.db.delete(user._id)
    } else {
      console.warn(`Can't delete user, there is none for Clerk user ID: ${clerkUserId}`)
    }
  },
})

/**
 * Get the current user's subscription status from Convex cache.
 * This is fast and always available, updated from Autumn when subscription changes.
 */
export const subscriptionStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      return null
    }
    return {
      hasActiveSubscription: user.hasActiveSubscription ?? false,
      subscriptionPlanId: user.subscriptionPlanId ?? null,
      subscriptionPlanName: user.subscriptionPlanName ?? null,
      subscriptionUpdatedAt: user.subscriptionUpdatedAt ?? null,
    }
  },
})

/**
 * Update the current user's subscription status in Convex cache.
 * This should be called when subscription data is loaded from Autumn to keep cache in sync.
 */
export const updateSubscriptionStatus = mutation({
  args: {
    hasActiveSubscription: v.boolean(),
    subscriptionPlanId: v.optional(v.string()),
    subscriptionPlanName: v.optional(v.string()),
  },
  handler: async (ctx, { hasActiveSubscription, subscriptionPlanId, subscriptionPlanName }) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.patch(user._id, {
      hasActiveSubscription,
      subscriptionPlanId: subscriptionPlanId,
      subscriptionPlanName: subscriptionPlanName,
      subscriptionUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return user._id
  },
})

/**
 * Check if the current user has an OpenAI API key set.
 */
export const hasOpenAIApiKey = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      return false
    }
    return !!user.openaiApiKeyEncrypted
  },
})

/**
 * Update the current user's encrypted OpenAI API key.
 * Note: The encryption happens server-side before this is called.
 * This mutation only stores the already-encrypted value.
 */
export const setOpenAIApiKeyEncrypted = mutation({
  args: {
    encryptedKey: v.string(),
  },
  handler: async (ctx, { encryptedKey }) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.patch(user._id, {
      openaiApiKeyEncrypted: encryptedKey,
      updatedAt: new Date().toISOString(),
    })
    return user._id
  },
})

/**
 * Get the current user's encrypted OpenAI API key.
 * Note: Decryption happens server-side after retrieval.
 */
export const getOpenAIApiKeyEncrypted = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      return null
    }
    return user.openaiApiKeyEncrypted ?? null
  },
})

/**
 * Delete the current user's OpenAI API key.
 */
export const deleteOpenAIApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.patch(user._id, {
      openaiApiKeyEncrypted: undefined,
      updatedAt: new Date().toISOString(),
    })
    return user._id
  },
})

