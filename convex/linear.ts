import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

// Store Linear OAuth token
export const storeLinearToken = mutation({
  args: {
    linearUserId: v.string(),
    linearUserEmail: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Validate required fields - linearUserId is required for new tokens
      if (!args.linearUserId || typeof args.linearUserId !== 'string' || args.linearUserId.trim().length === 0) {
        throw new Error('Invalid linearUserId: linearUserId is required and must be a non-empty string')
      }
      
      // Note: We no longer support storing tokens by device userId - all new tokens must use linearUserId

      if (!args.accessToken || typeof args.accessToken !== 'string' || args.accessToken.trim().length === 0) {
        throw new Error('Invalid accessToken: accessToken is required and must be a non-empty string')
      }

      console.log('[storeLinearToken] Starting:', {
        linearUserId: args.linearUserId,
        linearUserEmail: args.linearUserEmail,
        hasAccessToken: !!args.accessToken,
        accessTokenLength: args.accessToken.length,
        hasRefreshToken: args.refreshToken !== undefined,
        hasExpiresAt: args.expiresAt !== undefined,
      })

      const existing = await ctx.db
        .query('linearTokens')
        .withIndex('by_linear_user', (q) => q.eq('linearUserId', args.linearUserId))
        .first()

      console.log('[storeLinearToken] Existing token found:', !!existing)

      const now = new Date().toISOString()

      if (existing) {
        // Only include optional fields if they're defined and not null
        const patchData: {
          accessToken: string
          linearUserEmail?: string
          refreshToken?: string
          expiresAt?: string
          updatedAt: string
        } = {
          accessToken: args.accessToken,
          updatedAt: now,
        }
        
        if (args.linearUserEmail !== undefined && args.linearUserEmail !== null) {
          patchData.linearUserEmail = args.linearUserEmail
        }
        
        if (args.refreshToken !== undefined && args.refreshToken !== null) {
          patchData.refreshToken = args.refreshToken
        }
        
        if (args.expiresAt !== undefined && args.expiresAt !== null) {
          patchData.expiresAt = args.expiresAt
        }
        
        await ctx.db.patch(existing._id, patchData)
        console.log('[storeLinearToken] Token updated successfully:', existing._id)
        return existing._id
      } else {
        // Only include optional fields if they're defined
        const insertData: {
          linearUserId: string
          linearUserEmail?: string
          accessToken: string
          refreshToken?: string
          expiresAt?: string
          createdAt: string
          updatedAt: string
        } = {
          linearUserId: args.linearUserId,
          accessToken: args.accessToken,
          createdAt: now,
          updatedAt: now,
        }
        
        if (args.linearUserEmail !== undefined && args.linearUserEmail !== null) {
          insertData.linearUserEmail = args.linearUserEmail
        }
        
        if (args.refreshToken !== undefined && args.refreshToken !== null) {
          insertData.refreshToken = args.refreshToken
        }
        
        if (args.expiresAt !== undefined && args.expiresAt !== null) {
          insertData.expiresAt = args.expiresAt
        }
        
        const newId = await ctx.db.insert('linearTokens', insertData)
        console.log('[storeLinearToken] Token inserted successfully:', newId)
        return newId
      }
    } catch (error) {
      console.error('[storeLinearToken] Error storing Linear token:', {
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        args: {
          linearUserId: args.linearUserId,
          linearUserEmail: args.linearUserEmail,
          hasAccessToken: !!args.accessToken,
          accessTokenLength: args.accessToken?.length,
          hasRefreshToken: args.refreshToken !== undefined,
          refreshTokenType: typeof args.refreshToken,
          hasExpiresAt: args.expiresAt !== undefined,
          expiresAtType: typeof args.expiresAt,
        },
      })
      // Re-throw with more context
      if (error instanceof Error) {
        throw new Error(`Failed to store Linear token: ${error.message}`)
      }
      throw new Error(`Failed to store Linear token: ${String(error)}`)
    }
  },
})

// Get Linear OAuth token by Linear user ID
export const getLinearToken = query({
  args: {
    linearUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query('linearTokens')
      .withIndex('by_linear_user', (q) => q.eq('linearUserId', args.linearUserId))
      .first()

    if (!token) {
      return null
    }

    // Check if token is expired
    if (token.expiresAt) {
      const expiresAt = new Date(token.expiresAt)
      if (expiresAt < new Date()) {
        return null // Token expired
      }
    }

    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    }
  },
})

// Check if Linear user has token
export const hasLinearToken = query({
  args: {
    linearUserId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Validate linearUserId
      if (!args.linearUserId || typeof args.linearUserId !== 'string' || args.linearUserId.trim().length === 0) {
        return false
      }

      const token = await ctx.db
        .query('linearTokens')
        .withIndex('by_linear_user', (q) => q.eq('linearUserId', args.linearUserId))
        .first()

      if (!token) {
        return false
      }

      // Check if token is expired
      if (token.expiresAt) {
        try {
          const expiresAt = new Date(token.expiresAt)
          if (expiresAt < new Date()) {
            return false // Token expired
          }
        } catch {
          // Invalid date, treat as expired
          return false
        }
      }

      return true
    } catch (error) {
      // Log error but don't throw - return false instead
      console.error('Error checking Linear token:', error)
      return false
    }
  },
})

// Remove Linear token
export const removeLinearToken = mutation({
  args: {
    linearUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query('linearTokens')
      .withIndex('by_linear_user', (q) => q.eq('linearUserId', args.linearUserId))
      .first()

    if (token) {
      await ctx.db.delete(token._id)
    }
  },
})

