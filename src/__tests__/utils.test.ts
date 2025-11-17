import {
  getInitials,
  hashStringToSeed,
  createSpeakerStyle,
  truncateBadgeText,
  extractBadgesFromMetadata,
} from '~/components/huddle/utils'
import type { PlanningItemType } from '~/types'
import type { TranscriptMetadata } from '~/components/huddle/types'

describe('utility functions', () => {
  describe('getInitials', () => {
    test('handles single name', () => {
      expect(getInitials('Alice')).toBe('AL')
      expect(getInitials('Bob')).toBe('BO')
    })

    test('handles full name', () => {
      expect(getInitials('Alice Smith')).toBe('AS')
      expect(getInitials('John Doe')).toBe('JD')
    })

    test('handles multiple words', () => {
      expect(getInitials('Mary Jane Watson')).toBe('MJ')
    })

    test('handles empty string', () => {
      expect(getInitials('')).toBe('?')
    })

    test('handles whitespace-only string', () => {
      expect(getInitials('   ')).toBe('?')
    })

    test('trims whitespace', () => {
      expect(getInitials('  Alice  Smith  ')).toBe('AS')
    })
  })

  describe('hashStringToSeed', () => {
    test('produces deterministic output', () => {
      const input = 'test-string'
      const hash1 = hashStringToSeed(input)
      const hash2 = hashStringToSeed(input)
      expect(hash1).toBe(hash2)
    })

    test('produces different hashes for different inputs', () => {
      const hash1 = hashStringToSeed('input1')
      const hash2 = hashStringToSeed('input2')
      expect(hash1).not.toBe(hash2)
    })

    test('never returns zero', () => {
      // Test multiple inputs to ensure we don't get zero
      for (let i = 0; i < 100; i++) {
        const hash = hashStringToSeed(`test-${i}`)
        expect(hash).not.toBe(0)
        expect(hash).toBeGreaterThan(0)
      }
    })

    test('handles empty string', () => {
      const hash = hashStringToSeed('')
      expect(hash).toBeGreaterThan(0)
    })
  })

  describe('createSpeakerStyle', () => {
    test('generates consistent styles for same seed and offset', () => {
      const style1 = createSpeakerStyle(100, 0)
      const style2 = createSpeakerStyle(100, 0)
      expect(style1).toEqual(style2)
    })

    test('generates different styles for different offsets', () => {
      const style1 = createSpeakerStyle(100, 0)
      const style2 = createSpeakerStyle(100, 1)
      expect(style1).not.toEqual(style2)
    })

    test('includes all required CSS variables', () => {
      const style = createSpeakerStyle(100, 0)
      const vars = style.style

      expect(vars['--bubble-bg-light']).toBeDefined()
      expect(vars['--bubble-text-light']).toBeDefined()
      expect(vars['--bubble-border-light']).toBeDefined()
      expect(vars['--bubble-bg-dark']).toBeDefined()
      expect(vars['--bubble-text-dark']).toBeDefined()
      expect(vars['--bubble-border-dark']).toBeDefined()
      expect(vars['--bubble-badge-bg-light']).toBeDefined()
      expect(vars['--bubble-badge-text-light']).toBeDefined()
      expect(vars['--bubble-badge-bg-dark']).toBeDefined()
      expect(vars['--bubble-badge-text-dark']).toBeDefined()
    })

    test('handles negative seeds', () => {
      const style = createSpeakerStyle(-100, 0)
      expect(style.style['--bubble-bg-light']).toBeDefined()
    })

    test('wraps hue values correctly for large offsets', () => {
      // Test that large offsets wrap around 360 degrees
      const style1 = createSpeakerStyle(100, 0)
      const style2 = createSpeakerStyle(100, 1000) // Large offset should wrap
      // Both should produce valid HSL values with hue in [0, 360)
      const hue1 = parseInt(style1.style['--bubble-bg-light']!.match(/\d+/)![0])
      const hue2 = parseInt(style2.style['--bubble-bg-light']!.match(/\d+/)![0])
      expect(hue1).toBeGreaterThanOrEqual(0)
      expect(hue1).toBeLessThan(360)
      expect(hue2).toBeGreaterThanOrEqual(0)
      expect(hue2).toBeLessThan(360)
    })
  })

  describe('truncateBadgeText', () => {
    test('returns text unchanged if under max length', () => {
      const text = 'Short text'
      expect(truncateBadgeText(text, 160)).toBe(text)
    })

    test('truncates text that exceeds max length', () => {
      const longText = 'a'.repeat(200)
      const truncated = truncateBadgeText(longText, 160)
      expect(truncated.length).toBeLessThanOrEqual(160)
      expect(truncated.endsWith('…')).toBe(true)
    })

    test('uses default max length of 160', () => {
      const longText = 'a'.repeat(200)
      const truncated = truncateBadgeText(longText)
      expect(truncated.length).toBeLessThanOrEqual(160)
    })

    test('trims trailing whitespace after truncation', () => {
      // Text under max length: no truncation, whitespace preserved
      const shortText = 'a'.repeat(150) + '   '
      expect(truncateBadgeText(shortText, 160)).toBe(shortText)

      // Text over max length: truncates then trims trailing whitespace
      const longText = 'a'.repeat(200) + '   '
      const truncated = truncateBadgeText(longText, 160)
      expect(truncated.endsWith('…')).toBe(true)
      // The ellipsis should be added after trimming, so no trailing spaces before it
      expect(truncated.slice(0, -1).trimEnd()).toBe(truncated.slice(0, -1))
    })
  })

  describe('extractBadgesFromMetadata', () => {
    test('returns empty array for undefined metadata', () => {
      expect(extractBadgesFromMetadata(undefined)).toEqual([])
    })

    test('returns empty array for metadata without planningItemEvents', () => {
      expect(extractBadgesFromMetadata({})).toEqual([])
    })

    test('extracts valid badge events', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemCreated',
            itemType: 'idea' as PlanningItemType,
            itemText: 'Test idea',
            itemId: 'item-1',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges).toHaveLength(1)
      expect(badges[0]).toEqual({
        id: 'item-1',
        type: 'idea',
        text: 'Test idea',
      })
    })

    test('filters out non-eligible types', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemCreated',
            itemType: 'summary' as PlanningItemType, // Not eligible
            itemText: 'Summary text',
            itemId: 'item-1',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges).toHaveLength(0)
    })

    test('filters out non-creation events', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemUpdated',
            itemType: 'idea' as PlanningItemType,
            itemText: 'Updated idea',
            itemId: 'item-1',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges).toHaveLength(0)
    })

    test('filters out events with empty text', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemCreated',
            itemType: 'idea' as PlanningItemType,
            itemText: '   ',
            itemId: 'item-1',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges).toHaveLength(0)
    })

    test('uses itemKey as fallback for id', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemCreated',
            itemType: 'task' as PlanningItemType,
            itemText: 'Test task',
            itemKey: 'task-key-1',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges).toHaveLength(1)
      expect(badges[0]!.id).toBe('task-key-1')
    })

    test('handles multiple valid events', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemCreated',
            itemType: 'idea' as PlanningItemType,
            itemText: 'Idea 1',
            itemId: 'item-1',
          },
          {
            kind: 'planningItemCreated',
            itemType: 'task' as PlanningItemType,
            itemText: 'Task 1',
            itemId: 'item-2',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges).toHaveLength(2)
    })

    test('trims item text', () => {
      const metadata: TranscriptMetadata = {
        planningItemEvents: [
          {
            kind: 'planningItemCreated',
            itemType: 'idea' as PlanningItemType,
            itemText: '  Trimmed idea  ',
            itemId: 'item-1',
          },
        ],
      }

      const badges = extractBadgesFromMetadata(metadata)
      expect(badges[0]!.text).toBe('Trimmed idea')
    })
  })
})

