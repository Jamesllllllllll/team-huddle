import { z } from 'zod'

// Zod keeps client-side parsing in sync with the Convex schema.

export const planningItemSchema = z.object({
  id: z.string(),
  huddleId: z.string(),
  type: z.enum([
    'idea',
    'task',
    'dependency',
    'owner',
    'risk',
    'outcome',
    'decision',
    'summary',
  ]),
  text: z.string(),
  timestamp: z.string(),
  speakerId: z.string().optional(),
  speakerLabel: z.string().optional(),
  metadata: z.unknown().optional(),
  order: z.number().optional(),
})

export const createPlanningItemSchema = z.object({
  huddleId: planningItemSchema.shape.huddleId,
  type: planningItemSchema.shape.type,
  text: planningItemSchema.shape.text.min(1, 'Text is required'),
  timestamp: planningItemSchema.shape.timestamp,
  speakerId: planningItemSchema.shape.speakerId,
  speakerLabel: planningItemSchema.shape.speakerLabel,
  metadata: planningItemSchema.shape.metadata,
  order: planningItemSchema.shape.order,
})

export const deletePlanningItemSchema = z.object({
  id: planningItemSchema.shape.id,
  huddleId: planningItemSchema.shape.huddleId,
})

