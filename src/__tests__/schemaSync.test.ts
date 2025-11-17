import { planningItemSchema, createPlanningItemSchema } from '~/db/schema'
import { PLANNING_ITEM_TYPES } from '~/types'
import { zPlanningItemType } from '~/dev/simulationSchema'

describe('schema synchronization', () => {
  test('Zod planning item schema enum matches PLANNING_ITEM_TYPES', () => {
    const zodEnum = planningItemSchema.shape.type._def.values
    const declaredTypes = new Set(PLANNING_ITEM_TYPES)
    const zodTypes = new Set(zodEnum)

    expect(zodTypes).toEqual(declaredTypes)
    expect(zodTypes.size).toBe(PLANNING_ITEM_TYPES.length)
  })

  test('simulation schema enum matches PLANNING_ITEM_TYPES', () => {
    const simulationEnum = zPlanningItemType._def.values
    const declaredTypes = new Set(PLANNING_ITEM_TYPES)
    const simulationTypes = new Set(simulationEnum)

    expect(simulationTypes).toEqual(declaredTypes)
  })

  test('createPlanningItemSchema requires non-empty text', () => {
    const valid = createPlanningItemSchema.safeParse({
      huddleId: 'test-huddle',
      type: 'task',
      text: 'Valid task text',
      timestamp: '2024-01-01T00:00:00Z',
    })

    expect(valid.success).toBe(true)

    const invalid = createPlanningItemSchema.safeParse({
      huddleId: 'test-huddle',
      type: 'task',
      text: '',
      timestamp: '2024-01-01T00:00:00Z',
    })

    expect(invalid.success).toBe(false)
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.path).toContain('text')
    }
  })

  test('planningItemSchema accepts all required fields', () => {
    const validItem = {
      id: 'item-1',
      huddleId: 'huddle-1',
      type: 'idea' as const,
      text: 'Test idea',
      timestamp: '2024-01-01T00:00:00Z',
    }

    const result = planningItemSchema.safeParse(validItem)
    expect(result.success).toBe(true)
  })

  test('planningItemSchema accepts optional fields', () => {
    const itemWithOptionals = {
      id: 'item-1',
      huddleId: 'huddle-1',
      type: 'task' as const,
      text: 'Test task',
      timestamp: '2024-01-01T00:00:00Z',
      speakerId: 'speaker-1',
      speakerLabel: 'Alice',
      metadata: { custom: 'data' },
      order: 1,
    }

    const result = planningItemSchema.safeParse(itemWithOptionals)
    expect(result.success).toBe(true)
  })
})

