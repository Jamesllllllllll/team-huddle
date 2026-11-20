import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useUpgradeCheckout } from '../hooks/useUpgradeCheckout'

const { auth, clerk, checkout, showError } = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  clerk: { user: null as object | null, openSignIn: vi.fn() },
  checkout: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('convex/react', () => ({ useConvexAuth: () => auth, useAction: () => checkout }))
vi.mock('@clerk/clerk-react', () => ({ useClerk: () => clerk }))
vi.mock('react-hot-toast', () => ({ default: { error: showError } }))

beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(auth, { isAuthenticated: false, isLoading: false })
  clerk.user = null
  window.history.replaceState(null, '', '/')
})

it('opens sign-in for a guest and sends no checkout request', async () => {
  const { result } = renderHook(useUpgradeCheckout)
  await act(() => result.current.startCheckout())
  expect(clerk.openSignIn).toHaveBeenCalledOnce()
  expect(checkout).not.toHaveBeenCalled()
  expect(result.current.isBusy).toBe(false)
})

it('waits for Convex to authenticate a signed-in user before requesting checkout', async () => {
  clerk.user = {}
  auth.isLoading = true
  const { result, rerender } = renderHook(useUpgradeCheckout)
  await act(() => result.current.startCheckout())
  expect(checkout).not.toHaveBeenCalled()
  expect(clerk.openSignIn).not.toHaveBeenCalled()

  auth.isLoading = false
  auth.isAuthenticated = true
  rerender()
  checkout.mockResolvedValue({ data: { url: '#checkout' }, error: null })
  await act(() => result.current.startCheckout())
  expect(checkout).toHaveBeenCalledExactlyOnceWith({
    productId: 'team_huddle_basic', successUrl: window.location.origin,
  })
  expect(window.location.hash).toBe('#checkout')
})

it('allows another attempt after either a provider error or a rejected Convex action', async () => {
  auth.isAuthenticated = true
  checkout.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } })
    .mockRejectedValueOnce(new Error('Server Error'))
    .mockResolvedValueOnce({ data: { url: '#retry' }, error: null })
  const { result } = renderHook(useUpgradeCheckout)
  for (let i = 0; i < 2; i++) {
    await act(() => result.current.startCheckout())
    expect(result.current.isBusy).toBe(false)
  }
  expect(showError).toHaveBeenCalledTimes(2)
  await act(() => result.current.startCheckout())
  expect(window.location.hash).toBe('#retry')
})
