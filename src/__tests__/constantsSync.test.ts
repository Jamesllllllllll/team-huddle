import {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_TYPE_LABELS,
} from '~/types'
import {
  TRANSCRIPT_BADGE_ELIGIBLE_TYPES,
  PRIMARY_COLUMN_CONFIG,
  SUPPORTING_SECTIONS,
  PLANNING_EMPTY_MESSAGES,
} from '~/components/huddle/constants'

describe('constants synchronization', () => {
  test('all planning item types have labels', () => {
    for (const type of PLANNING_ITEM_TYPES) {
      expect(PLANNING_ITEM_TYPE_LABELS[type]).toBeDefined()
      expect(typeof PLANNING_ITEM_TYPE_LABELS[type]).toBe('string')
      expect(PLANNING_ITEM_TYPE_LABELS[type].length).toBeGreaterThan(0)
    }
  })

  test('transcript badge eligible types are valid planning item types', () => {
    const validTypes = new Set(PLANNING_ITEM_TYPES)
    for (const type of TRANSCRIPT_BADGE_ELIGIBLE_TYPES) {
      expect(validTypes.has(type)).toBe(true)
    }
  })

  test('primary column config covers distinct types', () => {
    const primaryTypes = new Set(PRIMARY_COLUMN_CONFIG.map((c) => c.type))
    expect(primaryTypes.size).toBe(PRIMARY_COLUMN_CONFIG.length) // No duplicates

    for (const config of PRIMARY_COLUMN_CONFIG) {
      expect(PLANNING_ITEM_TYPES.includes(config.type)).toBe(true)
      expect(config.title).toBeDefined()
      expect(config.description).toBeDefined()
    }
  })

  test('supporting sections cover distinct types', () => {
    const supportingTypes = new Set(SUPPORTING_SECTIONS.map((s) => s.type))
    expect(supportingTypes.size).toBe(SUPPORTING_SECTIONS.length) // No duplicates

    for (const section of SUPPORTING_SECTIONS) {
      expect(PLANNING_ITEM_TYPES.includes(section.type)).toBe(true)
      expect(section.title).toBeDefined()
      expect(section.description).toBeDefined()
    }
  })

  test('primary and supporting sections do not overlap', () => {
    const primaryTypes = new Set(PRIMARY_COLUMN_CONFIG.map((c) => c.type))
    const supportingTypes = new Set(SUPPORTING_SECTIONS.map((s) => s.type))

    for (const type of primaryTypes) {
      expect(supportingTypes.has(type)).toBe(false)
    }
  })

  test('all planning item types have empty messages', () => {
    for (const type of PLANNING_ITEM_TYPES) {
      expect(PLANNING_EMPTY_MESSAGES[type]).toBeDefined()
      expect(typeof PLANNING_EMPTY_MESSAGES[type]).toBe('string')
      expect(PLANNING_EMPTY_MESSAGES[type]!.length).toBeGreaterThan(0)
    }
  })

  test('primary and supporting sections together cover all types except summary', () => {
    const primaryTypes = new Set(PRIMARY_COLUMN_CONFIG.map((c) => c.type))
    const supportingTypes = new Set(SUPPORTING_SECTIONS.map((s) => s.type))
    const coveredTypes = new Set([...primaryTypes, ...supportingTypes])

    // Summary is handled separately, so it's expected to not be in either
    const expectedCovered = PLANNING_ITEM_TYPES.filter((t) => t !== 'summary')
    const expectedSet = new Set(expectedCovered)

    expect(coveredTypes).toEqual(expectedSet)
  })
})

