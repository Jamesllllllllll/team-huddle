import { z } from 'zod'
import { PLANNING_ITEM_TYPES } from '~/types'

export const zPlanningItemType = z.enum(PLANNING_ITEM_TYPES, {
  message: 'type is required',
})

const zNullableNonEmptyString = z
  .string()
  .min(1)
  .nullable()
  .describe('Use null to fall back to the default speaker label.')

export const zDevSimulationCreateAction = z.object({
  kind: z.literal('createItem'),
  itemKey: z
    .string()
    .min(1, 'itemKey must reference the deterministic key for the item'),
  type: zPlanningItemType,
  text: z.string().min(1, 'text is required'),
  speakerLabel: zNullableNonEmptyString,
  blockedByKeys: z
    .array(z.string().min(1))
    .min(1)
    .nullable()
    .describe('List of item keys this item depends on; null when none.'),
  needsResearch: z
    .boolean()
    .nullable()
    .describe('For idea items: set to true if the user explicitly requests research or information lookup (e.g., "look up", "research", "find out about"), otherwise set to false. For all other item types, use null. Always provide a boolean value (true or false) for ideas, never omit this field.'),
})

const zDevSimulationUpdatePatch = z
  .object({
    text: z.string().min(1).nullable(),
    blockedByKeys: z
      .array(z.string().min(1))
      .min(1)
      .nullable()
      .describe('List of item keys this item depends on; null when unchanged.'),
  })
  .superRefine((patch, ctx) => {
    const hasText = patch.text !== null
    const hasBlockedBy = patch.blockedByKeys !== null

    if (!hasText && !hasBlockedBy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'patch must include at least one field set to a non-null value.',
        path: [],
      })
    }
  })

export const zDevSimulationUpdateAction = z.object({
  kind: z.literal('updateItem'),
  targetKey: z
    .string()
    .min(1, 'targetKey must reference the existing item key'),
  patch: zDevSimulationUpdatePatch,
})

export const zDevSimulationRemoveAction = z.object({
  kind: z.literal('removeItem'),
  targetKey: z
    .string()
    .min(1, 'targetKey must reference the existing item key to remove'),
})

export const zDevSimulationAction = z.discriminatedUnion('kind', [
  zDevSimulationCreateAction,
  zDevSimulationUpdateAction,
  zDevSimulationRemoveAction,
])

export type DevSimulationAction = z.infer<typeof zDevSimulationAction>

export const zDevSimulationResponse = z.object({
  actions: z
    .array(zDevSimulationAction)
    .describe('Ordered list of structured planning item updates.'),
  rationale: z
    .string()
    .min(1)
    .nullable()
    .describe(
      'Optional reasoning summary for the generated actions; null when omitted.',
    ),
})

export type DevSimulationResponse = z.infer<typeof zDevSimulationResponse>

