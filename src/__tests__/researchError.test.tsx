import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Research } from '~/components/huddle/Research'
import { messages } from '~/shared/errors'
import type { Id } from '../../convex/_generated/dataModel'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { status: 'failed', error: 'Legacy raw response with a credential fragment' } }),
}))

it('displays a friendly message for previously stored research failures', () => {
  render(<Research planningItemId={'test-item' as Id<'planningItems'>} />)
  expect(screen.getByText(messages.research)).toBeVisible()
  expect(screen.queryByText(/credential fragment/)).toBeNull()
})
