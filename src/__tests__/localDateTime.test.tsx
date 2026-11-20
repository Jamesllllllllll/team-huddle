import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { LocalDateTime } from '~/components/LocalDateTime'
import { formatDate } from '~/utils/dates'

it('hydrates the server date before switching to the browser date', async () => {
  const value = '2026-01-22T01:00:00.000Z'
  const element = <LocalDateTime value={value} format="date" />
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  expect(container.querySelector('time')?.textContent).toBe('2026-01-22')
  const onRecoverableError = vi.fn()
  let root: Root | undefined
  try {
    await act(() => { root = hydrateRoot(container, element, { onRecoverableError }) })
    expect(container.textContent).toBe(formatDate(value))
    expect(onRecoverableError).not.toHaveBeenCalled()
  } finally {
    await act(() => root?.unmount())
  }
})
