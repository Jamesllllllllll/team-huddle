import type { LucideIcon } from 'lucide-react'
import { Flag, ListChecks, Sparkles } from 'lucide-react'
import { PLANNING_ITEM_TYPE_LABELS, type PlanningItemType } from '~/types'
import type { SpeakerStyle } from './types'

export const TRANSCRIPT_BADGE_ELIGIBLE_TYPES = new Set<PlanningItemType>([
    'idea',
    'task',
    'owner',
    'risk',
    'decision',
    'outcome',
])

export const TRANSCRIPT_BADGE_LABEL_OVERRIDES: Partial<Record<PlanningItemType, string>> = {
    outcome: 'Goal',
}

export const TRANSCRIPT_BADGE_STYLE_BY_TYPE: Partial<Record<PlanningItemType, string>> = {
    idea: 'bg-amber-100/80 text-amber-900 ring-amber-200/70 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-500/40',
    task: 'bg-sky-100/80 text-sky-900 ring-sky-200/70 dark:bg-sky-900/30 dark:text-sky-100 dark:ring-sky-500/40',
    owner: 'bg-fuchsia-100/80 text-fuchsia-900 ring-fuchsia-200/70 dark:bg-fuchsia-900/30 dark:text-fuchsia-100 dark:ring-fuchsia-500/40',
    risk: 'bg-rose-100/80 text-rose-900 ring-rose-200/70 dark:bg-rose-900/30 dark:text-rose-100 dark:ring-rose-500/40',
    decision:
        'bg-emerald-100/80 text-emerald-900 ring-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-100 dark:ring-emerald-500/40',
    outcome:
        'bg-indigo-100/80 text-indigo-900 ring-indigo-200/70 dark:bg-indigo-900/30 dark:text-indigo-100 dark:ring-indigo-500/40',
}

export const TRANSCRIPT_BADGE_FALLBACK_CLASSES =
    'bg-slate-200/80 text-slate-900 ring-slate-300/70 dark:bg-slate-900/30 dark:text-slate-100 dark:ring-slate-600/50'

export const TRANSCRIPT_BADGE_BASE_CLASSES =
    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset'

export const PLANNING_EMPTY_MESSAGES: Partial<Record<PlanningItemType, string>> = {
    idea: 'No ideas yet.',
    task: 'No tasks planned yet.',
    outcome: 'Once the team aligns on the goal, it will land here.',
    dependency: 'Mention any dependencies.',
    owner: 'Mention owners for this project.',
    decision: 'Decisions will appear here as they are made.',
    risk: 'Mention risks as they show up.',
    summary: 'When the huddle wraps, summarize the plan in this space.',
}

export const PRIMARY_COLUMN_CONFIG: Array<{
    type: PlanningItemType
    title: string
    description: string
    icon: LucideIcon
    accentClass: string
}> = [
    {
        type: 'idea',
        title: 'Ideas',
        description: 'Raw possibilities and prompts to explore with the group.',
        icon: Sparkles,
        accentClass: 'from-amber-200/60 via-white/40 dark:via-white/10 to-transparent dark:from-amber-400/10',
    },
    {
        type: 'task',
        title: 'Tasks',
        description: 'Concrete follow-ups that bring the plan to life.',
        icon: ListChecks,
        accentClass: 'from-emerald-200/60 via-white/50 dark:via-white/10 to-transparent dark:from-emerald-400/10',
    },
    {
        type: 'outcome',
        title: 'Goals',
        description: 'The objective we commit to once the huddle aligns.',
        icon: Flag,
        accentClass: 'from-sky-200/60 via-white/50 dark:via-white/10 to-transparent dark:from-sky-400/10',
    },
]

export const SUPPORTING_SECTIONS: Array<{
    type: PlanningItemType
    title: string
    description: string
}> = [
    {
        type: 'risk',
        title: 'Risks',
        description: 'Concerns that could derail the plan if left unchecked.',
    },
    {
        type: 'dependency',
        title: 'Dependencies',
        description: 'Prerequisites or linked workstreams we rely on.',
    },
    {
        type: 'decision',
        title: 'Decisions',
        description: 'Agreements and directional calls made in the huddle.',
    },
    {
        type: 'owner',
        title: 'Owners',
        description: 'People accountable for actions or themes.',
    },
]

export const PLANNING_TYPE_LABEL_MAP = PLANNING_ITEM_TYPE_LABELS

export const GOLDEN_ANGLE_DEGREES = 137.508

export const FALLBACK_SPEAKER_STYLE: SpeakerStyle = {
    style: {
        '--bubble-bg-light': 'hsl(215, 33%, 95%)',
        '--bubble-text-light': 'hsl(217, 19%, 27%)',
        '--bubble-border-light': 'hsl(215, 20%, 82%)',
        '--bubble-bg-dark': 'hsl(215, 28%, 20%)',
        '--bubble-text-dark': 'hsl(214, 32%, 92%)',
        '--bubble-border-dark': 'hsl(215, 23%, 35%)',
        '--bubble-badge-bg-light': 'hsl(215, 33%, 88%)',
        '--bubble-badge-text-light': 'hsl(217, 19%, 27%)',
        '--bubble-badge-bg-dark': 'hsl(215, 28%, 28%)',
        '--bubble-badge-text-dark': 'hsl(214, 32%, 92%)',
    },
}

export const DEV_TOOLBAR_STORAGE_KEY = 'huddle:dev-toolbar-visible'
export const RECORDING_MODE_STORAGE_KEY = 'huddle:recording-mode'
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000

