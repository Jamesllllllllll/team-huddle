import invariant from 'tiny-invariant'
import { v } from 'convex/values'
import {
  type QueryCtx,
  type MutationCtx,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import {
  createPlanningItemSchema,
  deletePlanningItemSchema,
  deletePresenceSchema,
  deleteTranscriptChunkSchema,
  newTranscriptChunkSchema,
  newViewSchema,
  updatePlanningItemSchema,
  updatePresenceSchema,
} from './schema'
import type { Doc, Id } from './_generated/dataModel'

function toClientDoc<T extends { _creationTime: number; _id: Id<any> }>(doc: T) {
  const { _creationTime, _id, ...rest } = doc
  return { ...rest, _id, id: _id }
}

async function ensureHuddleById(
  ctx: QueryCtx,
  id: Id<'huddles'>,
): Promise<Doc<'huddles'>> {
  const huddle = await ctx.db.get(id)
  invariant(huddle, `Missing huddle ${id}`)
  return huddle
}

async function enforceHuddleOwner(
  ctx: MutationCtx,
  huddle: Doc<'huddles'>,
  userId: string,
  errorMessage: string,
) {
  if (huddle.createdBy === userId) {
    return
  }

  const participant = await ctx.db
    .query('participants')
    .withIndex('by_huddle_user', (q) =>
      q.eq('huddleId', huddle._id).eq('userId', userId),
    )
    .unique()

  const normalizedDisplayName =
    participant?.displayName && participant.displayName.trim().length > 0
      ? participant.displayName.trim()
      : null

  invariant(
    normalizedDisplayName !== null &&
      normalizedDisplayName === huddle.createdBy,
    errorMessage,
  )
}

async function ensurePlanningItem(
  ctx: QueryCtx,
  id: Id<'planningItems'>,
): Promise<Doc<'planningItems'>> {
  const planningItem = await ctx.db.get(id)
  invariant(planningItem, `Missing planning item ${id}`)
  return planningItem
}

async function ensurePresenceEntry(
  ctx: QueryCtx,
  huddleId: Id<'huddles'>,
  userId: string,
) {
  return await ctx.db
    .query('presence')
    .withIndex('by_huddle_user', (q) =>
      q.eq('huddleId', huddleId).eq('userId', userId),
    )
    .unique()
}

async function getNextTranscriptSequence(
  ctx: QueryCtx,
  huddleId: Id<'huddles'>,
) {
  const chunks = await ctx.db
    .query('transcriptChunks')
    .withIndex('by_huddle_sequence', (q) => q.eq('huddleId', huddleId))
    .collect()
  let maxSequence = 0
  for (const chunk of chunks) {
    if (typeof chunk.sequence === 'number' && chunk.sequence > maxSequence) {
      maxSequence = chunk.sequence
    }
  }
  return maxSequence + 1
}

async function getFullHuddle(ctx: QueryCtx, slug: string) {
  const huddleDoc = await ctx.db
    .query('huddles')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique()

  if (!huddleDoc) {
    return null
  }

  const [participants, planningItems, presences, views, transcriptChunks] =
    await Promise.all([
      ctx.db
        .query('participants')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleDoc._id))
        .collect(),
      ctx.db
        .query('planningItems')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleDoc._id))
        .collect(),
      ctx.db
        .query('presence')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleDoc._id))
        .collect(),
      ctx.db
        .query('views')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleDoc._id))
        .collect(),
      ctx.db
        .query('transcriptChunks')
        .withIndex('by_huddle_sequence', (q) =>
          q.eq('huddleId', huddleDoc._id),
        )
        .collect(),
    ])

  return {
    ...toClientDoc(huddleDoc),
    participants: participants.map(toClientDoc),
    planningItems: planningItems.map(toClientDoc),
    presence: presences.map(toClientDoc),
    views: views.map(toClientDoc),
    transcriptChunks: transcriptChunks.map(toClientDoc),
  }
}

type SeedCtx = Pick<MutationCtx, 'db'>

const PRESENCE_TIMEOUT_MS = 60 * 1000

async function insertSeedHuddle(ctx: SeedCtx) {
  const now = new Date().toISOString()
  const huddleId = await ctx.db.insert('huddles', {
    slug: 'example-huddle',
    name: 'Example Huddle',
    createdBy: 'system',
    createdAt: now,
    status: 'active',
    endedAt: undefined,
  })

  await ctx.db.insert('participants', {
    huddleId,
    userId: 'system',
    displayName: 'System',
    role: 'host',
    avatarUrl: undefined,
    joinedAt: now,
  })

  await ctx.db.insert('planningItems', {
    huddleId,
    type: 'idea',
    text: 'Kickoff meeting to define project scope.',
    timestamp: now,
    speakerLabel: 'system',
    metadata: { origin: 'seed' },
  })
}

export const listHuddles = query(async (ctx) => {
  const huddles = await ctx.db.query('huddles').collect()

  const summaries = await Promise.all(
    huddles.map(async (huddle) => {
      const participants = await ctx.db
        .query('participants')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddle._id))
        .collect()

      return {
        ...toClientDoc(huddle),
        participants: participants.map(toClientDoc),
      }
    }),
  )

  return summaries
})

export const getHuddle = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await getFullHuddle(ctx, slug)
  },
})

export const getHuddleById = query({
  args: { id: v.id('huddles') },
  handler: async (ctx, { id }) => {
    const huddle = await ensureHuddleById(ctx, id)
    return toClientDoc(huddle)
  },
})

export const getPlanningItemById = query({
  args: { id: v.id('planningItems') },
  handler: async (ctx, { id }) => {
    const item = await ensurePlanningItem(ctx, id)
    return toClientDoc(item)
  },
})

export const createHuddle = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    createdBy: v.string(),
    theme: v.optional(v.string()),
    status: v.optional(v.string()),
    forceTimeLimited: v.optional(v.boolean()), // Force time-limited even for subscribers (for free huddles)
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db
      .query('huddles')
      .withIndex('by_slug', (q) => q.eq('slug', input.slug))
      .unique()
    invariant(!existing, `Huddle slug ${input.slug} already exists`)

    // Determine if creator is a subscriber; if so, disable time limit for this huddle
    // Unless forceTimeLimited is true (for free huddles)
    let isTimeLimited = true
    if (input.forceTimeLimited === true) {
      isTimeLimited = true
    } else {
      try {
        const creatorUser = await ctx.db.get(input.createdBy as unknown as Id<'users'>)
        if (creatorUser && creatorUser.hasActiveSubscription === true) {
          isTimeLimited = false
        }
      } catch {
        // If lookup fails (guest), default to time-limited
        isTimeLimited = true
      }
    }

    // Extract forceTimeLimited from input to avoid including it in the database insert
    const { forceTimeLimited, ...huddleData } = input

    const huddleId = await ctx.db.insert('huddles', {
      ...huddleData,
      status: input.status ?? 'active',
      endedAt: undefined,
      isTimeLimited,
      createdAt: new Date().toISOString(),
    })

    return huddleId
  },
})

export const endHuddle = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
  },
  handler: async (ctx, { huddleId, userId }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can end this huddle.',
    )

    if (huddle.status === 'completed') {
      return huddleId
    }

    await ctx.db.patch(huddleId, {
      status: 'completed',
      endedAt: new Date().toISOString(),
      // Explicitly mark manual end as not caused by time limit
      endedByTimeLimit: false,
    })

    // Summary generation will be triggered from the client via server function
    // We just mark that the huddle is completed here

    return huddleId
  },
})

export const autoEndHuddle = mutation({
  args: {
    huddleId: v.id('huddles'),
  },
  handler: async (ctx, { huddleId }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)

    // Skip auto-end entirely for non-limited huddles
    if (huddle.isTimeLimited === false) {
      return huddleId
    }

    if (huddle.status === 'completed') {
      return huddleId
    }

    // Check if free huddle time limit has passed since creation
    const createdAtMs = new Date(huddle.createdAt).getTime()
    const nowMs = Date.now()
    const elapsedMs = nowMs - createdAtMs
    // Free huddles auto-end after this duration (15 minutes). Convex functions
    // cannot use dynamic imports, and the server bundle cannot import from src/.
    // Keep this value in sync with src/shared/huddle.ts.
    const FREE_HUDDLE_DURATION_MS = 15 * 60 * 1000

    // Only auto-end if the time limit has been reached
    if (elapsedMs >= FREE_HUDDLE_DURATION_MS) {
      await ctx.db.patch(huddleId, {
        status: 'completed',
        endedAt: new Date().toISOString(),
        endedByTimeLimit: true,
      })

      // Summary generation will be triggered from the client via server function
      // We just mark that the huddle is completed here
    }

    return huddleId
  },
})

export const startHuddle = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
  },
  handler: async (ctx, { huddleId, userId }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can start this huddle.',
    )

    // For subscriber (non-limited) huddles allow restart freely. For free huddles, block if limit exceeded.
    if (huddle.isTimeLimited !== false) {
      const createdAtMs = new Date(huddle.createdAt).getTime()
      if (!Number.isNaN(createdAtMs)) {
        const nowMs = Date.now()
        const elapsedMs = nowMs - createdAtMs
        // Free huddles have a fixed duration; avoid dynamic imports in Convex.
        // Keep this in sync with src/shared/huddle.ts
        const FREE_HUDDLE_DURATION_MS = 15 * 60 * 1000
        invariant(
          elapsedMs < FREE_HUDDLE_DURATION_MS,
          'This free huddle has reached its time limit and cannot be restarted.',
        )
      }
    }

    await ctx.db.patch(huddleId, {
      status: 'active',
      endedAt: undefined,
      endedByTimeLimit: undefined,
    })

    return huddleId
  },
})

function generatePrivateAccessKey() {
  // Simple URL-safe random key generator
  return [
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10),
  ].join('-')
}

export const setPrivate = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    isPrivate: v.boolean(),
  },
  handler: async (ctx, { huddleId, userId, isPrivate }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can change privacy settings.',
    )

    // Only subscriber-created (non-time-limited) huddles can be made private
    if (huddle.isTimeLimited !== false) {
      invariant(
        !isPrivate,
        'Only subscribers can enable private access. Upgrade to remove time limits and enable privacy.',
      )
    }

    const patch: Partial<Doc<'huddles'>> = {
      isPrivate,
    }

    if (isPrivate && !huddle.privateAccessKey) {
      patch.privateAccessKey = generatePrivateAccessKey()
    }

    // When making private, turn off invite-only so anyone with the share link can join
    if (isPrivate && huddle.isInviteOnly === true) {
      patch.isInviteOnly = false
    }

    await ctx.db.patch(huddleId, patch)

    return huddleId
  },
})

export const updateHuddleName = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { huddleId, userId, name }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can update the huddle name.',
    )

    const trimmed = name.trim().replace(/\s+/g, ' ')
    invariant(trimmed.length <= 100, 'Huddle name cannot exceed 100 characters')

    await ctx.db.patch(huddleId, {
      name: trimmed,
    })

    return huddleId
  },
})

export const setLinearProject = mutation({
  args: {
    huddleId: v.id('huddles'),
    linearProjectId: v.string(),
    linearProjectUrl: v.string(),
  },
  handler: async (ctx, { huddleId, linearProjectId, linearProjectUrl }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    
    await ctx.db.patch(huddleId, {
      linearProjectId,
      linearProjectUrl,
    })

    return huddleId
  },
})

export const deleteHuddle = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
  },
  handler: async (ctx, { huddleId, userId }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can delete this huddle.',
    )

    // Delete all related data
    const [participants, planningItems, presence, transcriptChunks, views] = await Promise.all([
      ctx.db
        .query('participants')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
      ctx.db
        .query('planningItems')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
      ctx.db
        .query('presence')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
      ctx.db
        .query('transcriptChunks')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
      ctx.db
        .query('views')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
    ])

    // Delete all related records
    for (const participant of participants) {
      await ctx.db.delete(participant._id)
    }
    for (const item of planningItems) {
      await ctx.db.delete(item._id)
    }
    for (const presenceDoc of presence) {
      await ctx.db.delete(presenceDoc._id)
    }
    for (const chunk of transcriptChunks) {
      await ctx.db.delete(chunk._id)
    }
    for (const view of views) {
      await ctx.db.delete(view._id)
    }

    // Finally, delete the huddle itself
    await ctx.db.delete(huddleId)

    return huddleId
  },
})

export const addParticipant = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { huddleId, userId, displayName, avatarUrl }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    
    // Check existing participant record first
    const existing = await ctx.db
      .query('participants')
      .withIndex('by_huddle_user', (q) =>
        q.eq('huddleId', huddleId).eq('userId', userId),
      )
      .unique()
    
    // Check if invite-only is enabled
    if (huddle.isInviteOnly === true) {
      // Owner can always join
      if (huddle.createdBy === userId) {
        // Continue with join logic below
      } else {
        const invitedUserIds = huddle.invitedUserIds ?? []
        // Check if user was ever a participant (can rejoin) or is invited
        const wasPreviouslyParticipant =
          !!existing && (existing.role === 'participant' || existing.wasEverParticipant === true)
        const isInvited = invitedUserIds.includes(userId)
        
        if (!wasPreviouslyParticipant && !isInvited) {
          invariant(false, 'This huddle is invite-only. You must be invited to join.')
        }
      }
    }

    if (existing) {
      const shouldRefreshJoinTimestamp = existing.role !== 'participant'
      const updates: {
        displayName?: string
        role: 'participant'
        avatarUrl?: string
        joinedAt?: string
        wasEverParticipant?: boolean
      } = {
        displayName: displayName ?? existing.displayName,
        role: 'participant',
        avatarUrl: avatarUrl ?? existing.avatarUrl,
        wasEverParticipant: true,
      }
      if (shouldRefreshJoinTimestamp) {
        updates.joinedAt = new Date().toISOString()
      }
      await ctx.db.patch(existing._id, updates)
      return existing._id
    }

    return await ctx.db.insert('participants', {
      huddleId,
      userId,
      displayName,
      role: 'participant',
      wasEverParticipant: true,
      avatarUrl,
      joinedAt: new Date().toISOString(),
    })
  },
})

export const removeParticipant = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
  },
  handler: async (ctx, { huddleId, userId }) => {
    await ensureHuddleById(ctx, huddleId)
    const participant = await ctx.db
      .query('participants')
      .withIndex('by_huddle_user', (q) =>
        q.eq('huddleId', huddleId).eq('userId', userId),
      )
      .unique()
    if (participant) {
      await ctx.db.patch(participant._id, {
        role: 'observer',
        joinedAt: participant.joinedAt,
      })
    }
  },
})

export const addObserver = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { huddleId, userId, displayName, avatarUrl }) => {
    await ensureHuddleById(ctx, huddleId)
    const existing = await ctx.db
      .query('participants')
      .withIndex('by_huddle_user', (q) =>
        q.eq('huddleId', huddleId).eq('userId', userId),
      )
      .unique()

    const payload = {
      displayName,
      role: 'observer' as const,
      avatarUrl,
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(payload.displayName ? { displayName: payload.displayName } : {}),
        ...(payload.avatarUrl ? { avatarUrl: payload.avatarUrl } : {}),
        role: payload.role,
      })
      return existing._id
    }

    return await ctx.db.insert('participants', {
      huddleId,
      userId,
      displayName,
      role: payload.role,
      avatarUrl,
      joinedAt: new Date().toISOString(),
    })
  },
})

export const setInviteOnly = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    isInviteOnly: v.boolean(),
  },
  handler: async (ctx, { huddleId, userId, isInviteOnly }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can change invite-only settings.',
    )

    await ctx.db.patch(huddleId, {
      isInviteOnly,
    })

    return huddleId
  },
})

export const inviteUser = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    inviteUserId: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { huddleId, userId, inviteUserId, displayName, avatarUrl }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can invite users.',
    )

    const invitedUserIds = huddle.invitedUserIds ?? []
    
    // Don't add if already invited
    if (invitedUserIds.includes(inviteUserId)) {
      return huddleId
    }

    // Add to invited list
    await ctx.db.patch(huddleId, {
      invitedUserIds: [...invitedUserIds, inviteUserId],
    })

    // Automatically add as participant when invited
    const existing = await ctx.db
      .query('participants')
      .withIndex('by_huddle_user', (q) =>
        q.eq('huddleId', huddleId).eq('userId', inviteUserId),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: 'participant',
        wasEverParticipant: true,
        ...(displayName ? { displayName } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        joinedAt: new Date().toISOString(),
      })
    } else {
      await ctx.db.insert('participants', {
        huddleId,
        userId: inviteUserId,
        displayName,
        role: 'participant',
        wasEverParticipant: true,
        avatarUrl,
        joinedAt: new Date().toISOString(),
      })
    }

    return huddleId
  },
})

export const removeInvite = mutation({
  args: {
    huddleId: v.id('huddles'),
    userId: v.string(),
    removeUserId: v.string(),
  },
  handler: async (ctx, { huddleId, userId, removeUserId }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    await enforceHuddleOwner(
      ctx,
      huddle,
      userId,
      'Only the huddle creator can remove invitations.',
    )

    const invitedUserIds = huddle.invitedUserIds ?? []
    
    // Don't do anything if not in the list
    if (!invitedUserIds.includes(removeUserId)) {
      return huddleId
    }

    // Remove from invited list
    await ctx.db.patch(huddleId, {
      invitedUserIds: invitedUserIds.filter((id) => id !== removeUserId),
    })

    return huddleId
  },
})

export const pruneInactiveParticipants = internalMutation(async (ctx) => {
  const cutoffIso = new Date(Date.now() - PRESENCE_TIMEOUT_MS).toISOString()
  const stalePresence = await ctx.db.query('presence').collect()

  for (const presence of stalePresence) {
    if (presence.updatedAt >= cutoffIso) continue

    await ctx.db.delete(presence._id)

    const participant = await ctx.db
      .query('participants')
      .withIndex('by_huddle_user', (q) =>
        q.eq('huddleId', presence.huddleId).eq('userId', presence.userId),
      )
      .unique()

    if (
      participant &&
      (participant.role ?? '').toLowerCase() !== 'observer'
    ) {
      await ctx.db.patch(participant._id, {
        role: 'observer',
        joinedAt: participant.joinedAt,
      })
    }
  }
})

export const createPlanningItem = mutation({
  args: createPlanningItemSchema,
  handler: async (ctx, newItem) => {
    await ensureHuddleById(ctx, newItem.huddleId)
    return await ctx.db.insert('planningItems', newItem)
  },
})

export const updatePlanningItem = mutation({
  args: updatePlanningItemSchema,
  handler: async (ctx, { id, huddleId, ...patch }) => {
    const existing = await ensurePlanningItem(ctx, id)
    invariant(
      existing.huddleId === huddleId,
      'Cannot move planning items across huddles',
    )
    await ctx.db.patch(existing._id, {
      ...patch,
      huddleId: existing.huddleId,
    })
  },
})

export const deletePlanningItem = mutation({
  args: deletePlanningItemSchema,
  handler: async (ctx, { id, huddleId }) => {
    const existing = await ensurePlanningItem(ctx, id)
    invariant(
      existing.huddleId === huddleId,
      'Planning item does not belong to provided huddle',
    )
    // Prevent deletion of summary items
    if (existing.type === 'summary') {
      throw new Error('Summary items cannot be deleted')
    }
    await ctx.db.delete(existing._id)
  },
})

export const setHuddleAutoTitle = mutation({
  args: {
    huddleId: v.id('huddles'),
    goalId: v.id('planningItems'),
    name: v.string(),
  },
  handler: async (ctx, { huddleId, goalId, name }) => {
    const huddle = await ensureHuddleById(ctx, huddleId)
    if (typeof huddle.autoTitleGeneratedAt === 'string') {
      return {
        applied: false,
        name: huddle.name,
        autoTitleGeneratedAt: huddle.autoTitleGeneratedAt,
        autoTitleSourcePlanningItemId: huddle.autoTitleSourcePlanningItemId,
      }
    }

    const goalItem = await ensurePlanningItem(ctx, goalId)
    invariant(goalItem.huddleId === huddleId, 'Goal does not belong to huddle')
    invariant(goalItem.type === 'outcome', 'Auto title requires an outcome item')

    const trimmed = name.trim().replace(/\s+/g, ' ')
    invariant(trimmed.length > 0, 'Auto title cannot be empty')

    const words = trimmed.split(/\s+/)
    const normalized =
      words.length > 8 ? words.slice(0, 8).join(' ') : trimmed

    const now = new Date().toISOString()
    await ctx.db.patch(huddle._id, {
      name: normalized,
      autoTitleGeneratedAt: now,
      autoTitleSourcePlanningItemId: goalItem._id,
    })

    return {
      applied: true,
      name: normalized,
      autoTitleGeneratedAt: now,
      autoTitleSourcePlanningItemId: goalItem._id,
    }
  },
})

export const upsertPresence = mutation({
  args: updatePresenceSchema,
  handler: async (ctx, presence) => {
    await ensureHuddleById(ctx, presence.huddleId)
    const existing = await ensurePresenceEntry(
      ctx,
      presence.huddleId,
      presence.userId,
    )
    const normalizedPresence = {
      ...presence,
      isRecording:
        typeof presence.isRecording === 'boolean' ? presence.isRecording : false,
    }
    const payload = {
      ...normalizedPresence,
      updatedAt: new Date().toISOString(),
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert('presence', payload)
  },
})

export const clearPresence = mutation({
  args: deletePresenceSchema,
  handler: async (ctx, { huddleId, userId }) => {
    await ensureHuddleById(ctx, huddleId)
    const existing = await ensurePresenceEntry(ctx, huddleId, userId)
    if (existing) {
      await ctx.db.delete(existing._id)
    }
  },
})

export const logTranscriptChunk = mutation({
  args: newTranscriptChunkSchema,
  handler: async (ctx, chunk) => {
    await ensureHuddleById(ctx, chunk.huddleId)
    return await ctx.db.insert('transcriptChunks', chunk)
  },
})

type PlanningItemKind =
  | 'idea'
  | 'task'
  | 'dependency'
  | 'owner'
  | 'risk'
  | 'outcome'
  | 'decision'
  | 'summary'

const planningItemTypeValue = v.union(
  v.literal('idea'),
  v.literal('task'),
  v.literal('dependency'),
  v.literal('owner'),
  v.literal('risk'),
  v.literal('outcome'),
  v.literal('decision'),
  v.literal('summary'),
)

const voiceCreateActionSchema = v.object({
  kind: v.literal('createItem'),
  itemKey: v.string(),
  type: planningItemTypeValue,
  text: v.string(),
  speakerLabel: v.optional(v.string()),
  blockedByKeys: v.optional(v.array(v.string())),
  needsResearch: v.optional(v.union(v.boolean(), v.null())),
})

const voiceUpdateActionSchema = v.object({
  kind: v.literal('updateItem'),
  targetKey: v.string(),
  patch: v.object({
    text: v.optional(v.string()),
    blockedByKeys: v.optional(v.array(v.string())),
  }),
})

const voiceRemoveActionSchema = v.object({
  kind: v.literal('removeItem'),
  targetKey: v.string(),
})

const voiceActionSchema = v.union(
  voiceCreateActionSchema,
  voiceUpdateActionSchema,
  voiceRemoveActionSchema,
)

const audioMetadataSchema = v.object({
  mimeType: v.string(),
  size: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  url: v.optional(v.string()),
  storageId: v.optional(v.string()),
})

export const processVoiceTranscript = mutation({
  args: {
    huddleId: v.id('huddles'),
    speakerId: v.string(),
    speakerLabel: v.string(),
    text: v.string(),
    actions: v.array(voiceActionSchema),
    conversationId: v.optional(v.string()),
    transcriptMetadata: v.optional(v.any()),
    audio: v.optional(audioMetadataSchema),
    requestId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      huddleId,
      speakerId,
      speakerLabel,
      text,
      actions,
      conversationId,
      transcriptMetadata,
      audio,
      requestId,
    },
  ) => {
    await ensureHuddleById(ctx, huddleId)

    const sequence = await getNextTranscriptSequence(ctx, huddleId)
    const createdAt = new Date().toISOString()

    const metadata: Record<string, unknown> = {
      source: 'voice',
      speakerId,
      speakerLabel,
    }
    if (audio) {
      metadata.audio = audio
    }
    if (conversationId) {
      metadata.conversationId = conversationId
    }
    if (transcriptMetadata && typeof transcriptMetadata === 'object') {
      Object.assign(metadata, transcriptMetadata)
    }
    if (requestId) {
      metadata.requestId = requestId
    }

    const chunkId = await ctx.db.insert('transcriptChunks', {
      huddleId,
      sequence,
      source: 'voice',
      payload: text,
      createdAt,
      metadata,
    })

    const planningItemsForHuddle = await ctx.db
      .query('planningItems')
      .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
      .collect()

    const itemIdByKey: Record<string, Id<'planningItems'>> = {}
    for (const item of planningItemsForHuddle) {
      const itemMetadata = item.metadata as { itemKey?: string } | undefined
      if (itemMetadata && typeof itemMetadata.itemKey === 'string') {
        itemIdByKey[itemMetadata.itemKey] = item._id
      }
    }

    const createdItems: Array<{
      itemKey: string
      id: Id<'planningItems'>
      type: PlanningItemKind
      text: string
    }> = []
    const updatedItems: Array<{ itemKey: string; id: Id<'planningItems'> }> = []
    const removedItems: Array<{ itemKey: string; id: Id<'planningItems'> }> = []
    const planningItemEvents: Array<{
      kind: 'planningItemCreated'
      itemId: Id<'planningItems'>
      itemKey: string
      itemType: PlanningItemKind
      itemText: string
    }> = []

    for (const action of actions) {
      if (action.kind === 'createItem') {
        const blockedByIds =
          action.blockedByKeys
            ?.map((key) => itemIdByKey[key])
            .filter(
              (value): value is Id<'planningItems'> => typeof value !== 'undefined',
            ) ?? []

        const itemMetadata: Record<string, unknown> = {
          itemKey: action.itemKey,
          sourceChunkId: chunkId,
          source: 'voice',
        }
        if (conversationId) {
          itemMetadata.conversationId = conversationId
        }
        if (requestId) {
          itemMetadata.requestId = requestId
        }
        // Always set needsResearch to a boolean for ideas (never undefined or null)
        if (action.type === 'idea') {
          itemMetadata.needsResearch = action.needsResearch === true
        }

        const newId = await ctx.db.insert('planningItems', {
          huddleId,
          type: action.type,
          text: action.text,
          timestamp: createdAt,
          speakerId,
          speakerLabel: action.speakerLabel ?? speakerLabel,
          metadata: itemMetadata,
          blockedBy: blockedByIds.length > 0 ? blockedByIds : undefined,
        })

        itemIdByKey[action.itemKey] = newId
        createdItems.push({
          itemKey: action.itemKey,
          id: newId,
          type: action.type,
          text: action.text,
        })
        planningItemEvents.push({
          kind: 'planningItemCreated',
          itemId: newId,
          itemKey: action.itemKey,
          itemType: action.type,
          itemText: action.text,
        })
        continue
      }

      if (action.kind === 'updateItem') {
        const targetId = itemIdByKey[action.targetKey]
        if (!targetId) {
          continue
        }

        const patch: {
          text?: string
          blockedBy?: Array<Id<'planningItems'>>
        } = {}

        if (typeof action.patch.text === 'string') {
          patch.text = action.patch.text
        }

        if (action.patch.blockedByKeys) {
          const blockedByIds =
            action.patch.blockedByKeys
              ?.map((key) => itemIdByKey[key])
              .filter(
                (value): value is Id<'planningItems'> => typeof value !== 'undefined',
              ) ?? []
          patch.blockedBy = blockedByIds
        }

        if (Object.keys(patch).length === 0) {
          continue
        }

        await ctx.db.patch(targetId, patch)
        updatedItems.push({ itemKey: action.targetKey, id: targetId })
        continue
      }

      if (action.kind === 'removeItem') {
        const targetId = itemIdByKey[action.targetKey]
        if (!targetId) {
          continue
        }

        // Remove the item
        await ctx.db.delete(targetId)
        removedItems.push({ itemKey: action.targetKey, id: targetId })

        // Clean up blockedBy references: find all items that reference this item
        // and remove it from their blockedBy array
        const itemsToUpdate = await ctx.db
          .query('planningItems')
          .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
          .collect()

        for (const item of itemsToUpdate) {
          if (item.blockedBy && item.blockedBy.includes(targetId)) {
            const updatedBlockedBy = item.blockedBy.filter((id) => id !== targetId)
            await ctx.db.patch(item._id, {
              blockedBy: updatedBlockedBy.length > 0 ? updatedBlockedBy : undefined,
            })
          }
        }

        // Remove from itemIdByKey so it can't be referenced in later actions
        delete itemIdByKey[action.targetKey]
        continue
      }
    }

    if (planningItemEvents.length > 0) {
      await ctx.db.patch(chunkId, {
        metadata: {
          ...metadata,
          planningItemEvents: planningItemEvents.map((event) => ({
            kind: event.kind,
            itemId: event.itemId,
            itemKey: event.itemKey,
            itemType: event.itemType,
            itemText: event.itemText,
          })),
        },
      })
    }

    return {
      chunkId,
      sequence,
      createdItems,
      updatedItems,
      removedItems,
    }
  },
})

export const resetHuddleDevState = mutation({
  args: { huddleId: v.id('huddles') },
  handler: async (ctx, { huddleId }) => {
    const siteUrl = process.env.CONVEX_SITE_URL ?? ''
    const allowOverride = process.env.HUDDLE_ALLOW_DEV_RESET
    const isLocalSite =
      !siteUrl ||
      siteUrl.includes('127.0.0.1') ||
      siteUrl.includes('localhost') ||
      siteUrl.startsWith('http://0.0.0.0')

    const isProductionRuntime = process.env.NODE_ENV === 'production' && !isLocalSite && !allowOverride

    if (isProductionRuntime) {
      throw new Error(
        'resetHuddleDevState is disabled in production. Set HUDDLE_ALLOW_DEV_RESET=true to override.',
      )
    }

    await ensureHuddleById(ctx, huddleId)

    const [planningItems, transcriptChunks] = await Promise.all([
      ctx.db
        .query('planningItems')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
      ctx.db
        .query('transcriptChunks')
        .withIndex('by_huddle', (q) => q.eq('huddleId', huddleId))
        .collect(),
    ])

    for (const item of planningItems) {
      const metadata = item.metadata as { devSimulation?: boolean } | undefined
      if (metadata?.devSimulation) {
        await ctx.db.delete(item._id)
      }
    }

    for (const chunk of transcriptChunks) {
      const metadata = chunk.metadata as { devSimulation?: boolean } | undefined
      if (metadata?.devSimulation) {
        await ctx.db.delete(chunk._id)
      }
    }
  },
})

export const deleteTranscriptChunk = mutation({
  args: deleteTranscriptChunkSchema,
  handler: async (ctx, { id, huddleId }) => {
    await ensureHuddleById(ctx, huddleId)
    const chunk = await ctx.db.get(id)
    if (chunk && chunk.huddleId === huddleId) {
      await ctx.db.delete(id)
    }
  },
})

export const createView = mutation({
  args: newViewSchema,
  handler: async (ctx, view) => {
    await ensureHuddleById(ctx, view.huddleId)
    return await ctx.db.insert('views', view)
  },
})

export const listTranscriptChunks = query({
  args: { huddleId: v.id('huddles') },
  handler: async (ctx, { huddleId }) => {
    await ensureHuddleById(ctx, huddleId)
    const chunks = await ctx.db
      .query('transcriptChunks')
      .withIndex('by_huddle_sequence', (q) => q.eq('huddleId', huddleId))
      .collect()
    return chunks.map(toClientDoc)
  },
})

export const seed = internalMutation(async (ctx) => {
  const existingHuddles = await ctx.db.query('huddles').collect()
  if (existingHuddles.length > 0) {
    return
  }
  await insertSeedHuddle(ctx)
})

export const clear = internalMutation(async (ctx) => {
  const tableNames = [
    'huddles',
    'participants',
    'planningItems',
    'presence',
    'transcriptChunks',
    'views',
  ] as const

  for (const tableName of tableNames) {
    const rows = await ctx.db.query(tableName).collect()
    for (const row of rows) {
      await ctx.db.delete(row._id)
    }
  }

  await insertSeedHuddle(ctx)
})

export const createResearchResult = mutation({
  args: {
    planningItemId: v.id('planningItems'),
    huddleId: v.id('huddles'),
    query: v.string(),
    summary: v.string(),
    sources: v.array(
      v.object({
        url: v.string(),
        title: v.optional(v.string()),
      })
    ),
    status: v.union(
      v.literal('pending'),
      v.literal('completed'),
      v.literal('failed')
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureHuddleById(ctx, args.huddleId)
    const now = new Date().toISOString()
    return await ctx.db.insert('researchResults', {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const updateResearchResult = mutation({
  args: {
    id: v.id('researchResults'),
    summary: v.optional(v.string()),
    sources: v.optional(
      v.array(
        v.object({
          url: v.string(),
          title: v.optional(v.string()),
        })
      )
    ),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('completed'),
        v.literal('failed')
      )
    ),
    error: v.optional(v.string()),
    rawResponse: v.optional(v.any()), // Full Firecrawl response for dev debugging
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args
    const now = new Date().toISOString()
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: now,
    })
  },
})

export const getResearchResult = query({
  args: {
    planningItemId: v.id('planningItems'),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('researchResults')
      .withIndex('by_planning_item', (q) =>
        q.eq('planningItemId', args.planningItemId)
      )
      .first()
    return result
  },
})

export const getAllResearchResults = query({
  args: {
    huddleId: v.id('huddles'),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query('researchResults')
      .withIndex('by_huddle', (q) => q.eq('huddleId', args.huddleId))
      .collect()
    // Return as a map keyed by planningItemId for easy lookup
    const resultMap = new Map<string, typeof results[0]>()
    for (const result of results) {
      resultMap.set(result.planningItemId, result)
    }
    return Object.fromEntries(resultMap)
  },
})

export const resetAllHuddlesDev = mutation({
  args: {},
  handler: async (ctx) => {
    const siteUrl = process.env.CONVEX_SITE_URL ?? ''
    const allowOverride = process.env.HUDDLE_ALLOW_DEV_RESET
    const isLocalSite =
      !siteUrl ||
      siteUrl.includes('127.0.0.1') ||
      siteUrl.includes('localhost') ||
      siteUrl.startsWith('http://0.0.0.0')

    const isProductionRuntime =
      process.env.NODE_ENV === 'production' && !isLocalSite && !allowOverride

    if (isProductionRuntime) {
      throw new Error(
        'resetAllHuddlesDev is disabled in production. Set HUDDLE_ALLOW_DEV_RESET=true to override.',
      )
    }

    const tables = [
      'participants',
      'planningItems',
      'presence',
      'transcriptChunks',
      'views',
      'huddles',
      'researchResults',
    ] as const

    for (const table of tables) {
      const docs = await ctx.db.query(table).collect()
      for (const doc of docs) {
        await ctx.db.delete(doc._id)
      }
    }

    await insertSeedHuddle(ctx)
  },
})
