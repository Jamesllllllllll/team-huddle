import { createMiddleware, createStart } from '@tanstack/react-start'
import { messages, publicErrorMessage } from './shared/errors'

const handleServerErrors = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    console.error('Server function failed', error)
    const publicError = new Error(publicErrorMessage(error, messages.request))
    publicError.stack = undefined
    throw publicError
  }
})

export const startInstance = createStart(() => ({
  functionMiddleware: [handleServerErrors],
}))
