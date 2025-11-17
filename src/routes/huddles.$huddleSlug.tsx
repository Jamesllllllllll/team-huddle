import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { Huddle } from '~/components/Huddle'
import { Loader } from '~/components/Loader'
import { huddleQueries } from '~/queries'

export const Route = createFileRoute('/huddles/$huddleSlug')({
  component: HuddleRoute,
  pendingComponent: () => <Loader />,
  validateSearch: z.object({
    itemId: z.string().optional(),
    shareKey: z.string().optional(),
  }),
  loader: async ({ params, context: { queryClient } }) => {
    const huddle = await queryClient.ensureQueryData(
      huddleQueries.detail(params.huddleSlug),
    )

    if (!huddle) {
      throw redirect({ to: '/' })
    }
  },
})

function HuddleRoute() {
  const { huddleSlug } = Route.useParams()
  return <Huddle slug={huddleSlug} />
}
