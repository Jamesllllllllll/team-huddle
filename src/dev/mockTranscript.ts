import type { DevSimulationAction } from '~/dev/simulationSchema'

export type DevTranscriptChunk = {
  id: string
  speakerId: string
  speakerLabel: string
  text: string
  actions: Array<DevSimulationAction>
}

export const DEV_TRANSCRIPT_CHUNKS: Array<DevTranscriptChunk> = [
  {
    id: 'chunk-1',
    speakerId: 'alex',
    speakerLabel: 'Alex',
    text: "Morning! Let's lock the onboarding sprint goal.",
    actions: [
      {
        kind: 'createItem',
        itemKey: 'idea_goal_alignment',
        type: 'idea',
        text: 'Clarify the onboarding sprint goal with the team.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: false,
      },
    ],
  },
  {
    id: 'chunk-2',
    speakerId: 'bree',
    speakerLabel: 'Bree',
    text: 'Outcome should be a guided signup ready for beta testers Friday.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'outcome_beta_ready',
        type: 'outcome',
        text: 'Guided onboarding experience ready for beta testers by Friday.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: null,
      },
    ],
  },
  {
    id: 'chunk-3',
    speakerId: 'cam',
    speakerLabel: 'Cam',
    text: 'Idea: embed contextual tips on each onboarding screen.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'idea_contextual_tips',
        type: 'idea',
        text: 'Embed contextual tips on each onboarding screen.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: false,
      },
    ],
  },
  {
    id: 'chunk-4',
    speakerId: 'alex',
    speakerLabel: 'Alex',
    text: 'Idea: add a quickstart checklist after signup.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'idea_quickstart_checklist',
        type: 'idea',
        text: 'Provide a quickstart checklist after signup.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: false,
      },
    ],
  },
  {
    id: 'chunk-5',
    speakerId: 'bree',
    speakerLabel: 'Bree',
    text: 'Task: audit current onboarding screens.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'task_audit_flow',
        type: 'task',
        text: 'Audit current onboarding screens for gaps.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: null,
      },
    ],
  },
  {
    id: 'chunk-6',
    speakerId: 'cam',
    speakerLabel: 'Cam',
    text: 'Task: write tip copy after the audit.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'task_write_tip_copy',
        type: 'task',
        text: 'Draft contextual tip copy for the onboarding screens.',
        speakerLabel: null,
        blockedByKeys: ['task_audit_flow'],
        needsResearch: null,
      },
    ],
  },
  {
    id: 'chunk-7',
    speakerId: 'alex',
    speakerLabel: 'Alex',
    text: 'Task: prototype the quickstart checklist once copy is ready.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'task_prototype_checklist',
        type: 'task',
        text: 'Prototype the quickstart checklist experience.',
        speakerLabel: null,
        blockedByKeys: ['task_write_tip_copy'],
        needsResearch: null,
      },
    ],
  },
  {
    id: 'chunk-8',
    speakerId: 'bree',
    speakerLabel: 'Bree',
    text: 'Task: hook up analytics after the prototype is working.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'task_instrument_analytics',
        type: 'task',
        text: 'Hook up analytics to track onboarding completion.',
        speakerLabel: null,
        blockedByKeys: ['task_prototype_checklist'],
        needsResearch: null,
      },
    ],
  },
  {
    id: 'chunk-9',
    speakerId: 'cam',
    speakerLabel: 'Cam',
    text: 'Decision: use Mixpanel events for the tracking.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'decision_mixpanel',
        type: 'decision',
        text: 'Use Mixpanel events to measure onboarding flow engagement.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: null,
      },
    ],
  },
  {
    id: 'chunk-10',
    speakerId: 'alex',
    speakerLabel: 'Alex',
    text: 'Summary: review progress during Thursday standup.',
    actions: [
      {
        kind: 'createItem',
        itemKey: 'summary_review',
        type: 'summary',
        text: 'Review onboarding sprint progress in Thursday standup.',
        speakerLabel: null,
        blockedByKeys: null,
        needsResearch: null,
      },
    ],
  },
]

