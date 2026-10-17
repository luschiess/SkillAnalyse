export type CategoryId =
  | 'front-lever' | 'handstand' | 'handstand-push-up' | 'push-up' | 'bent-arm-press'
  | 'back-lever' | 'bar-skills' | 'planche' | 'core' | 'dips-bars'
  | 'human-flag' | 'rings' | 'freestyle' | 'floorwork' | 'dynamic-skills'
export type SkillType = 'static' | 'dynamic' | 'combined' | 'transition' | 'information'
export type AnalysisSupport = 'automatic' | 'partial' | 'manual'
export const LUSCHIES_SKILL_ID = 'handstand-luschies-skill'

export interface Skill {
  id: string
  name: string
  category: CategoryId
  categoryName: string
  level: number
  type: SkillType
  description: string
  checkpoints: string[]
  camera: string
  cues: string[]
  analysisSupport: AnalysisSupport
  equipment: string[]
  prerequisites: string[]
  regressions: string[]
  progressions: string[]
  commonErrors: string[]
  drills: string[]
  safety: string[]
  relatedSkillIds: string[]
  difficultyTag?: 'Extreme'
}

export interface Criterion {
  name: string
  score: number
  detail: string
}

export interface AnalysisReport {
  score: number | null
  confidence: number
  insufficientConfidence: boolean
  framesAnalyzed: number
  validReps: number
  partialReps: number
  longestHold: number
  totalHold: number
  repConfidence: number[]
  criteria: Criterion[]
  issues: string[]
  positives: string[]
  suggestions: string[]
  timestampExamples: Array<{ time: number; issue: string }>
  movementRange: 'not-applicable' | 'limited' | 'partial' | 'broad' | 'not-assessable'
  limitations: string[]
}

export interface TrainingSession {
  id: string
  date: string
  skillId: string
  skillName: string
  category: CategoryId
  report: AnalysisReport
  settings: {
    targetReps: number
    measureHold: boolean
    targetHold: number
    focus: string
    positionTolerance: number
    smoothingStrength: number
  }
  video?: Blob
  combo?: ComboAnalysis
  freestyle?: FreestyleAnalysis
}

export type ComboStepKind = 'press' | 'hold' | 'hspu' | 'manual'

export interface ComboStep {
  id: string
  kind: ComboStepKind
  name: string
  repetitions: number
  holdSeconds: number
  description: string
}

export interface ComboSegment {
  stepId: string
  name: string
  kind: ComboStepKind
  start: number
  end: number
  repetitions: number
  targetRepetitions: number
  targetHoldSeconds: number
  description: string
  detected: boolean
  confirmed: boolean
  confidence: 'estimated' | 'unconfirmed'
  feedback: string
}

export interface ComboAnalysis {
  segments: ComboSegment[]
  sequenceFollowed: boolean | null
  duration: number
  note: string
}

export type FreestyleSkillKind =
  | 'handstand'
  | 'handstand-push-up'
  | 'front-lever'
  | 'front-lever-raise'
  | 'push-up'
  | 'press-to-handstand'
  | 'luschies-skill'
  | 'elbow-lever'
  | 'elbow-lever-to-handstand'
  | 'other-skill'
  | 'pull-up'
  | 'muscle-up'
  | 'unknown'

export interface FreestyleSegment {
  id: string
  kind: FreestyleSkillKind
  name: string
  start: number
  end: number
  repetitions: number
  partialRepetitions: number
  holdSeconds: number
  confidence: number
  status: 'reliable' | 'estimated' | 'unclear'
  alignment: number | null
  feedback: string
  confirmed: boolean
}

export interface FreestyleAnalysis {
  duration: number
  framesAnalyzed: number
  lowConfidenceFrames: number
  segments: FreestyleSegment[]
  reliableRepetitions: number
  note: string
}

export interface PosePoint {
  x: number
  y: number
  z: number
  visibility: number
}

export interface LiveMetrics {
  confidence: number
  validReps: number
  partialReps: number
  currentHold: number
  longestHold: number
  totalHold: number
  phaseLabel?: string
}
