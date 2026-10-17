import type { AnalysisReport, ComboAnalysis, ComboSegment, ComboStep, LiveMetrics, PosePoint } from '../types'
import { analyzeHandstand } from './analyzers/handstand'
import { analyzeHandstandPushUp } from './analyzers/handstandPushUp'
import { landmark, midpoint } from './analyzers/common'

interface ComboSample {
  time: number
  confidence: number
  inverted: boolean
  alignment: number
  elbowAngle: number
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

export class ComboAnalyzer {
  private readonly steps: ComboStep[]
  private samples: ComboSample[] = []
  private reps = 0
  private repConfidence: number[] = []
  private bending = false
  private hold = 0
  private longestHold = 0
  private previousTime: number | undefined
  private previousHoldFrame = false

  constructor(steps: ComboStep[]) {
    this.steps = steps
  }

  consume(points: PosePoint[] | null, time: number): LiveMetrics {
    if (!points || points.length <= landmark.rightAnkle) return this.live(0)
    const frame = analyzeHandstand(points)
    const pushFrame = analyzeHandstandPushUp(points)
    const shoulder = midpoint(points[landmark.leftShoulder], points[landmark.rightShoulder])
    const ankle = midpoint(points[landmark.leftAnkle], points[landmark.rightAnkle])
    const inverted = frame.confidence >= 0.3 && ankle.y < shoulder.y && frame.verticalDeviation < 42
    const dt = this.previousTime === undefined ? 0 : Math.max(0, Math.min(0.5, time - this.previousTime))
    const holdFrame = inverted && frame.confidence >= 0.45 && pushFrame.elbowAngle >= 125
    if (holdFrame) {
      this.hold = this.previousHoldFrame ? this.hold + dt : dt
      this.longestHold = Math.max(this.longestHold, this.hold)
    } else {
      this.hold = 0
    }
    this.previousHoldFrame = holdFrame
    this.previousTime = time
    if (inverted && pushFrame.elbowAngle < 110) this.bending = true
    else if (inverted && this.bending && pushFrame.elbowAngle > 145) {
      this.reps += 1
      this.repConfidence.push(frame.confidence)
      this.bending = false
    }
    this.samples.push({
      time,
      confidence: frame.confidence,
      inverted,
      alignment: frame.alignment,
      elbowAngle: pushFrame.elbowAngle,
    })
    return this.live(frame.confidence)
  }

  report(): AnalysisReport {
    const confidence = average(this.samples.map((sample) => sample.confidence))
    const alignment = average(this.samples.filter((sample) => sample.inverted).map((sample) => sample.alignment))
    const observed = this.samples.filter((sample) => sample.confidence >= 0.45)
    const enoughEvidence = observed.length >= 12 && confidence >= 0.45
    const combo = this.comboReport()
    const criteria = [
      { name: 'Visible handstand alignment cue', score: Math.round(alignment), detail: 'Estimated from visible 2D shoulder, hip and ankle landmarks during inverted frames; this does not identify other skills.' },
      { name: 'Visible inverted hold cue', score: Math.round(alignment), detail: 'A rough alignment estimate; balance, depth, support contact and non-handstand holds are not verified.' },
      { name: 'Inverted elbow movement cue', score: Math.round(this.reps ? 70 : 0), detail: 'Counts require visible elbow flexion and extension while an inverted posture is tracked; they do not count pull-ups or other non-inverted skills.' },
      { name: 'Observable sequence cues', score: combo.sequenceFollowed === true ? 75 : 0, detail: 'Only handstand press, hold and inverted elbow cues can be compared automatically; other steps require manual timing and review.' },
    ]
    const issues = combo.segments.filter((segment) => !segment.detected || !segment.confirmed).map((segment) =>
      `${segment.name}: ${segment.feedback}`)
    return {
      score: null,
      confidence: Math.round(confidence * 100),
      insufficientConfidence: !enoughEvidence,
      framesAnalyzed: this.samples.length,
      validReps: this.reps,
      partialReps: this.bending ? 1 : 0,
      longestHold: this.longestHold,
      totalHold: this.samples.reduce((sum, sample, index) => {
        const next = this.samples[index + 1]
        return sum + (sample.inverted && next?.inverted ? Math.min(0.5, next.time - sample.time) : 0)
      }, 0),
      repConfidence: this.repConfidence,
      criteria,
      issues,
      positives: enoughEvidence ? ['Pose landmarks were visible for enough frames to estimate parts of the sequence.'] : ['No reliable sequence verdict is available from the visible pose evidence.'],
      suggestions: ['Review every estimated segment and confirm or adjust its timing in the timeline.'],
      timestampExamples: [],
      movementRange: 'not-assessable',
      limitations: [combo.note, 'Single-camera 2D pose landmarks do not independently identify exercise intent or reliably prove a press transition, wall contact, depth, or balance.'],
    }
  }

  comboReport(): ComboAnalysis {
    const valid = this.samples.filter((sample) => sample.confidence >= 0.45)
    const firstInverted = valid.findIndex((sample) => sample.inverted)
    const entryEndIndex = firstInverted < 0 ? -1 : valid.findIndex((sample, index) =>
      index >= firstInverted && sample.inverted && valid.slice(index, index + 6).length >= 6 && valid.slice(index, index + 6).every((candidate) => candidate.inverted))
    const entryStart = firstInverted > 0 ? valid[firstInverted - 1].time : 0
    const entryEnd = entryEndIndex >= 0 ? valid[entryEndIndex].time : firstInverted >= 0 ? valid[firstInverted].time : 0
    const firstBend = valid.find((sample) => sample.inverted && sample.elbowAngle < 110)
    const lastExtended = [...valid].reverse().find((sample) => sample.inverted && sample.elbowAngle > 145)
    const endTime = this.samples[this.samples.length - 1]?.time ?? 0
    const holds = valid.filter((sample) => sample.inverted && sample.elbowAngle >= 125)
    const holdStart = holds[0]?.time ?? entryEnd
    const holdEnd = firstBend?.time ?? holds[holds.length - 1]?.time ?? endTime
    const hasPress = firstInverted >= 0 && entryEndIndex >= 0
    const hasHold = holds.length >= 3
    const hasHspu = this.reps > 0 && firstBend !== undefined
    const expectedKinds = this.steps.map((step) => step.kind)
    const observedKinds = [
      ...(hasPress ? [{ kind: 'press' as const, time: entryStart }] : []),
      ...(hasHold ? [{ kind: 'hold' as const, time: holdStart }] : []),
      ...(hasHspu && firstBend ? [{ kind: 'hspu' as const, time: firstBend.time }] : []),
    ].sort((left, right) => left.time - right.time).map((event) => event.kind)
    let lastBoundary = 0
    const segments: ComboSegment[] = this.steps.map((step) => {
      const detected = step.kind === 'press' ? hasPress : step.kind === 'hold' ? hasHold : step.kind === 'hspu' ? hasHspu : false
      const start = step.kind === 'press' ? entryStart : step.kind === 'hold' ? Math.max(entryEnd, holdStart) : step.kind === 'hspu' ? firstBend?.time ?? endTime : lastBoundary
      const end = step.kind === 'press' ? entryEnd : step.kind === 'hold' ? Math.max(start, holdEnd) : step.kind === 'hspu' ? Math.max(start, lastExtended?.time ?? endTime) : start
      const boundedStart = Math.max(lastBoundary, Math.min(endTime, start))
      const boundedEnd = Math.max(boundedStart, Math.min(endTime, end))
      lastBoundary = boundedEnd
      const confidence: ComboSegment['confidence'] = detected ? 'estimated' : 'unconfirmed'
      const duration = Math.max(0, boundedEnd - boundedStart)
      const feedback = !detected
          ? step.kind === 'manual'
            ? 'This skill is not reliably identifiable by the current pose analyzer. Set the start and end times from the recording and confirm it manually.'
            : 'Pose cues were insufficient to identify this element; confirm it manually from the video.'
          : step.kind === 'press'
            ? 'An inverted posture was detected, but the camera cannot verify that it came from a controlled press.'
          : step.kind === 'hold'
              ? `An inverted interval of about ${duration.toFixed(1)}s was estimated against a ${step.holdSeconds}s target; review the body line and timing.`
              : `${this.reps} elbow flexion-extension cycle${this.reps === 1 ? '' : 's'} detected against ${step.repetitions} requested; verify the count and depth.`
      return {
        stepId: step.id,
        name: step.name,
        kind: step.kind,
        start: boundedStart,
        end: boundedEnd,
        repetitions: step.kind === 'hspu' ? this.reps : step.repetitions,
        targetRepetitions: step.repetitions,
        targetHoldSeconds: step.holdSeconds,
        description: step.description,
        detected,
        confirmed: false,
        confidence,
        feedback,
      }
    })
    return {
      segments,
      sequenceFollowed: observedKinds.length
        ? !expectedKinds.includes('manual') && expectedKinds.length === observedKinds.length && expectedKinds.every((kind, index) => observedKinds[index] === kind)
        : null,
      duration: endTime,
      note: 'Exercise identity and transitions are estimated from 2D pose landmarks. Press-to-handstand intent, balance, contact, exact repetition depth, and timing boundaries cannot be reliably established automatically. Confirm uncertain segments manually.',
    }
  }

  private live(confidence: number): LiveMetrics {
    return {
      confidence,
      validReps: this.reps,
      partialReps: this.bending ? 1 : 0,
      currentHold: this.hold,
      longestHold: this.longestHold,
      totalHold: this.samples.reduce((sum, sample, index) => {
        const next = this.samples[index + 1]
        return sum + (sample.inverted && next?.inverted ? Math.min(0.5, next.time - sample.time) : 0)
      }, 0),
    }
  }
}
