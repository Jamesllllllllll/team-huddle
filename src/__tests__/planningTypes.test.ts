import {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_TYPE_LABELS,
} from '~/types'

describe('planning item type definitions', () => {
  test('labels stay in sync with declared planning item types', () => {
    const declared = new Set(PLANNING_ITEM_TYPES)
    const labeled = new Set(Object.keys(PLANNING_ITEM_TYPE_LABELS))

    expect(labeled).toEqual(declared)
  })

  test('planning item types remain unique and deterministic', () => {
    const seen = new Set<string>()
    for (const type of PLANNING_ITEM_TYPES) {
      expect(type.trim()).toBe(type)
      expect(seen.has(type)).toBe(false)
      seen.add(type)
    }
  })
})

