import { LUSCHIES_SKILL_ID } from '../types'
import type { AnalysisReport, LiveMetrics, PosePoint, Skill } from '../types'
import { bodyLine, landmark, midpoint } from './analyzers/common'
import { analyzeSkillFrame } from './analyzers'

const avg = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

interface Sample {
  time: number
  confidence: number
  alignment: number
  symmetry: number
  jointExtension: number
  elbowAngle: number
}

export class SkillAnalyzer {
  private readonly skill: Skill
  private readonly settings: { targetReps: number; measureHold: boolean; targetHold: number; focus: string; positionTolerance: number; smoothingStrength: number }
  private samples: Sample[] = []
  private validReps = 0
  private partialReps = 0
  private repConfidence: number[] = []
  private phase: 'ready' | 'lowered' | 'returning' | 'awaiting-bottom' = 'ready'
  private repStarted = 0
  private partialRepTimes: number[] = []
  private currentHold = 0
  private longestHold = 0
  private totalHold = 0
  private previousTime: number | undefined
  private countedLeftWrist: number | undefined
  private countedRightWrist: number | undefined
  private smoothedAlignment: number | undefined
  private luschiesPhase: 'waiting-for-kneeling' | 'started' | 'confirming-handstand' | 'holding' = 'waiting-for-kneeling'
  private luschiesStartTime: number | undefined
  private luschiesTransitionTime: number | undefined
  private luschiesHandstandTime: number | undefined
  private luschiesStartHipY: number | undefined
  private luschiesStartAnkleY: number | undefined
  private luschiesCandidateStart: number | undefined
  private luschiesCandidateFrames = 0
  private luschiesCandidateConfidence: number[] = []
  private luschiesCandidateAlignments: number[] = []
  private luschiesHoldAlignments: number[] = []

  constructor(
    skill: Skill,
    settings: { targetReps: number; measureHold: boolean; targetHold: number; focus: string; positionTolerance: number; smoothingStrength: number },
  ) {
    this.skill = skill
    this.settings = settings
  }

  consume(points: PosePoint[] | null, time: number): LiveMetrics {
    if (!points || points.length <= landmark.rightAnkle) {
      if (this.skill.id === LUSCHIES_SKILL_ID) {
        if (this.luschiesPhase === 'holding') this.luschiesPhase = 'waiting-for-kneeling'
        if (this.luschiesPhase === 'confirming-handstand') this.resetLuschiesCandidate()
        this.currentHold = 0
        this.previousTime = time
      }
      return this.live(0)
    }
    const frame = analyzeSkillFrame(this.skill, points)
    const { confidence, alignment, symmetry, jointExtension, kneeAngle } = frame
    if (confidence < 0.3 && this.skill.id !== LUSCHIES_SKILL_ID) {
      this.currentHold = 0
      this.previousTime = time
      return this.live(confidence)
    }
    if (confidence >= 0.3) {
      this.smoothedAlignment = this.smoothedAlignment === undefined
        ? alignment
        : this.smoothedAlignment * (this.settings.smoothingStrength / 100) + alignment * (1 - this.settings.smoothingStrength / 100)
    }
    const sample: Sample = { time, confidence, alignment, symmetry, jointExtension, elbowAngle: frame.elbowAngle }
    if (confidence >= 0.3) this.samples.push(sample)

    const dt = this.previousTime === undefined ? 0 : Math.max(0, Math.min(0.5, time - this.previousTime))
    this.previousTime = time
    if (this.skill.id === LUSCHIES_SKILL_ID) {
      this.updateLuschiesSkill(points, time, frame, dt)
      return this.live(confidence)
    }
    const isStatic = this.skill.type === 'static' || this.skill.type === 'combined'
    const scale = this.skill.category === 'front-lever' ? 2.7 : 2.4
    const minAlignment = 100 - Math.max(0, this.settings.positionTolerance - 8) * scale
    const isValidPosition = confidence >= 0.45 && (this.smoothedAlignment ?? alignment) >= minAlignment &&
      (this.skill.category !== 'front-lever' || kneeAngle >= (this.skill.id.includes('tuck') ? 40 : 125))
    if (this.settings.measureHold && isStatic) {
      if (isValidPosition) {
        this.currentHold += dt
        this.totalHold += dt
        this.longestHold = Math.max(this.longestHold, this.currentHold)
      } else {
        if (this.currentHold > 0.4 && this.currentHold < 1.5) {
          this.partialReps += 1
          this.partialRepTimes.push(time)
        }
        this.currentHold = 0
      }
    }
    if (this.skill.type === 'dynamic' && confidence >= 0.45) this.updateRepetition(frame, time, points)
    return this.live(confidence)
  }

  private updateRepetition(frame: ReturnType<typeof analyzeSkillFrame>, time: number, points: PosePoint[]) {
    const { elbowAngle, frontLine, verticalDeviation, hipAngle } = frame
    const isPress = this.skill.category === 'bent-arm-press'
    const isKickUp = this.skill.name === 'Handstand Kick-Up'
    const isFrontRaise = this.skill.name === 'Front Lever Raises'
    const isPullUp = this.skill.name.includes('Pull-Ups')
    const isHandstandWalk = this.skill.name === 'Handstand Walking'
    const elbowDriven = this.skill.category === 'handstand-push-up' || this.skill.category === 'push-up' || isPullUp
    const bottom = isPress ? hipAngle < 115 : isKickUp ? verticalDeviation > 30 : isFrontRaise ? frontLine > 55 : elbowDriven ? elbowAngle < 95 : elbowAngle < 100
    const top = isPress ? hipAngle > 150 : isKickUp ? verticalDeviation < 20 : isFrontRaise ? frontLine < 25 : elbowDriven ? elbowAngle > 150 : elbowAngle > 145
    if (isHandstandWalk) {
      const left = points[landmark.leftWrist]
      const right = points[landmark.rightWrist]
      const moved = (this.countedLeftWrist !== undefined && Math.abs(left.x - this.countedLeftWrist) > 0.06) ||
        (this.countedRightWrist !== undefined && Math.abs(right.x - this.countedRightWrist) > 0.06)
      if (this.countedLeftWrist === undefined || this.countedRightWrist === undefined) {
        this.countedLeftWrist = left.x
        this.countedRightWrist = right.x
      } else if (moved) {
        this.validReps += 1
        this.repConfidence.push(frame.confidence)
        this.countedLeftWrist = left.x
        this.countedRightWrist = right.x
      }
      return
    }
    const startsAtBottom = isPress || isKickUp
    const completeRep = () => {
      if (time - this.repStarted > 0.5) {
        this.validReps += 1
        this.repConfidence.push(frame.confidence)
      } else {
        this.partialReps += 1
        this.partialRepTimes.push(time)
      }
      this.phase = 'awaiting-bottom'
    }
    if (this.phase === 'awaiting-bottom' && bottom) {
      this.phase = startsAtBottom ? 'lowered' : 'returning'
      this.repStarted = time
    } else if (this.phase === 'ready' && (startsAtBottom ? bottom : top)) {
      this.phase = 'lowered'
      this.repStarted = time
    } else if (this.phase === 'lowered' && (startsAtBottom ? top : bottom) && time - this.repStarted > 0.25) {
      if (startsAtBottom) completeRep()
      else this.phase = 'returning'
    } else if (this.phase === 'returning' && top) {
      completeRep()
    }
    if ((this.phase === 'lowered' || this.phase === 'returning') && time - this.repStarted > 12) {
      this.partialReps += 1
      this.partialRepTimes.push(time)
      this.phase = 'awaiting-bottom'
    }
  }

  private updateLuschiesSkill(points: PosePoint[], time: number, frame: ReturnType<typeof analyzeSkillFrame>, dt: number) {
    const visible = (indices: number[]) => indices.every((index) => points[index].visibility >= 0.2)
    const p = landmark
    const kneelingVisible = visible([p.leftShoulder, p.rightShoulder, p.leftHip, p.rightHip, p.leftKnee, p.rightKnee])
    const handstandVisible = visible([p.leftShoulder, p.rightShoulder, p.leftElbow, p.rightElbow, p.leftWrist, p.rightWrist, p.leftAnkle, p.rightAnkle])
    const shoulders = midpoint(points[landmark.leftShoulder], points[landmark.rightShoulder])
    const hips = midpoint(points[landmark.leftHip], points[landmark.rightHip])
    const knees = midpoint(points[landmark.leftKnee], points[landmark.rightKnee])
    const ankles = midpoint(points[landmark.leftAnkle], points[landmark.rightAnkle])
    const body = bodyLine(points)
    const invertedDeviation = Math.abs(180 - body.verticalDeviation)
    const invertedAlignment = clamp(
      100 - Math.max(0, invertedDeviation - 8) * 2.4 - Math.max(0, body.hipOffset - 0.025) * 500,
    )
    const kneelingCue = kneelingVisible && hips.y > shoulders.y - 0.06 && knees.y > hips.y - 0.08 && frame.kneeAngle < 170
    const handstandCue = handstandVisible && ankles.y < shoulders.y - 0.025 && invertedDeviation < 55 && frame.elbowAngle >= 100

    if (this.luschiesPhase === 'waiting-for-kneeling' && kneelingCue) {
      this.luschiesPhase = 'started'
      this.luschiesStartTime ??= time
      this.luschiesStartHipY = hips.y
      this.luschiesStartAnkleY = ankles.y
      return
    }
    if (this.luschiesPhase === 'started') {
      const risesFromStart = this.luschiesStartHipY !== undefined && this.luschiesStartAnkleY !== undefined &&
        (hips.y < this.luschiesStartHipY - 0.04 || ankles.y < this.luschiesStartAnkleY - 0.04)
      if (risesFromStart) this.luschiesTransitionTime ??= time
      if (handstandCue) {
        this.luschiesTransitionTime ??= time
        this.luschiesPhase = 'confirming-handstand'
        this.luschiesCandidateStart = time
        this.luschiesCandidateFrames = 1
        this.luschiesCandidateConfidence = [frame.confidence]
        this.luschiesCandidateAlignments = [invertedAlignment]
        return
      }
    }
    if (this.luschiesPhase === 'confirming-handstand') {
      if (!handstandCue) {
        this.resetLuschiesCandidate()
        return
      }
      this.luschiesCandidateFrames += 1
      this.luschiesCandidateConfidence.push(frame.confidence)
      this.luschiesCandidateAlignments.push(invertedAlignment)
      if (this.luschiesCandidateFrames >= 6 && this.luschiesCandidateStart !== undefined && time - this.luschiesCandidateStart >= 0.35) {
        this.luschiesPhase = 'holding'
        this.luschiesHandstandTime ??= this.luschiesCandidateStart
        this.validReps += 1
        this.repConfidence.push(avg(this.luschiesCandidateConfidence))
        this.luschiesHoldAlignments.push(...this.luschiesCandidateAlignments)
        const confirmedHold = Math.max(0, time - this.luschiesCandidateStart)
        if (this.settings.measureHold) {
          this.currentHold = confirmedHold
          this.totalHold += confirmedHold
          this.longestHold = Math.max(this.longestHold, confirmedHold)
        }
      }
      return
    }
    if (this.luschiesPhase === 'holding') {
      if (!handstandCue) {
        this.luschiesPhase = 'waiting-for-kneeling'
        this.currentHold = 0
        return
      }
      if (this.settings.measureHold) {
        this.currentHold += dt
        this.totalHold += dt
        this.longestHold = Math.max(this.longestHold, this.currentHold)
      }
      this.luschiesHoldAlignments.push(invertedAlignment)
    }
  }

  private resetLuschiesCandidate() {
    this.luschiesPhase = 'started'
    this.luschiesCandidateStart = undefined
    this.luschiesCandidateFrames = 0
    this.luschiesCandidateConfidence = []
    this.luschiesCandidateAlignments = []
  }

  private live(confidence: number): LiveMetrics {
    return {
      confidence,
      validReps: this.validReps,
      partialReps: this.partialReps,
      currentHold: this.currentHold,
      longestHold: this.longestHold,
      totalHold: this.totalHold,
      ...(this.skill.id === LUSCHIES_SKILL_ID ? {
        phaseLabel: this.luschiesPhase === 'waiting-for-kneeling' ? 'Waiting for kneeling pose'
          : this.luschiesPhase === 'started' ? 'Kneeling detected · watching for rise'
            : this.luschiesPhase === 'confirming-handstand' ? 'Handstand cue · confirming'
              : 'Handstand confirmed',
      } : {}),
    }
  }

  report(): AnalysisReport {
    if (this.skill.id === LUSCHIES_SKILL_ID) return this.luschiesReport()
    const partialReps = this.partialReps + (this.phase === 'lowered' || this.phase === 'returning' ? 1 : 0)
    const confidence = avg(this.samples.map((sample) => sample.confidence))
    const alignment = avg(this.samples.map((sample) => sample.alignment))
    const symmetry = avg(this.samples.map((sample) => sample.symmetry))
    const elbowAngles = this.samples.map((sample) => sample.elbowAngle)
    const minimumElbowAngle = elbowAngles.reduce((minimum, angle) => Math.min(minimum, angle), 180)
    const maximumElbowAngle = elbowAngles.reduce((maximum, angle) => Math.max(maximum, angle), 0)
    const isPushUp = this.skill.category === 'push-up'
    const joint = isPushUp
      ? clamp(100 - Math.max(0, 165 - maximumElbowAngle) * 2)
      : avg(this.samples.map((sample) => sample.jointExtension))
    const enoughEvidence = this.samples.length >= 12 && confidence >= 0.45
    const measuresElbowRange = this.skill.category === 'push-up' || this.skill.category === 'handstand-push-up'
    const movementRange: AnalysisReport['movementRange'] = !measuresElbowRange
      ? 'not-applicable'
      : !enoughEvidence || elbowAngles.length === 0
        ? 'not-assessable'
        : maximumElbowAngle - minimumElbowAngle < 35
          ? 'limited'
          : maximumElbowAngle - minimumElbowAngle < 65
            ? 'partial'
            : 'broad'
    const alignmentVariance = avg(this.samples.map((sample) => (sample.alignment - alignment) ** 2))
    const stability = clamp(100 - Math.sqrt(alignmentVariance) * 2)
    const movement = this.skill.type === 'dynamic'
      ? clamp((this.validReps / this.settings.targetReps) * 100 - partialReps * 12)
      : this.settings.measureHold
        ? (clamp((this.longestHold / this.settings.targetHold) * 100) + stability) / 2
        : stability
    const criteria = [
      { name: isPushUp ? 'Body line & hip position' : 'Body alignment', score: Math.round(alignment), detail: isPushUp ? 'Estimated from the visible shoulder-to-ankle line in a side view.' : 'Estimated from 2D shoulder, hip and ankle landmarks.' },
      { name: isPushUp ? 'Elbow position' : 'Joint position', score: Math.round(joint), detail: 'Estimated joint extension; camera perspective affects angles.' },
      { name: isPushUp ? 'Visible elbow symmetry' : 'Control & stability', score: Math.round(symmetry), detail: isPushUp ? 'Compares left/right elbow angles; a side-on view may hide asymmetry.' : 'A rough proxy from visible left-right landmark consistency.' },
      { name: this.skill.type === 'dynamic' ? 'Movement completion' : 'Hold consistency', score: Math.round(movement), detail: this.skill.type === 'dynamic' ? 'Based on detected movement phases and the configured rep target.' : 'Combines frame-to-frame alignment stability and target-hold attainment.' },
    ]
    const weights = this.skill.category === 'push-up' ? [0.35, 0.2, 0.2, 0.25]
      : this.skill.category === 'front-lever' ? [0.45, 0.15, 0.2, 0.2]
      : this.skill.category === 'handstand' ? [0.4, 0.15, 0.3, 0.15]
        : this.skill.category === 'handstand-push-up' ? [0.15, 0.35, 0.2, 0.3]
          : [0.25, 0.2, 0.2, 0.35]
    const score = enoughEvidence
      ? Math.round(criteria.reduce((total, criterion, index) => total + criterion.score * weights[index], 0))
      : null
    const issues: string[] = []
    if (enoughEvidence && alignment < 65) issues.push(isPushUp
      ? 'The shoulder-to-ankle line changes or the hips appear to sag during the visible repetitions.'
      : this.skill.category === 'front-lever' ? 'Hips appear to drop below the shoulder-to-ankle line.' : 'Body line drifts from vertical during the analyzed frames.')
    if (enoughEvidence && joint < 65) issues.push(isPushUp ? 'The elbows do not consistently reach a visibly extended top position.' : 'Visible knee or elbow extension appears inconsistent.')
    if (enoughEvidence && symmetry < 65) issues.push(isPushUp
      ? 'The visible left and right elbow angles differ; confirm from a front-oblique camera view.'
      : 'Left and right side landmarks appear uneven; check camera angle and symmetry.')
    if (enoughEvidence && isPushUp && movementRange === 'limited') issues.push('Only a limited elbow-angle change was visible; the camera may not have captured the full push-up range.')
    if (partialReps > 0) issues.push(`${partialReps} movement phase${partialReps === 1 ? '' : 's'} did not meet the completion criteria.`)
    const positives = enoughEvidence
      ? [alignment >= 75 ? 'Good body-line alignment in the visible frames.' : 'A clear baseline is available for tracking body-line changes.', confidence >= 0.7 ? 'Landmark visibility was strong for most analyzed frames.' : 'Some pose landmarks were visible throughout the attempt.']
      : ['No reliable technique judgment was produced; improve framing and lighting before comparing results.']
    const suggestions = [
      alignment < 75 ? `Record from the recommended angle: ${this.skill.camera.toLowerCase()}` : `Keep practicing ${this.skill.name.toLowerCase()} with the same camera setup for comparable results.`,
      joint < 75 ? 'Prioritize a controlled range and pause briefly at the positions you want to own.' : 'Use a slower tempo to make technique changes easier to verify.',
      confidence < 0.65 ? 'Improve lighting and avoid covering joints with clothing or equipment.' :       `Focus on: ${(this.settings.focus || this.skill.checkpoints[0]).toLowerCase()}.`,
    ]
    const timestampExamples = issues.flatMap((issue) => {
      const sample = issue.toLowerCase().includes('body line') || issue.includes('Hips appear')
        ? this.samples.find((item) => item.alignment < 65)
        : issue.includes('knee or elbow')
          ? this.samples.find((item) => item.jointExtension < 65)
          : issue.includes('side landmarks')
            ? this.samples.find((item) => item.symmetry < 65)
            : undefined
      const time = sample?.time ?? (issue.includes('movement phase') ? this.partialRepTimes[0] ?? this.samples[this.samples.length - 1]?.time : undefined)
      return time === undefined ? [] : [{ time, issue }]
    })
    const limitations = [
      'The selected exercise name comes from your selection; this single-camera pose model does not independently identify or verify the exercise variation.',
      '2D landmarks cannot reliably measure depth, contact with a wall or floor, force, or rotation. Camera angle and occlusion affect feedback.',
      ...(isPushUp ? ['Hand spacing, foot elevation, claps, lateral travel, and true one-arm loading are not reliably classified. Rep counts use visible elbow-angle phases and can miss or miscount variations.'] : []),
      ...(!enoughEvidence ? ['There were too few confident pose frames to make a reliable technique assessment.'] : []),
    ]
    return {
      score,
      confidence: Math.round(confidence * 100),
      insufficientConfidence: !enoughEvidence,
      framesAnalyzed: this.samples.length,
      validReps: this.validReps,
      partialReps,
      longestHold: this.longestHold,
      totalHold: this.totalHold,
      repConfidence: this.repConfidence,
      criteria,
      issues,
      positives,
      suggestions,
      timestampExamples,
      movementRange,
      limitations,
    }
  }

  private luschiesReport(): AnalysisReport {
    const confidence = avg(this.samples.map((sample) => sample.confidence))
    const enoughEvidence = this.samples.length >= 12 && confidence >= 0.45
    const startTime = this.luschiesStartTime
    const transitionTime = this.luschiesTransitionTime
    const handstandTime = this.luschiesHandstandTime
    const startDetected = startTime !== undefined
    const entryDetected = handstandTime !== undefined
    const handstandAlignment = this.luschiesHoldAlignments.length
      ? avg(this.luschiesHoldAlignments)
      : 0
    const alignmentVariance = avg(this.luschiesHoldAlignments.map((value) => (value - handstandAlignment) ** 2))
    const stability = this.luschiesHoldAlignments.length >= 6
      ? clamp(100 - Math.sqrt(alignmentVariance) * 2)
      : 0
    const duration = startTime !== undefined && handstandTime !== undefined
      ? Math.max(0, handstandTime - startTime)
      : undefined
    const holdDetail = this.settings.measureHold
      ? `Estimated stable handstand interval: ${this.longestHold.toFixed(1)}s; target ${this.settings.targetHold}s.`
      : 'Hold measurement was disabled for this session.'
    const criteria = [
      {
        name: 'Kneeling-start cue',
        score: startDetected ? 100 : 0,
        detail: startTime !== undefined ? `A pose compatible with kneeling was observed at ${startTime.toFixed(1)}s; this does not verify floor contact.` : enoughEvidence ? 'No confident kneeling-start pose was identified.' : 'Not assessable because pose evidence was insufficient.',
      },
      {
        name: 'Upward-transition cue',
        score: transitionTime !== undefined ? 100 : 0,
        detail: transitionTime !== undefined ? `Visible hip or ankle landmarks began moving upward at about ${transitionTime.toFixed(1)}s; this does not establish how the movement was generated.` : startDetected ? 'No clear upward landmark change was detected after the kneeling-start cue.' : 'Not assessable without a kneeling-start cue.',
      },
      {
        name: 'Handstand-entry cue',
        score: entryDetected ? 100 : 0,
        detail: entryDetected && duration !== undefined ? `A sustained inverted pose followed after about ${duration.toFixed(1)}s; a controlled press cannot be distinguished from other entries.` : 'No sustained handstand posture was confidently identified after the start cue.',
      },
      {
        name: 'Final handstand alignment',
        score: Math.round(handstandAlignment),
        detail: this.luschiesHoldAlignments.length ? 'Estimated from visible 2D shoulder, hip and ankle landmarks while inverted.' : 'Not assessable without a sustained, visible handstand posture.',
      },
      {
        name: 'Final hold steadiness',
        score: Math.round(stability),
        detail: this.luschiesHoldAlignments.length >= 6 ? `${holdDetail} Stability is only a proxy from frame-to-frame 2D alignment variation; balance is not verified.` : 'Not enough sustained handstand frames to estimate steadiness.',
      },
    ]
    const issues: string[] = []
    if (!enoughEvidence) issues.push('There were too few confident pose frames to assess this attempt.')
    else if (!startDetected) issues.push('A kneeling-start cue was not detected; review the video and mark the phase manually if appropriate.')
    if (startDetected && !entryDetected) issues.push('The handstand finish was not confidently confirmed after the start cue.')
    const suggestions = [
      'Use a side view with the full body, hands and floor visible throughout the movement.',
      'Review the estimated start and handstand-entry cues against the recording; confirm ambiguous timing manually.',
    ]
    return {
      score: null,
      confidence: Math.round(confidence * 100),
      insufficientConfidence: !enoughEvidence,
      framesAnalyzed: this.samples.length,
      validReps: this.validReps,
      partialReps: this.luschiesPhase === 'started' || this.luschiesPhase === 'confirming-handstand' ? 1 : 0,
      longestHold: this.longestHold,
      totalHold: this.totalHold,
      repConfidence: this.repConfidence,
      criteria,
      issues,
      positives: entryDetected ? ['A kneeling-compatible start and sustained handstand pose were both observed.'] : ['No complete skill was inferred without confident start and finish cues.'],
      suggestions,
      timestampExamples: startTime !== undefined
        ? [{ time: startTime, issue: 'Kneeling-start cue' }]
        : [],
      movementRange: 'not-assessable',
      limitations: [
        'The camera detects a pose compatible with kneeling followed by a sustained inverted posture; it cannot verify the named skill or the exact movement path.',
        'A single 2D pose view cannot distinguish a controlled press from momentum, verify hand/floor contact, measure force, or prove balance.',
        'Hold duration and steadiness are estimates from visible pose landmarks and can be affected by occlusion, camera angle, and tracking gaps.',
        ...(!enoughEvidence ? ['There were too few confident pose frames to make a reliable assessment.'] : []),
      ],
    }
  }
}

export const formatTime = (seconds: number) => {
  const total = Math.floor(seconds)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
