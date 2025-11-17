import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { exchangeLinearCode, getLinearUser } from '~/server/linear'
import { useStoreLinearTokenMutation } from '~/queries'
import { useUserProfile } from '~/context/UserProfileContext'
import toast from 'react-hot-toast'
import { Loader } from '~/components/Loader'

const LINEAR_USER_ID_STORAGE_KEY = 'huddle:linear-user-id'

export const Route = createFileRoute('/linear/callback')({
  component: LinearCallback,
})

function LinearCallback() {
  const navigate = useNavigate()
  const { profile } = useUserProfile()
  const storeToken = useStoreLinearTokenMutation()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [error, setError] = useState<string | null>(null)
  const processedRef = useRef(false)

  useEffect(() => {
    // Prevent multiple executions
    if (processedRef.current) {
      return
    }

    // Wait for profile to be available
    if (!profile.clientId) {
      return
    }

    const handleCallback = async () => {
      processedRef.current = true

      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const state = urlParams.get('state')
      const errorParam = urlParams.get('error')

      // Clean up URL immediately to prevent re-processing
      window.history.replaceState({}, document.title, window.location.pathname)

      if (errorParam) {
        setError(`OAuth error: ${errorParam}`)
        setStatus('error')
        toast.error(`Failed to authenticate with Linear: ${errorParam}`)
        setTimeout(() => {
          const returnUrl = sessionStorage.getItem('linear-oauth-return-url') || '/'
          sessionStorage.removeItem('linear-oauth-return-url')
          // Extract pathname from URL if it's a full URL
          const path = returnUrl.startsWith('http') 
            ? new URL(returnUrl).pathname 
            : returnUrl
          navigate({ to: path })
        }, 2000)
        return
      }

      if (!code || !state) {
        setError('Missing authorization code or state')
        setStatus('error')
        toast.error('Invalid OAuth callback')
        setTimeout(() => {
          const returnUrl = sessionStorage.getItem('linear-oauth-return-url') || '/'
          sessionStorage.removeItem('linear-oauth-return-url')
          // Extract pathname from URL if it's a full URL
          const path = returnUrl.startsWith('http') 
            ? new URL(returnUrl).pathname 
            : returnUrl
          navigate({ to: path })
        }, 2000)
        return
      }

      try {
        // Validate profile.clientId before proceeding
        if (!profile.clientId || typeof profile.clientId !== 'string' || profile.clientId.trim().length === 0) {
          throw new Error('Invalid user profile: clientId is required')
        }

        const tokenData = await exchangeLinearCode({
          data: {
            userId: profile.clientId,
            code,
            state,
          },
        })

        // Validate token data before storing
        if (!tokenData || !tokenData.accessToken || typeof tokenData.accessToken !== 'string' || tokenData.accessToken.trim().length === 0) {
          throw new Error('Invalid token data: accessToken is required')
        }

        // Get Linear user info to store token by Linear user ID (for cross-device support)
        console.log('[Linear Callback] Fetching Linear user info...')
        const linearUser = await getLinearUser({
          data: { accessToken: tokenData.accessToken },
        })

        if (!linearUser || !linearUser.id) {
          throw new Error('Failed to get Linear user information')
        }

        console.log('[Linear Callback] Storing token:', {
          linearUserId: linearUser.id,
          linearUserEmail: linearUser.email,
          hasAccessToken: !!tokenData.accessToken,
          accessTokenLength: tokenData.accessToken?.length,
          hasRefreshToken: !!tokenData.refreshToken,
          hasExpiresAt: !!tokenData.expiresAt,
        })

        await storeToken.mutateAsync({
          linearUserId: linearUser.id,
          linearUserEmail: linearUser.email,
          accessToken: tokenData.accessToken,
          // Only include optional fields if they exist and are not null
          ...(tokenData.refreshToken && tokenData.refreshToken !== null ? { refreshToken: tokenData.refreshToken } : {}),
          ...(tokenData.expiresAt && tokenData.expiresAt !== null ? { expiresAt: tokenData.expiresAt } : {}),
        })

        // Store Linear user ID in localStorage for cross-device token lookup
        localStorage.setItem(LINEAR_USER_ID_STORAGE_KEY, linearUser.id)

        setStatus('success')
        toast.success('Successfully connected to Linear!')

        // Set flag to open project dialog after redirect
        sessionStorage.setItem('linear-just-connected', 'true')

        // Redirect back to the original page
        setTimeout(() => {
          const returnUrl = sessionStorage.getItem('linear-oauth-return-url') || '/'
          sessionStorage.removeItem('linear-oauth-return-url')
          // Extract pathname from URL if it's a full URL
          const path = returnUrl.startsWith('http') 
            ? new URL(returnUrl).pathname 
            : returnUrl
          navigate({ to: path })
        }, 1500)
      } catch (err) {
        console.error('Failed to exchange Linear OAuth code', err)
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to authenticate with Linear'
        setError(errorMessage)
        setStatus('error')
        toast.error(errorMessage)
        setTimeout(() => {
          const returnUrl = sessionStorage.getItem('linear-oauth-return-url') || '/'
          sessionStorage.removeItem('linear-oauth-return-url')
          // Extract pathname from URL if it's a full URL
          const path = returnUrl.startsWith('http') 
            ? new URL(returnUrl).pathname 
            : returnUrl
          navigate({ to: path })
        }, 2000)
      }
    }

    void handleCallback()
  }, [navigate, profile.clientId, storeToken])

  return (
    <div className="flex min-h-screen items-start justify-center pt-10 md:pt-20">
      <div className="text-center space-y-4">
        {status === 'processing' && (
          <>
            <Loader />
            <p className="text-slate-600 dark:text-slate-400">
              Processing Linear authentication...
            </p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-emerald-600 dark:text-emerald-400 text-lg font-semibold">
              ✓ Successfully connected to Linear!
            </div>
            <p className="text-slate-600 dark:text-slate-400">Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-rose-600 dark:text-rose-400 text-lg font-semibold">
              ✗ Authentication failed
            </div>
            {error && <p className="text-slate-600 dark:text-slate-400">{error}</p>}
            <p className="text-slate-600 dark:text-slate-400">Redirecting...</p>
          </>
        )}
      </div>
    </div>
  )
}
