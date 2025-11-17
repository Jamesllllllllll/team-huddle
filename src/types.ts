export const PLANNING_ITEM_TYPES = [
  'idea',
  'task',
  'dependency',
  'owner',
  'risk',
  'outcome',
  'decision',
  'summary',
] as const

export type PlanningItemType = (typeof PLANNING_ITEM_TYPES)[number]

export const PLANNING_ITEM_TYPE_LABELS: Record<PlanningItemType, string> = {
  idea: 'Idea',
  task: 'Task',
  dependency: 'Dependency',
  owner: 'Owner',
  risk: 'Risk',
  outcome: 'Outcome',
  decision: 'Decision',
  summary: 'Summary Note',
}
