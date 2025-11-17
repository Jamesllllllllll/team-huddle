import { defineSchema, defineTable } from 'convex/server'
import { type Infer, v } from 'convex/values'

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
    // Convex token identifier (recommended by Convex docs for user lookups)
    // Optional to support existing users - will be backfilled on next login
    tokenIdentifier: v.optional(v.string()),
    // Clerk user ID (stored in the subject JWT field from ctx.auth.getUserIdentity())
    // Kept for backwards compatibility and for use with Autumn customerId mapping
    externalId: v.string(),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    // Guest clientId that was used before signing up (for migration tracking)
    migratedFromGuestId: v.optional(v.string()),
    // Subscription status cached from Autumn for fast UI rendering
    // Updated when subscription changes (via webhooks or useCustomer hook)
    hasActiveSubscription: v.optional(v.boolean()),
    subscriptionPlanId: v.optional(v.string()),
    subscriptionPlanName: v.optional(v.string()),
    subscriptionUpdatedAt: v.optional(v.string()),
    // Encrypted OpenAI API key (encrypted server-side before storage)
    openaiApiKeyEncrypted: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_token', ['tokenIdentifier'])
    .index('by_external_id', ['externalId'])
    .index('by_migrated_guest_id', ['migratedFromGuestId']),

  huddles: defineTable({
    slug: v.string(),
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.string(),
    theme: v.optional(v.string()),
    status: v.optional(v.string()),
    endedAt: v.optional(v.string()),
    endedByTimeLimit: v.optional(v.boolean()),
    // If false, this huddle has no time limit (e.g., created by a subscriber)
    isTimeLimited: v.optional(v.boolean()),
    autoTitleGeneratedAt: v.optional(v.string()),
    autoTitleSourcePlanningItemId: v.optional(v.id('planningItems')),
    isInviteOnly: v.optional(v.boolean()),
    invitedUserIds: v.optional(v.array(v.string())),
    // When true, only users with a valid private access key in the URL can join.
    isPrivate: v.optional(v.boolean()),
    privateAccessKey: v.optional(v.string()),
    // Linear integration: project ID and URL after creating a Linear project
    linearProjectId: v.optional(v.string()),
    linearProjectUrl: v.optional(v.string()),
  })
    .index('by_slug', ['slug'])
    .index('by_createdBy', ['createdBy'])
    .index('by_status', ['status']),

  participants: defineTable({
    huddleId: v.id('huddles'),
    userId: v.string(),
    displayName: v.optional(v.string()),
    role: v.optional(v.string()),
    wasEverParticipant: v.optional(v.boolean()),
    avatarUrl: v.optional(v.string()),
    joinedAt: v.string(),
  })
    .index('by_huddle', ['huddleId'])
    .index('by_user', ['userId'])
    .index('by_huddle_user', ['huddleId', 'userId']),

  planningItems: defineTable({
    huddleId: v.id('huddles'),
    type: v.union(
      v.literal('idea'),
      v.literal('task'),
      v.literal('dependency'),
      v.literal('owner'),
      v.literal('risk'),
      v.literal('outcome'),
      v.literal('decision'),
      v.literal('summary')
    ),
    text: v.string(),
    timestamp: v.string(),
    speakerId: v.optional(v.string()),
    speakerLabel: v.optional(v.string()),
    metadata: v.optional(v.any()),
    order: v.optional(v.number()),
    blockedBy: v.optional(v.array(v.id('planningItems'))),
  })
    .index('by_huddle', ['huddleId'])
    .index('by_huddle_type', ['huddleId', 'type'])
    .index('by_huddle_order', ['huddleId', 'order']),

  presence: defineTable({
    huddleId: v.id('huddles'),
    userId: v.string(),
    isSpeaking: v.boolean(),
    isRecording: v.optional(v.boolean()),
    cursor: v.optional(
      v.object({
        x: v.number(),
        y: v.number(),
      })
    ),
    focusedItemId: v.optional(v.id('planningItems')),
    updatedAt: v.string(),
  })
    .index('by_huddle', ['huddleId'])
    .index('by_user', ['userId'])
    .index('by_huddle_user', ['huddleId', 'userId']),

  transcriptChunks: defineTable({
    huddleId: v.id('huddles'),
    sequence: v.number(),
    source: v.union(
      v.literal('transcript'),
      v.literal('ai'),
      v.literal('user'),
      v.literal('voice')
    ),
    payload: v.string(),
    createdAt: v.string(),
    metadata: v.optional(v.any()),
  })
    .index('by_huddle', ['huddleId'])
    .index('by_huddle_sequence', ['huddleId', 'sequence'])
    .index('by_huddle_source', ['huddleId', 'source']),

  views: defineTable({
    huddleId: v.id('huddles'),
    label: v.string(),
    filterType: v.string(),
    config: v.optional(v.any()),
    order: v.optional(v.number()),
  }).index('by_huddle', ['huddleId']),

  linearTokens: defineTable({
    userId: v.optional(v.string()), // Legacy: device clientId (deprecated, use linearUserId instead)
    linearUserId: v.optional(v.string()), // Linear user ID (for cross-device lookup)
    linearUserEmail: v.optional(v.string()), // Linear user email (for cross-device lookup)
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_user', ['userId']) // Legacy index
    .index('by_linear_user', ['linearUserId'])
    .index('by_linear_email', ['linearUserEmail']),

  researchResults: defineTable({
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
    rawResponse: v.optional(v.any()), // Full Firecrawl response for dev debugging
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_planning_item', ['planningItemId'])
    .index('by_huddle', ['huddleId']),
})
export default schema

const huddle = schema.tables.huddles.validator
const participant = schema.tables.participants.validator
const planningItem = schema.tables.planningItems.validator
const presenceSession = schema.tables.presence.validator
const transcriptChunk = schema.tables.transcriptChunks.validator
const view = schema.tables.views.validator

export const newHuddleSchema = v.object({
  slug: huddle.fields.slug,
  name: huddle.fields.name,
  createdBy: huddle.fields.createdBy,
  createdAt: huddle.fields.createdAt,
  theme: v.optional(huddle.fields.theme),
  status: v.optional(huddle.fields.status),
  endedAt: v.optional(huddle.fields.endedAt),
})

export const newParticipantSchema = v.object({
  huddleId: participant.fields.huddleId,
  userId: participant.fields.userId,
  displayName: v.optional(participant.fields.displayName),
  role: v.optional(participant.fields.role),
  avatarUrl: v.optional(participant.fields.avatarUrl),
  joinedAt: participant.fields.joinedAt,
})

export const createPlanningItemSchema = v.object({
  huddleId: planningItem.fields.huddleId,
  type: planningItem.fields.type,
  text: planningItem.fields.text,
  timestamp: planningItem.fields.timestamp,
  speakerId: v.optional(planningItem.fields.speakerId),
  speakerLabel: v.optional(planningItem.fields.speakerLabel),
  metadata: v.optional(planningItem.fields.metadata),
  order: v.optional(planningItem.fields.order),
  blockedBy: v.optional(planningItem.fields.blockedBy),
})

export const updatePlanningItemSchema = v.object({
  id: v.id('planningItems'),
  huddleId: planningItem.fields.huddleId,
  text: v.optional(planningItem.fields.text),
  timestamp: v.optional(planningItem.fields.timestamp),
  speakerId: v.optional(planningItem.fields.speakerId),
  speakerLabel: v.optional(planningItem.fields.speakerLabel),
  metadata: v.optional(planningItem.fields.metadata),
  order: v.optional(planningItem.fields.order),
  blockedBy: v.optional(planningItem.fields.blockedBy),
})

export const deletePlanningItemSchema = v.object({
  id: v.id('planningItems'),
  huddleId: planningItem.fields.huddleId,
})

export const updatePresenceSchema = v.object({
  huddleId: presenceSession.fields.huddleId,
  userId: presenceSession.fields.userId,
  isSpeaking: presenceSession.fields.isSpeaking,
  isRecording: v.optional(presenceSession.fields.isRecording),
  cursor: v.optional(presenceSession.fields.cursor),
  focusedItemId: v.optional(presenceSession.fields.focusedItemId),
  updatedAt: presenceSession.fields.updatedAt,
})

export const deletePresenceSchema = v.object({
  huddleId: presenceSession.fields.huddleId,
  userId: presenceSession.fields.userId,
})

export const newTranscriptChunkSchema = v.object({
  huddleId: transcriptChunk.fields.huddleId,
  sequence: transcriptChunk.fields.sequence,
  source: transcriptChunk.fields.source,
  payload: transcriptChunk.fields.payload,
  createdAt: transcriptChunk.fields.createdAt,
  metadata: v.optional(transcriptChunk.fields.metadata),
})

export const deleteTranscriptChunkSchema = v.object({
  huddleId: transcriptChunk.fields.huddleId,
  id: v.id('transcriptChunks'),
})

export const newViewSchema = v.object({
  huddleId: view.fields.huddleId,
  label: view.fields.label,
  filterType: view.fields.filterType,
  config: v.optional(view.fields.config),
  order: v.optional(view.fields.order),
})

export type Huddle = Infer<typeof huddle>
export type Participant = Infer<typeof participant>
export type PlanningItem = Infer<typeof planningItem>
export type PresenceSession = Infer<typeof presenceSession>
export type TranscriptChunk = Infer<typeof transcriptChunk>
export type View = Infer<typeof view>
