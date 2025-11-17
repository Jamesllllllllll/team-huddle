import { createRouter } from '@tanstack/react-router'
import {
  MutationCache,
  QueryClient,
  notifyManager,
} from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import toast from 'react-hot-toast'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import * as Sentry from "@sentry/tanstackstart-react";

// Export Convex client so it can be used in RootDocument with ConvexProviderWithClerk
let convexQueryClientInstance: ConvexQueryClient | null = null
let connectedQueryClient: QueryClient | null = null

export function getConvexQueryClient(): ConvexQueryClient {
	if (typeof document === 'undefined') {
		// On the server, return a fresh instance per request to avoid cross-request state
		const env = (import.meta as any).env
		const CONVEX_URL = env.PROD
			? env.VITE_CONVEX_URL
			: env.VITE_DEV_CONVEX_URL ?? env.VITE_CONVEX_URL

		if (!CONVEX_URL) {
			console.error('Missing Convex URL. Set VITE_CONVEX_URL (prod) and/or VITE_DEV_CONVEX_URL (dev).')
		}

		return new ConvexQueryClient(CONVEX_URL)
	}

	// In the browser, reuse a singleton
	if (!convexQueryClientInstance) {
		const env = (import.meta as any).env
		const CONVEX_URL = env.PROD
			? env.VITE_CONVEX_URL
			: env.VITE_DEV_CONVEX_URL ?? env.VITE_CONVEX_URL

		if (!CONVEX_URL) {
			console.error('Missing Convex URL. Set VITE_CONVEX_URL (prod) and/or VITE_DEV_CONVEX_URL (dev).')
		}

		convexQueryClientInstance = new ConvexQueryClient(CONVEX_URL)
	}
	return convexQueryClientInstance
}

export function getRouter() {
	if (typeof document !== 'undefined') {
		notifyManager.setScheduler(window.requestAnimationFrame)
	}

	const isServer = typeof document === 'undefined'
	const convexQueryClient = getConvexQueryClient()

	let queryClientForThisRequest: QueryClient

	if (isServer) {
		// Create a fresh QueryClient per SSR request to avoid leaking cache across users
		queryClientForThisRequest = new QueryClient({
			defaultOptions: {
				queries: {
					queryKeyHashFn: convexQueryClient.hashFn(),
					queryFn: convexQueryClient.queryFn(),
				},
			},
			mutationCache: new MutationCache({
				onError: (error) => {
					toast(error.message, { className: 'bg-red-500 text-white' })
				},
			}),
		})
		convexQueryClient.connect(queryClientForThisRequest)
	} else {
		// In the browser, reuse a singleton QueryClient
		if (!connectedQueryClient) {
			connectedQueryClient = new QueryClient({
				defaultOptions: {
					queries: {
						queryKeyHashFn: convexQueryClient.hashFn(),
						queryFn: convexQueryClient.queryFn(),
					},
				},
				mutationCache: new MutationCache({
					onError: (error) => {
						toast(error.message, { className: 'bg-red-500 text-white' })
					},
				}),
			})
			convexQueryClient.connect(connectedQueryClient)
		}
		queryClientForThisRequest = connectedQueryClient
	}

	// Create a new router instance each time to avoid stream locking issues
	const router = createRouter({
		routeTree,
		defaultPreload: 'intent',
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: () => <NotFound />,
		context: { queryClient: queryClientForThisRequest },
		Wrap: ({ children }) => children,
		scrollRestoration: true,
	})
	
	setupRouterSsrQueryIntegration({
		router,
		queryClient: queryClientForThisRequest,
	})

	if (!router.isServer) {
		Sentry.init({
			dsn: "https://485413529139d7a22d373108cfd7c87e@o4507578256588800.ingest.us.sentry.io/4510344189706240",

			// Adds request headers and IP for users, for more info visit:
			// https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#sendDefaultPii
			sendDefaultPii: true,
		});
	}

	return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
