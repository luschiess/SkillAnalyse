import type { AnalysisReport, ComboAnalysis, ComboSegment, ComboStep, LiveMetrics, PosePoint } from '../types'
import { analyzeHandstand } from './analyzers/handstand'
import { analyzeHandstandPushUp } from './analyzers/handstandPushUp'
import { analyzeFrontLever } from './analyzers/frontLever'
import { analyzePushUp } from './analyzers/pushUp'
import { landmark, midpoint } from './analyzers/common'

interface ComboSample {
  time: number
  confidence: number
  inverted: boolean
  kneeling: boolean
  elbowLever: boolean
  alignment: number
  elbowAngle: number
}

interface HoldInterval {
  start: number
  end: number
  frames: number
}

interface ElbowLeverTransition {
  start: number
  end: number
  holdSeconds: number
  confidence: number
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

export class ComboAnalyzer {
  private readonly steps: ComboStep[]
  private readonly hasLuschiesPress: boolean
  private samples: ComboSample[] = []
  private reps = 0
  private repTimes: number[] = []
  private repConfidence: number[] = []
  private bending = false
  private kneelingStartTime: number | undefined
  private pressCandidateStart: number | undefined
  private pressCandidateFrames = 0
  private pressEndTime: number | undefined
  private hold = 0
  private longestHold = 0
  private previousTime: number | undefined
  private previousHoldFrame = false
  private holdStartTime: number | undefined
  private holdIntervals: HoldInterval[] = []
  private holdIntervalFrames = 0

  constructor(steps: ComboStep[]) {
    this.steps = steps
    this.hasLuschiesPress = steps.some((step) => step.kind === 'press' && /luschie/i.test(step.name))
  }

  consume(points: PosePoint[] | null, time: number): LiveMetrics {
    if (!points || points.length <= landmark.rightAnkle) return this.live(0)
    const frame = analyzeHandstand(points)
    const pushFrame = analyzeHandstandPushUp(points)
    const pushUpFrame = analyzePushUp(points)
    const leverFrame = analyzeFrontLever(points)
    const shoulder = midpoint(points[landmark.leftShoulder], points[landmark.rightShoulder])
    const hip = midpoint(points[landmark.leftHip], points[landmark.rightHip])
    const knees = midpoint(points[landmark.leftKnee], points[landmark.rightKnee])
    const ankle = midpoint(points[landmark.leftAnkle], points[landmark.rightAnkle])
    const invertedDeviation = Math.abs(180 - frame.verticalDeviation)
    const inverted = frame.confidence >= 0.3 && ankle.y < shoulder.y && invertedDeviation < 42
    const elbowLever = frame.confidence >= 0.45 &&
      leverFrame.frontLine < 45 &&
      pushUpFrame.elbowAngle > 0 && pushUpFrame.elbowAngle < 150
    const kneeling = frame.confidence >= 0.3 &&
      [landmark.leftShoulder, landmark.rightShoulder, landmark.leftHip, landmark.rightHip, landmark.leftKnee, landmark.rightKnee]
        .every((index) => points[index].visibility >= 0.2) &&
      hip.y > shoulder.y - 0.06 && knees.y > hip.y - 0.08 && frame.kneeAngle < 170
    const dt = this.previousTime === undefined ? 0 : Math.max(0, Math.min(0.5, time - this.previousTime))
    if (this.hasLuschiesPress && this.kneelingStartTime === undefined && kneeling) this.kneelingStartTime = time
    const pressCanStart = !this.hasLuschiesPress || this.kneelingStartTime !== undefined
    if (pressCanStart && this.pressEndTime === undefined && inverted) {
      this.pressCandidateStart ??= time
      this.pressCandidateFrames += 1
      if (this.pressCandidateFrames >= 6 && this.pressCandidateStart !== undefined && time - this.pressCandidateStart >= 0.35) {
        this.pressEndTime = this.pressCandidateStart
      }
    } else if (!inverted) {
      this.pressCandidateStart = undefined
      this.pressCandidateFrames = 0
    }
    const holdFrame = inverted && frame.confidence >= 0.45
    if (holdFrame) {
      this.hold = this.previousHoldFrame ? this.hold + dt : dt
      this.longestHold = Math.max(this.longestHold, this.hold)
      if (!this.previousHoldFrame) {
        this.holdStartTime = time
        this.holdIntervalFrames = 1
      } else {
        this.holdIntervalFrames += 1
      }
    } else {
      if (this.previousHoldFrame && this.holdStartTime !== undefined && this.previousTime !== undefined) {
        this.holdIntervals.push({ start: this.holdStartTime, end: this.previousTime, frames: this.holdIntervalFrames })
      }
      this.holdStartTime = undefined
      this.holdIntervalFrames = 0
      this.hold = 0
    }
    this.previousHoldFrame = holdFrame
    this.previousTime = time
    const afterPress = !this.hasLuschiesPress || (this.pressEndTime !== undefined && time > this.pressEndTime)
    if (afterPress && inverted && pushFrame.elbowAngle < 110) this.bending = true
    else if (afterPress && inverted && this.bending && pushFrame.elbowAngle > 145) {
      this.reps += 1
      this.repTimes.push(time)
      this.repConfidence.push(frame.confidence)
      this.bending = false
    }
    this.samples.push({
      time,
      confidence: frame.confidence,
      inverted,
      kneeling,
      elbowLever,
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
      { name: 'Observable sequence cues', score: combo.sequenceFollowed === true ? 75 : 0, detail: 'Handstand entry, hold, inverted elbow cycles and Elbow Lever to Handstand transitions are estimated; other steps require manual timing and review.' },
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
    const elbowLeverTransitions = this.findElbowLeverTransitions()
    const plannedHold = this.steps.some((step) => step.kind === 'hold')
    const hasPressStep = this.steps.some((step) => step.kind === 'press')
    const hasHspuStep = this.steps.some((step) => step.kind === 'hspu')
    const postPressValid = this.hasLuschiesPress && this.pressEndTime !== undefined
      ? valid.filter((sample) => sample.time >= this.pressEndTime!)
      : valid
    const pressValid = this.hasLuschiesPress
      ? valid.filter((sample) => this.kneelingStartTime !== undefined && sample.time >= this.kneelingStartTime)
      : valid
    const firstInverted = pressValid.findIndex((sample) => sample.inverted)
    const entryEndIndex = firstInverted < 0 ? -1 : pressValid.findIndex((sample, index) =>
      index >= firstInverted && sample.inverted && pressValid.slice(index, index + 6).length >= 6 && pressValid.slice(index, index + 6).every((candidate) => candidate.inverted))
    const entryStart = this.hasLuschiesPress
      ? this.kneelingStartTime ?? 0
      : firstInverted > 0 ? pressValid[firstInverted - 1].time : 0
    const entryEnd = this.pressEndTime ?? (entryEndIndex >= 0 ? pressValid[entryEndIndex].time : firstInverted >= 0 ? pressValid[firstInverted].time : 0)
    const firstBend = postPressValid.find((sample) => sample.inverted && sample.elbowAngle < 110)
    const lastExtended = [...postPressValid].reverse().find((sample) => sample.inverted && sample.elbowAngle > 145)
    const endTime = this.samples[this.samples.length - 1]?.time ?? 0
    const holds = (this.hasLuschiesPress ? postPressValid : valid).filter((sample) => sample.inverted && sample.elbowAngle >= 125)
    const measuredHolds = this.hasLuschiesPress
      ? this.pressEndTime === undefined
        ? []
        : this.holdIntervals.filter((interval) => interval.start >= this.pressEndTime!)
      : [...this.holdIntervals]
    const lastSample = this.samples[this.samples.length - 1]
    if (this.holdStartTime !== undefined && lastSample && lastSample.time > this.holdStartTime) {
      measuredHolds.push({ start: this.holdStartTime, end: lastSample.time, frames: this.holdIntervalFrames })
    }
    const holdStart = holds[0]?.time ?? entryEnd
    const holdEnd = firstBend?.time ?? holds[holds.length - 1]?.time ?? endTime
    const hasPress = hasPressStep && firstInverted >= 0 && (this.hasLuschiesPress ? this.pressEndTime !== undefined : entryEndIndex >= 0)
    const hasHold = plannedHold && measuredHolds.some((interval) => interval.frames >= 3)
    const hasHspu = hasHspuStep && this.reps > 0 && firstBend !== undefined
    const pressStepCount = this.steps.filter((step) => step.kind === 'press').length
    const hspuStepCount = this.steps.filter((step) => step.kind === 'hspu').length
    const expectedKinds = this.steps.flatMap((step) =>
      Array.from({ length: step.kind === 'elbow-lever-to-handstand' ? step.repetitions : 1 }, () => step.kind),
    )
    const observedKinds = [
      ...elbowLeverTransitions.map((transition) => ({ kind: 'elbow-lever-to-handstand' as const, time: transition.start })),
      ...(hasPress ? [{ kind: 'press' as const, time: entryStart }] : []),
      ...(hasHold ? [{ kind: 'hold' as const, time: holdStart }] : []),
      ...(hasHspu && firstBend ? [{ kind: 'hspu' as const, time: firstBend.time }] : []),
    ].sort((left, right) => left.time - right.time).map((event) => event.kind)
    let lastBoundary = 0
    let holdIndex = 0
    let elbowLeverIndex = 0
    const segments: ComboSegment[] = this.steps.map((step) => {
      const holdInterval = step.kind === 'hold' ? measuredHolds[holdIndex++] : undefined
      const stepElbowLeverTransitions = step.kind === 'elbow-lever-to-handstand'
        ? elbowLeverTransitions.slice(elbowLeverIndex, elbowLeverIndex + Math.max(1, step.repetitions))
        : []
      if (step.kind === 'elbow-lever-to-handstand') elbowLeverIndex += stepElbowLeverTransitions.length
      const stepRepTimes = step.kind === 'hspu' && hspuStepCount === 1 ? this.repTimes : []
      const stepRepetitions = step.kind === 'hspu' ? stepRepTimes.length : step.repetitions
      const holdDetected = holdInterval !== undefined && holdInterval.frames >= 3
      const detected = step.kind === 'press' ? hasPress && pressStepCount === 1
        : step.kind === 'hold' ? holdDetected
          : step.kind === 'hspu' ? hasHspu && hspuStepCount === 1
            : step.kind === 'elbow-lever-to-handstand' ? stepElbowLeverTransitions.length > 0
              : false
      const start = step.kind === 'elbow-lever-to-handstand' ? stepElbowLeverTransitions[0]?.start ?? lastBoundary
        : step.kind === 'press' ? entryStart
        : step.kind === 'hold' ? holdInterval?.start ?? Math.max(entryEnd, holdStart)
          : step.kind === 'hspu' ? stepRepTimes[0] ?? firstBend?.time ?? endTime
            : lastBoundary
      const end = step.kind === 'elbow-lever-to-handstand' ? stepElbowLeverTransitions[stepElbowLeverTransitions.length - 1]?.end ?? start
        : step.kind === 'press' ? entryEnd
        : step.kind === 'hold' ? holdInterval?.end ?? Math.max(start, holdEnd)
          : step.kind === 'hspu' ? stepRepTimes[stepRepTimes.length - 1] ?? Math.max(start, lastExtended?.time ?? endTime)
            : start
      const boundedStart = Math.max(lastBoundary, Math.min(endTime, start))
      const boundedEnd = Math.max(boundedStart, Math.min(endTime, end))
      lastBoundary = boundedEnd
      const confidence: ComboSegment['confidence'] = detected ? 'estimated' : 'unconfirmed'
      const duration = Math.max(0, boundedEnd - boundedStart)
      const feedback = !detected
          ? step.kind === 'manual'
            ? 'This skill is not reliably identifiable by the current pose analyzer. Set the start and end times from the recording and confirm it manually.'
            : step.kind === 'elbow-lever-to-handstand'
              ? 'No confident bent-arm horizontal support followed by a sustained inverted pose was found within the analysis window. Review camera angle and visibility.'
            : step.kind === 'hspu' && hspuStepCount > 1
              ? 'Inverted elbow cycles were observed, but they cannot be reliably attributed between multiple handstand push-up steps. Review and count each step manually.'
            : step.kind === 'press' && pressStepCount > 1
              ? 'A press transition cue was observed, but it cannot be reliably attributed between multiple press steps. Review each step manually.'
            : 'Pose cues were insufficient to identify this element; confirm it manually from the video.'
          : step.kind === 'press'
            ? 'An inverted posture was detected, but the camera cannot verify that it came from a controlled press.'
          : step.kind === 'elbow-lever-to-handstand'
            ? 'A bent-arm horizontal support followed by a sustained inverted posture was estimated. The camera cannot verify elbow contact, a controlled press, or balance.'
          : step.kind === 'hold'
              ? `An inverted interval of about ${duration.toFixed(1)}s was estimated against a ${step.holdSeconds}s target; review the body line and timing.`
              : `${stepRepetitions} elbow flexion-extension cycle${stepRepetitions === 1 ? '' : 's'} detected against ${step.repetitions} requested; verify the count and depth.`
      return {
        stepId: step.id,
        name: step.name,
        kind: step.kind,
        start: boundedStart,
        end: boundedEnd,
        repetitions: step.kind === 'hspu' ? stepRepetitions
          : step.kind === 'elbow-lever-to-handstand' ? stepElbowLeverTransitions.length
            : step.repetitions,
        ...(step.kind === 'elbow-lever-to-handstand' && stepElbowLeverTransitions.length > 0
          ? { measuredHoldSeconds: stepElbowLeverTransitions.reduce((sum, transition) => sum + transition.holdSeconds, 0) }
          : {}),
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
      note: 'Exercise identity and transitions are estimated from 2D pose landmarks. The Elbow Lever to Handstand cue looks for bent-arm horizontal support followed by a sustained inverted posture within 8 seconds; it cannot verify elbow contact, controlled press intent, balance, or exact repetition depth. Other press intent, contact, and timing boundaries are also uncertain. Review intervals in the video.',
    }
  }

  private findElbowLeverTransitions(): ElbowLeverTransition[] {
    const collectIntervals = (matches: (sample: ComboSample) => boolean) => {
      const intervals: Array<{ start: number; end: number; frames: number; confidence: number }> = []
      let current: ComboSample[] = []
      const flush = () => {
        const first = current[0]
        const last = current[current.length - 1]
        if (first && last && current.length >= 6 && last.time - first.time >= 0.35) {
          intervals.push({
            start: first.time,
            end: last.time,
            frames: current.length,
            confidence: average(current.map((sample) => sample.confidence)),
          })
        }
        current = []
      }
      for (const sample of this.samples) {
        if (matches(sample) && sample.confidence >= 0.45) {
          if (current.length && sample.time - current[current.length - 1].time > 0.65) flush()
          current.push(sample)
        } else {
          flush()
        }
      }
      flush()
      return intervals
    }
    const supportIntervals = collectIntervals((sample) => sample.elbowLever)
    const invertedIntervals = collectIntervals((sample) => sample.inverted)
    const transitions: ElbowLeverTransition[] = []
    let nextInvertedIndex = 0
    for (const support of supportIntervals) {
      while (
        nextInvertedIndex < invertedIntervals.length &&
        invertedIntervals[nextInvertedIndex].start < support.end - 0.35
      ) {
        nextInvertedIndex += 1
      }
      const inverted = invertedIntervals[nextInvertedIndex]
      if (!inverted || inverted.start - support.end > 8) continue
      transitions.push({
        start: support.start,
        end: Math.max(support.end, inverted.start),
        holdSeconds: Math.max(0, inverted.end - Math.max(support.end, inverted.start)),
        confidence: Math.min(support.confidence, inverted.confidence),
      })
      nextInvertedIndex += 1
    }
    return transitions
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
