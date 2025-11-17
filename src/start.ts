import { createStart } from '@tanstack/react-start'

// No Clerk middleware - using stable @clerk/clerk-react SDK instead of beta TanStack Start SDK
// Server-side auth checks can be done directly in server functions when needed
export const startInstance = createStart(() => {
  return {
    requestMiddleware: [],
  }
})