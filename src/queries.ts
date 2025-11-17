import { useMutation, useQueryClient } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'

export const userQueries = {
  current: () => convexQuery(api.users.current, {}),
  byExternalId: (externalId: string) => convexQuery(api.users.byExternalId, { externalId }),
  subscriptionStatus: () => convexQuery(api.users.subscriptionStatus, {}),
  hasOpenAIApiKey: () => convexQuery(api.users.hasOpenAIApiKey, {}),
}

export const huddleQueries = {
  list: () => convexQuery(api.huddle.listHuddles, {}),
  detail: (slug: string) => convexQuery(api.huddle.getHuddle, { slug }),
  transcript: (huddleId: Id<'huddles'>) =>
    convexQuery(api.huddle.listTranscriptChunks, { huddleId }),
  researchResult: (planningItemId: Id<'planningItems'>) =>
    convexQuery(api.huddle.getResearchResult, { planningItemId }),
}

export function useCreateHuddleMutation() {
  const mutationFn = useConvexMutation(api.huddle.createHuddle)
  return useMutation({ mutationFn })
}

export function useAddParticipantMutation() {
  const mutationFn = useConvexMutation(api.huddle.addParticipant)
  return useMutation({ mutationFn })
}

export function useRemoveParticipantMutation() {
  const mutationFn = useConvexMutation(api.huddle.removeParticipant)
  return useMutation({ mutationFn })
}

export function useAddObserverMutation() {
  const mutationFn = useConvexMutation(api.huddle.addObserver)
  return useMutation({ mutationFn })
}

export function useResetAllHuddlesMutation() {
  const mutationFn = useConvexMutation(api.huddle.resetAllHuddlesDev)
  return useMutation({ mutationFn })
}

export function useCreatePlanningItemMutation() {
  const mutationFn = useConvexMutation(api.huddle.createPlanningItem)
  return useMutation({ mutationFn })
}

export function useUpdatePlanningItemMutation() {
  const mutationFn = useConvexMutation(api.huddle.updatePlanningItem)
  return useMutation({ mutationFn })
}

export function useDeletePlanningItemMutation() {
  const mutationFn = useConvexMutation(api.huddle.deletePlanningItem)
  return useMutation({ mutationFn })
}

export function useUpsertPresenceMutation() {
  const mutationFn = useConvexMutation(api.huddle.upsertPresence)
  return useMutation({ mutationFn })
}

export function useClearPresenceMutation() {
  const mutationFn = useConvexMutation(api.huddle.clearPresence)
  return useMutation({ mutationFn })
}

export function useEndHuddleMutation() {
  const mutationFn = useConvexMutation(api.huddle.endHuddle)
  return useMutation({ mutationFn })
}

export function useAutoEndHuddleMutation() {
  const mutationFn = useConvexMutation(api.huddle.autoEndHuddle)
  return useMutation({ mutationFn })
}

export function useStartHuddleMutation() {
  const mutationFn = useConvexMutation(api.huddle.startHuddle)
  return useMutation({ mutationFn })
}

export function useUpdateHuddleNameMutation(slug: string) {
  const queryClient = useQueryClient()
  const mutationFn = useConvexMutation(api.huddle.updateHuddleName)
  return useMutation({
    mutationFn,
    // Optimistic update: update the cache immediately before the mutation completes
    onMutate: async (variables) => {
      // Construct the query key manually - Convex queries use ['convex', api.function, args]
      const huddleQueryKey = ['convex', api.huddle.getHuddle, { slug }] as const
      
      // Cancel outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: huddleQueryKey })
      
      // Snapshot the previous value
      const previousHuddle = queryClient.getQueryData(huddleQueryKey)
      
      if (!previousHuddle) {
        return { previousHuddle: null }
      }
      
      // Optimistically update to the new value
      queryClient.setQueryData(huddleQueryKey, (old: typeof previousHuddle) => {
        if (!old) return old
        return {
          ...old,
          name: variables.name,
        }
      })
      
      // Return context with snapshot for potential rollback
      return { previousHuddle }
    },
    // If the mutation fails, roll back to the previous value
    onError: (err, variables, context) => {
      if (context?.previousHuddle) {
        const huddleQueryKey = ['convex', api.huddle.getHuddle, { slug }] as const
        queryClient.setQueryData(huddleQueryKey, context.previousHuddle)
      }
    },
    // Always refetch after error or success to ensure we have the latest data
    onSettled: () => {
      const huddleQueryKey = ['convex', api.huddle.getHuddle, { slug }] as const
      queryClient.invalidateQueries({ queryKey: huddleQueryKey })
    },
  })
}

export function useDeleteHuddleMutation() {
  const mutationFn = useConvexMutation(api.huddle.deleteHuddle)
  return useMutation({ mutationFn })
}

export function useSetInviteOnlyMutation() {
  const mutationFn = useConvexMutation(api.huddle.setInviteOnly)
  return useMutation({ mutationFn })
}

export function useSetPrivateMutation() {
  const mutationFn = useConvexMutation(api.huddle.setPrivate)
  return useMutation({ mutationFn })
}

export function useInviteUserMutation() {
  const mutationFn = useConvexMutation(api.huddle.inviteUser)
  return useMutation({ mutationFn })
}

export function useRemoveInviteMutation() {
  const mutationFn = useConvexMutation(api.huddle.removeInvite)
  return useMutation({ mutationFn })
}

export const linearQueries = {
  hasToken: (linearUserId: string) => convexQuery(api.linear.hasLinearToken, { linearUserId }),
  getToken: (linearUserId: string) => convexQuery(api.linear.getLinearToken, { linearUserId }),
}

export function useStoreLinearTokenMutation() {
  const mutationFn = useConvexMutation(api.linear.storeLinearToken)
  return useMutation({ mutationFn })
}

export function useRemoveLinearTokenMutation() {
  const mutationFn = useConvexMutation(api.linear.removeLinearToken)
  return useMutation({ 
    mutationFn,
    onSuccess: () => {
      // Clear Linear user ID from localStorage when token is removed
      if (typeof window !== 'undefined') {
        localStorage.removeItem('huddle:linear-user-id')
      }
    },
  })
}

export function useUpdateSubscriptionStatusMutation() {
  const mutationFn = useConvexMutation(api.users.updateSubscriptionStatus)
  return useMutation({ mutationFn })
}

export function useDeleteOpenAIApiKeyMutation() {
  const mutationFn = useConvexMutation(api.users.deleteOpenAIApiKey)
  return useMutation({ mutationFn })
}

export function useSetOpenAIApiKeyEncryptedMutation() {
  const mutationFn = useConvexMutation(api.users.setOpenAIApiKeyEncrypted)
  return useMutation({ mutationFn })
}