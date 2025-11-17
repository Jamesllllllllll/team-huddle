import {
    GOLDEN_ANGLE_DEGREES,
    PLANNING_TYPE_LABEL_MAP,
    TRANSCRIPT_BADGE_BASE_CLASSES,
    TRANSCRIPT_BADGE_ELIGIBLE_TYPES,
    TRANSCRIPT_BADGE_FALLBACK_CLASSES,
    TRANSCRIPT_BADGE_LABEL_OVERRIDES,
    TRANSCRIPT_BADGE_STYLE_BY_TYPE,
} from './constants'
import type {
    SpeakerStyle,
    TranscriptBadge,
    TranscriptMetadata,
} from './types'
import type { PlanningItemType } from '~/types'

export function getTranscriptBadgeLabel(type: PlanningItemType) {
    return TRANSCRIPT_BADGE_LABEL_OVERRIDES[type] ?? PLANNING_TYPE_LABEL_MAP[type] ?? type
}

export function getTranscriptBadgeClasses(type: PlanningItemType) {
    return TRANSCRIPT_BADGE_STYLE_BY_TYPE[type] ?? TRANSCRIPT_BADGE_FALLBACK_CLASSES
}

export function truncateBadgeText(text: string, maxLength = 160) {
    if (text.length <= maxLength) {
        return text
    }
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function getInitials(name: string) {
    const trimmed = name.trim()
    if (!trimmed) {
        return '?'
    }
    const parts = trimmed.split(/\s+/)
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase()
    }
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function hashStringToSeed(input: string) {
    let hash = 0
    for (let index = 0; index < input.length; index += 1) {
        hash = (hash << 5) - hash + input.charCodeAt(index)
        hash |= 0
    }
    const unsigned = hash >>> 0
    return unsigned === 0 ? 1 : unsigned
}

export function createSpeakerStyle(baseHueSeed: number, offset: number): SpeakerStyle {
    const baseHue = (baseHueSeed % 360 + 360) % 360
    const hue = Math.round((baseHue + offset * GOLDEN_ANGLE_DEGREES) % 360)

    const lightBg = `hsl(${hue}, 90%, 95%)`
    const lightText = `hsl(${hue}, 45%, 22%)`
    const lightBorder = `hsl(${hue}, 70%, 80%)`
    const lightBadgeBg = `hsl(${hue}, 85%, 90%)`
    const lightBadgeText = `hsl(${hue}, 40%, 25%)`

    const darkBg = `hsl(${hue}, 60%, 28%)`
    const darkText = `hsl(${hue}, 80%, 90%)`
    const darkBorder = `hsl(${hue}, 65%, 45%)`
    const darkBadgeBg = `hsl(${hue}, 70%, 38%)`
    const darkBadgeText = `hsl(${hue}, 85%, 94%)`

    const vars: SpeakerStyle['style'] = {
        '--bubble-bg-light': lightBg,
        '--bubble-text-light': lightText,
        '--bubble-border-light': lightBorder,
        '--bubble-bg-dark': darkBg,
        '--bubble-text-dark': darkText,
        '--bubble-border-dark': darkBorder,
        '--bubble-badge-bg-light': lightBadgeBg,
        '--bubble-badge-text-light': lightBadgeText,
        '--bubble-badge-bg-dark': darkBadgeBg,
        '--bubble-badge-text-dark': darkBadgeText,
    }

    return { style: vars }
}

export function extractBadgesFromMetadata(metadata?: TranscriptMetadata): TranscriptBadge[] {
    if (!metadata || !Array.isArray(metadata.planningItemEvents)) {
        return []
    }

    const badges: TranscriptBadge[] = []
    for (const rawEvent of metadata.planningItemEvents) {
        if (!rawEvent || typeof rawEvent !== 'object') {
            continue
        }

        if (rawEvent.kind !== 'planningItemCreated') {
            continue
        }

        const itemType = rawEvent.itemType
        if (
            typeof itemType !== 'string' ||
            !TRANSCRIPT_BADGE_ELIGIBLE_TYPES.has(itemType as PlanningItemType)
        ) {
            continue
        }
        const normalizedType = itemType as PlanningItemType

        const text = typeof rawEvent.itemText === 'string' ? rawEvent.itemText.trim() : ''
        if (text.length === 0) {
            continue
        }

        const id =
            (typeof rawEvent.itemId === 'string' && rawEvent.itemId) ||
            (typeof rawEvent.itemKey === 'string' && rawEvent.itemKey)
        if (!id) {
            continue
        }

        badges.push({
            id,
            type: normalizedType,
            text,
        })
    }

    return badges
}

export function normalizeAudioBlob(blob: Blob) {
    const rawType = typeof blob.type === 'string' && blob.type.length > 0 ? blob.type : 'audio/webm'
    const cleanType = rawType.split(';', 1)[0]?.trim().toLowerCase() || 'audio/webm'
    const extension = cleanType.split('/').pop() ?? 'webm'
    return new File([blob], `voice-${Date.now()}.${extension}`, { type: cleanType })
}
