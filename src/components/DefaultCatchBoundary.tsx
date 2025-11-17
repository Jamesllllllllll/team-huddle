import { useEffect } from 'react'
import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import * as Sentry from '@sentry/tanstackstart-react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error(error)

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
      <ErrorComponent error={error} />
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          onClick={() => {
            router.invalidate()
          }}
        >
          Try Again
        </Button>
        {isRoot ? (
          <Button
            asChild
          >
            <Link to="/">Home</Link>
          </Button>
        ) : (
          <Button
            asChild
          >
            <Link
              to="/"
              onClick={(e) => {
                e.preventDefault()
                window.history.back()
              }}
            >
              Go Back
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
