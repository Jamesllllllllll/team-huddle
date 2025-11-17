import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const LINEAR_API_URL = 'https://api.linear.app/graphql'
const LINEAR_OAUTH_URL = 'https://linear.app/oauth/authorize'
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token'
const LINEAR_REVOKE_URL = 'https://api.linear.app/oauth/revoke'

// OAuth configuration
const getLinearClientId = () => {
  const clientId = process.env.LINEAR_CLIENT_ID
  if (!clientId) {
    throw new Error('LINEAR_CLIENT_ID environment variable is required')
  }
  return clientId
}

const getLinearClientSecret = () => {
  const clientSecret = process.env.LINEAR_CLIENT_SECRET
  if (!clientSecret) {
    throw new Error('LINEAR_CLIENT_SECRET environment variable is required')
  }
  return clientSecret
}

const getRedirectUri = () => {
  // In production, VITE_APP_URL must be set to your production URL
  // e.g., https://your-domain.com
  let baseUrl = process.env.VITE_APP_URL
  
  if (!baseUrl) {
    // Try to detect from common hosting platforms
    if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`
    } else if (process.env.CF_PAGES_URL) {
      baseUrl = `https://${process.env.CF_PAGES_URL}`
    } else {
      baseUrl = 'http://localhost:3000'
    }
  }
  
  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  return `${cleanBaseUrl}/linear/callback`
}

// Zod schemas
const zLinearAuthInput = z.object({
  userId: z.string(),
  code: z.string().optional(),
  state: z.string().optional(),
})

const zCreateProjectInput = z.object({
  userId: z.string(),
  huddleId: z.string(),
  huddleSlug: z.string(), // Huddle slug for constructing URL
  projectName: z.string(),
  teamId: z.string(),
  teamKey: z.string().optional(), // Optional team key for URL construction
  tasks: z.array(
    z.object({
      text: z.string(),
    }),
  ),
  linearUserId: z.string(), // Linear user ID who authorized (to set as lead)
})

function requireConvexUrl() {
  const url =
    process.env.NODE_ENV === 'production'
      ? process.env.VITE_CONVEX_URL
      : process.env.VITE_DEV_CONVEX_URL ?? process.env.VITE_CONVEX_URL
  if (!url) {
    throw new Error(
      'Set VITE_CONVEX_URL (prod) or VITE_DEV_CONVEX_URL (dev) to call Convex from server functions.',
    )
  }
  return url
}

// Types
type LinearUser = {
  id: string
  name: string
  email: string
}

type LinearTeam = {
  id: string
  name: string
  key: string
}

type LinearProject = {
  id: string
  name: string
  url?: string
}

type LinearIssue = {
  id: string
  title: string
  identifier: string
}

// GraphQL queries and mutations
const GET_VIEWER_QUERY = `
  query {
    viewer {
      id
      name
      email
    }
  }
`

const GET_TEAMS_QUERY = `
  query {
    teams {
      nodes {
        id
        name
        key
      }
    }
  }
`

const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project {
        id
        name
        url
      }
    }
  }
`

const UPDATE_PROJECT_MUTATION = `
  mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) {
      success
      project {
        id
        name
        url
      }
    }
  }
`

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        title
        identifier
      }
    }
  }
`

// Custom error class for authentication errors
export class LinearAuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LinearAuthenticationError'
    // Add a property that will be preserved during serialization
    Object.defineProperty(this, 'isLinearAuthError', {
      value: true,
      enumerable: true,
      writable: false,
    })
  }
}

// Helper to check if an error is a Linear authentication error
// This works even after server function serialization
export function isLinearAuthenticationError(error: unknown): boolean {
  if (error instanceof LinearAuthenticationError) {
    return true
  }
  if (error instanceof Error) {
    // Check for the marker property
    if ((error as any).isLinearAuthError) {
      return true
    }
    const message = error.message.toLowerCase()
    // Check error message patterns (case-insensitive)
    if (
      message.includes('authentication_error') ||
      message.includes('authentication error') ||
      message.includes('authentication required') ||
      message.includes('not authenticated') ||
      message.includes('401') ||
      message.includes('unauthorized')
    ) {
      return true
    }
  }
  // Also check if it's a plain object with error-like structure
  if (error && typeof error === 'object') {
    const err = error as any
    if (err.message) {
      const message = String(err.message).toLowerCase()
      if (
        message.includes('authentication_error') ||
        message.includes('authentication error') ||
        message.includes('authentication required') ||
        message.includes('not authenticated') ||
        message.includes('401') ||
        message.includes('unauthorized')
      ) {
        return true
      }
    }
  }
  return false
}

// Helper function to make GraphQL requests
async function linearGraphQLRequest<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    
    // Check for 401 Unauthorized - token revoked or invalid
    if (response.status === 401) {
      throw new LinearAuthenticationError(
        `Linear authentication failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }
    
    throw new Error(`Linear API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const result = await response.json()

  if (result.errors) {
    // Check if any error is an authentication error
    const authError = result.errors.find(
      (err: { extensions?: { code?: string; type?: string } }) =>
        err.extensions?.code === 'AUTHENTICATION_ERROR' ||
        err.extensions?.type === 'authentication error',
    )
    
    if (authError) {
      throw new LinearAuthenticationError(
        `Linear authentication failed: ${JSON.stringify(result.errors)}`,
      )
    }
    
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(result.errors)}`)
  }

  return result.data as T
}

// Get OAuth authorization URL
export const getLinearAuthUrl = createServerFn({ method: 'GET' })
  .inputValidator((payload: unknown) => {
    const parsed = z.object({ userId: z.string(), state: z.string().optional() }).parse(payload)
    return parsed
  })
  .handler(async ({ data }) => {
    const clientId = getLinearClientId()
    const redirectUri = getRedirectUri()
    const state = data.state || `${data.userId}-${Date.now()}`

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'write',
      state,
    })

    return {
      authUrl: `${LINEAR_OAUTH_URL}?${params.toString()}`,
      state,
    }
  })

// Exchange authorization code for access token
export const exchangeLinearCode = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => zLinearAuthInput.parse(payload))
  .handler(async ({ data }) => {
    if (!data.code) {
      throw new Error('Authorization code is required')
    }

    const clientId = getLinearClientId()
    const clientSecret = getLinearClientSecret()
    const redirectUri = getRedirectUri()

    // Log for debugging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Linear OAuth] Exchanging code:', {
        redirectUri,
        hasCode: !!data.code,
        codeLength: data.code.length,
      })
    }

    const response = await fetch(LINEAR_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: data.code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to exchange code for token: ${response.status} ${errorText}`
      
      // Check for redirect URI mismatch (common OAuth error)
      if (errorText.includes('redirect_uri') || errorText.includes('redirect_uri_mismatch')) {
        errorMessage = `Redirect URI mismatch. The redirect URI used (${redirectUri}) must match one of the redirect URIs configured in your Linear OAuth app settings. Make sure VITE_APP_URL is set to your production URL in production.`
      }
      
      // Log detailed error for debugging
      console.error('[Linear OAuth] Token exchange failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        redirectUri,
        env: {
          VITE_APP_URL: process.env.VITE_APP_URL,
          VERCEL_URL: process.env.VERCEL_URL,
          CF_PAGES_URL: process.env.CF_PAGES_URL,
          NODE_ENV: process.env.NODE_ENV,
        },
      })
      
      throw new Error(errorMessage)
    }

    const tokenData = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
    }
  })

// Get Linear user info
export const getLinearUser = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => z.object({ accessToken: z.string() }).parse(payload))
  .handler(async ({ data }) => {
    const result = await linearGraphQLRequest<{ viewer: LinearUser }>(
      data.accessToken,
      GET_VIEWER_QUERY,
    )
    return result.viewer
  })

// Get Linear teams
export const getLinearTeams = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => z.object({ accessToken: z.string() }).parse(payload))
  .handler(async ({ data }) => {
    const result = await linearGraphQLRequest<{ teams: { nodes: LinearTeam[] } }>(
      data.accessToken,
      GET_TEAMS_QUERY,
    )
    return result.teams.nodes
  })

// Create Linear project
export const createLinearProject = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) =>
    zCreateProjectInput.extend({ accessToken: z.string() }).parse(payload),
  )
  .handler(async ({ data }) => {
    const {
      projectName,
      teamId,
      tasks,
      accessToken,
      huddleId,
      huddleSlug,
      teamKey,
      linearUserId,
    } = data

    // Get huddle summary from Convex
    const convexUrlForSummary = requireConvexUrl()
    const convexClientForSummary = new ConvexHttpClient(convexUrlForSummary)
    const huddle = await convexClientForSummary.query(api.huddle.getHuddle, {
      slug: huddleSlug,
    })

    if (!huddle) {
      throw new Error('Huddle not found')
    }

    // Get summary planning item if it exists - this will be used as the project description
    const summaryItem = huddle.planningItems.find((item) => item.type === 'summary')
    const description = summaryItem?.text

    // Construct huddle URL
    const baseUrl =
      process.env.VITE_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const huddleUrl = `${baseUrl.replace(/\/$/, '')}/huddles/${huddleSlug}`

    // Step 1: Create the project with the huddle title, description (from summary), and lead
    const projectInput: {
      name: string
      teamIds: string[]
      description?: string
      leadId?: string
    } = {
      name: projectName,
      teamIds: [teamId],
    }

    // Always include the summary as the project description if it exists
    if (description && description.trim().length > 0) {
      projectInput.description = description.trim()
    }

    if (linearUserId) {
      projectInput.leadId = linearUserId
    }

    const projectResult = await linearGraphQLRequest<{
      projectCreate: { success: boolean; project: LinearProject | null }
    }>(accessToken, CREATE_PROJECT_MUTATION, {
      input: projectInput,
    })

    if (!projectResult.projectCreate.success || !projectResult.projectCreate.project) {
      throw new Error('Failed to create Linear project')
    }

    const project = projectResult.projectCreate.project

    // Step 1.5: Add huddle link as a resource (if project was created successfully)
    // Linear resources are added via projectUpdate mutation
    if (huddleUrl) {
      try {
        await linearGraphQLRequest<{
          projectUpdate: { success: boolean; project: LinearProject | null }
        }>(accessToken, UPDATE_PROJECT_MUTATION, {
          id: project.id,
          input: {
            resources: {
              create: [
                {
                  type: 'url',
                  url: huddleUrl,
                  title: 'View Huddle',
                },
              ],
            },
          },
        })
      } catch (error) {
        // Log but don't fail if resource creation fails
        console.error('Failed to add huddle link to Linear project resources:', error)
      }
    }

    // Step 2: Create issues directly in the project for each task from the huddle
    const issues: LinearIssue[] = []
    for (const task of tasks) {
      const issueResult = await linearGraphQLRequest<{
        issueCreate: { success: boolean; issue: LinearIssue | null }
      }>(accessToken, CREATE_ISSUE_MUTATION, {
        input: {
          title: task.text,
          projectId: project.id,
          teamId,
        },
      })

      if (issueResult.issueCreate.success && issueResult.issueCreate.issue) {
        issues.push(issueResult.issueCreate.issue)
      }
    }

    // Step 3: Store the Linear project info in the huddle
    // Construct the project URL if not provided by Linear API
    let projectUrl = project.url
    if (!projectUrl) {
      // Construct URL using team key if available, otherwise use basic format
      if (teamKey) {
        projectUrl = `https://linear.app/${teamKey}/project/${project.id}/overview`
      } else {
        projectUrl = `https://linear.app/project/${project.id}`
      }
    }

    // Save the project info to Convex
    const convexUrlForSave = requireConvexUrl()
    const convexClientForSave = new ConvexHttpClient(convexUrlForSave)
    await convexClientForSave.mutation(api.huddle.setLinearProject, {
      huddleId: huddleId as Id<'huddles'>,
      linearProjectId: project.id,
      linearProjectUrl: projectUrl,
    })

    return {
      project,
      issues,
    }
  })

// Revoke Linear access token or refresh token
export const revokeLinearAccess = createServerFn({ method: 'POST' })
  .inputValidator((payload: unknown) => {
    const revokeSchema = z.object({
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
    }).refine(
      (v) => Boolean(v.accessToken || v.refreshToken),
      { message: 'accessToken or refreshToken is required' },
    )
    return revokeSchema.parse(payload)
  })
  .handler(async ({ data }) => {
    const clientId = getLinearClientId()
    const clientSecret = getLinearClientSecret()
    const tokenToRevoke = data.refreshToken || data.accessToken!

    const response = await fetch(LINEAR_REVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token: tokenToRevoke,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to revoke Linear token: ${response.status} ${errorText}`)
    }

    return { revoked: true }
  })

