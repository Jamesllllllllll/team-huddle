/// <reference types="vite/client" />
import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { ToastBar } from '~/components/ToastBar'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'
import { Loader } from '~/components/Loader'
import { UserProfileProvider, useUserProfile } from '~/context/UserProfileContext'
import { ThemeProvider, useTheme } from '~/context/ThemeContext'
import { ThemeSelector } from '~/components/ThemeSelector'
import { DarkModeToggle } from '~/components/DarkModeToggle'
import { SubscriptionButton } from '~/components/SubscriptionButton'
import { ClerkProvider, SignedIn, SignedOut, SignInButton, SignOutButton, UserButton, useAuth, useClerk } from '@clerk/clerk-react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { Button } from '~/components/ui/button'
import { LogIn, UserPlus, LogOut } from 'lucide-react'
import { useStoreUser } from '~/hooks/useStoreUser'
import { getConvexQueryClient } from '~/router'
import { AutumnProvider } from 'autumn-js/react'
import { api } from '../../convex/_generated/api'
import { OpenAIApiKeyButton } from '~/components/OpenAIApiKeyButton'
import { OpenAIApiKeyDialog } from '~/components/OpenAIApiKeyDialog'
import { useQuery } from '@tanstack/react-query'
import { useConvexAuth } from 'convex/react'
import { userQueries } from '~/queries'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title:
          'Team Huddle Live',
        description: `Team Huddle Live is a collaborative planning tool. It allows you to plan and collaborate with your team in real-time.`,
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: 'https://fav.farm/🏝️' },
    ],
    scripts: [
      {
        type: 'text/javascript',
        children: `
          (function() {
            try {
              // Apply theme class before React hydrates to prevent flash
              const theme = localStorage.getItem('huddle:theme');
              if (theme && theme !== 'default') {
                document.documentElement.classList.add('theme-' + theme);
              }
              
              // Apply dark mode before React hydrates
              const darkMode = localStorage.getItem('huddle:dark-mode');
              if (darkMode === 'true') {
                document.documentElement.classList.add('dark');
              } else if (darkMode === null) {
                // Check system preference if no stored preference
                if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  document.documentElement.classList.add('dark');
                }
              }
            } catch (e) {
              // Silently fail if localStorage is not available
            }
          })();
        `,
      },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <ThemeProvider>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </ThemeProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const env = (import.meta as any).env
  // Single source of truth: import.meta.env (Vite)
  const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY || ''
  const clerkDomain = env.VITE_CLERK_DOMAIN || 'clerk.teamhuddle.live'
  const convexQueryClient = getConvexQueryClient()

  if (!publishableKey) {
    console.error('VITE_CLERK_PUBLISHABLE_KEY is not set. Skipping Clerk/Convex auth providers.')
    return <MinimalRootDocumentContent />
  }

  return (
    <ClerkProvider 
      publishableKey={publishableKey || ''}
      domain={clerkDomain}
    >
      <ConvexProviderWithClerk client={convexQueryClient.convexClient} useAuth={useAuth}>
        <AutumnProviderWrapper convexClient={convexQueryClient.convexClient}>
          <UserProfileProvider>
            <RootDocumentContent>{children}</RootDocumentContent>
          </UserProfileProvider>
        </AutumnProviderWrapper>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

function AutumnProviderWrapper({ 
  children, 
  convexClient 
}: { 
  children: React.ReactNode
  convexClient: ReturnType<typeof getConvexQueryClient>['convexClient']
}) {
  return (
    <AutumnProvider convex={convexClient} convexApi={(api as any).autumn}>
      {children}
    </AutumnProvider>
  )
}

function MinimalRootDocumentContent() {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background">
        <div className="h-screen flex flex-col min-h-0">
          <div className="bg-rose-600 text-white px-4 py-2">
            Missing Clerk configuration. Set VITE_CLERK_PUBLISHABLE_KEY to enable authentication.
          </div>
          <div className="flex-1 min-h-0">
            <div className="h-full flex items-center justify-center p-6 text-center">
              <div className="max-w-md space-y-2">
                <h1 className="text-xl font-semibold">Authentication Unavailable</h1>
                <p className="text-sm text-muted-foreground">
                  Clerk is not configured. The app cannot provide sign-in or synced features without it.
                </p>
              </div>
            </div>
          </div>
          <Toaster position="bottom-center">
            {(t) => <ToastBar toast={t} position="bottom-center" />}
          </Toaster>
        </div>
        {import.meta.env.DEV ? (
          <>
            <ReactQueryDevtools />
            <TanStackRouterDevtools position="bottom-right" />
          </>
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
function OpenAIApiKeyButtonWrapper() {
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false)
  const { isAuthenticated } = useConvexAuth()
  const hasApiKeyQuery = useQuery({
    ...userQueries.hasOpenAIApiKey(),
    enabled: isAuthenticated,
  })
  const hasApiKey = hasApiKeyQuery.data ?? false

  return (
    <>
      <OpenAIApiKeyButton onOpenDialog={() => setApiKeyDialogOpen(true)} />
      <OpenAIApiKeyDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
        hasExistingKey={hasApiKey}
      />
    </>
  )
}

function RootDocumentContent({ children }: { children: React.ReactNode }) {
  // Automatically store user in Convex when they sign in with Clerk
  // This must be called after ConvexProviderWithClerk and UserProfileProvider are mounted
  useStoreUser()

  return (
    <html suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body className="bg-background">
          <div className="h-screen flex flex-col min-h-0">
            <div className="bg-background/50 border-b border-border flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-3 box-border h-16 shrink-0">
              <div>
                <Link to="/" className="block leading-tight">
                  <div className="font-black text-2xl uppercase font-logo">Team Huddle Live</div>
                </Link>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                <SubscriptionButton />
                <SignedIn>
                  <OpenAIApiKeyButtonWrapper />
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button variant="outline" size="sm" className="gap-2 px-2 md:px-3">
                      <LogIn className="h-4 w-4 md:hidden" />
                      <span className="hidden md:inline">Sign In</span>
                    </Button>
                  </SignInButton>
                  <SignUpWithNameGate />
                </SignedOut>
                <SignedIn>
                  <UserButton />
                  <SignOutButton>
                    <Button variant="outline" size="sm" className="gap-2 px-2 md:px-3">
                      <LogOut className="h-4 w-4 md:hidden" />
                      <span className="hidden md:inline">Sign Out</span>
                    </Button>
                  </SignOutButton>
                </SignedIn>
                <ThemeSelector />
                <DarkModeToggle />
              </div>
            </div>

            <div className="grow min-h-0 h-full flex flex-col">
              {children}
              <Toaster
                position="top-right"
                toastOptions={{
                  className: '',
                  style: {
                    background: 'var(--card)',
                    color: 'var(--card-foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                  },
                  iconTheme: {
                    primary: 'var(--primary)',
                    secondary: 'var(--primary-foreground)',
                  },
                }}
              >
                {(t) => <ToastBar toast={t} position="top-right" />}
              </Toaster>
            </div>
          </div>
          {import.meta.env.DEV ? (
            <>
              <ReactQueryDevtools />
              <TanStackRouterDevtools position="bottom-right" />
            </>
          ) : null}
          <Scripts />
        </body>
      </html>
  )
}

function SignUpWithNameGate() {
  const { profile, setName } = useUserProfile()
  const { openSignUp } = useClerk()
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [localName, setLocalName] = React.useState('')

  React.useEffect(() => {
    if (profile.name && !localName) {
      setLocalName(profile.name)
    }
  }, [profile.name, localName])

  const startSignUp = React.useCallback(() => {
    void openSignUp({})
  }, [openSignUp])

  const handlePrimaryClick = React.useCallback(() => {
    if (!profile.name?.trim()) {
      setIsDialogOpen(true)
      return
    }
    startSignUp()
  }, [profile.name, startSignUp])

  const handleDialogSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      const trimmed = localName.trim()
      if (!trimmed) {
        return
      }
      setName(trimmed)
      setIsDialogOpen(false)
      startSignUp()
    },
    [localName, setName, startSignUp],
  )

  const handleDialogOpenChange = React.useCallback((open: boolean) => {
    setIsDialogOpen(open)
  }, [])

  return (
    <>
      <Button
        variant="default"
        size="sm"
        className="gap-2 px-2 md:px-3"
        type="button"
        onClick={handlePrimaryClick}
      >
        <UserPlus className="h-4 w-4 md:hidden" />
        <span className="hidden md:inline">Sign Up</span>
      </Button>
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter your name to sign up</DialogTitle>
            <DialogDescription>
              We&apos;ll show this name to your teammates in huddles. You can change it later in your profile.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDialogSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="signup-name-input">
                First name
              </label>
              <Input
                id="signup-name-input"
                autoFocus
                placeholder="Jane"
                value={localName}
                maxLength={60}
                onChange={(event) => setLocalName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!localName.trim()}>
                Continue to sign up
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LoadingIndicator() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  return (
    <div
      className={`h-12 transition-all duration-300 ${isLoading ? `opacity-100 delay-300` : `opacity-0 delay-0`
        }`}
    >
      <Loader />
    </div>
  )
}
