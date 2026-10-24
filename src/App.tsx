import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, Check, ChevronDown, CircleAlert, Clock3,
  Download, Dumbbell, History, Layers, Play, Plus, RotateCcw, Search, ShieldCheck, Smartphone, Sparkles,
  Square, Trash2, Upload, Video, X,
} from 'lucide-react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { categories, getSkill, skills } from './data/skills'
import { comboTemplates } from './data/combos'
import { ComboLibrary } from './components/ComboLibrary'
import { WorkoutPlanner } from './components/WorkoutPlanner'
import { formatTime, SkillAnalyzer } from './lib/analyzer'
import { ComboAnalyzer } from './lib/comboAnalyzer'
import { FreestyleAnalyzer } from './lib/freestyleAnalyzer'
import { translate, type Language } from './lib/language'
import { detectPose, loadPoseLandmarker } from './lib/pose'
import { clearSessions, deleteSession, listSessions, saveSession } from './lib/storage'
import { LUSCHIES_SKILL_ID } from './types'
import type { AnalysisReport, ComboStep, ComboStepKind, FreestyleSegment, FreestyleSkillKind, LiveMetrics, PosePoint, Skill, TrainingSession } from './types'
import './App.css'

type Screen = 'home' | 'select' | 'combos' | 'skill-detail' | 'session' | 'report' | 'history' | 'plan'
type MediaMode = 'camera' | 'upload'
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const initialMetrics: LiveMetrics = { confidence: 0, validReps: 0, partialReps: 0, currentHold: 0, longestHold: 0, totalHold: 0 }
const emptyReport = (): AnalysisReport => ({
  score: null, confidence: 0, insufficientConfidence: true, framesAnalyzed: 0, validReps: 0, partialReps: 0,
  longestHold: 0, totalHold: 0, repConfidence: [], criteria: [], issues: [], positives: [], suggestions: [], timestampExamples: [],
  movementRange: 'not-assessable', limitations: [],
})
const movementRangeLabels: Record<AnalysisReport['movementRange'], string> = {
  'not-applicable': 'Not assessed',
  'not-assessable': 'Insufficient evidence',
  limited: 'Limited visible change',
  partial: 'Partial visible change',
  broad: 'Broad visible change',
}
const movementRangeLabel = (range: AnalysisReport['movementRange'] | undefined) => range ? movementRangeLabels[range] : 'Not recorded'
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)
type GoalState = 'met' | 'not-met' | 'review'
interface GoalMetric {
  label: string
  actual: number
  target: number
  state: GoalState
  detail: string
  unit: 'reps' | 'seconds' | 'cue'
}
interface GoalCheck {
  label: string
  actual: number | null
  target: number | null
  state: GoalState
  detail: string
  unit: 'reps' | 'seconds' | 'cue'
  secondary?: GoalMetric
}
const goalStateFor = (actual: number, target: number, needsReview: boolean): GoalState =>
  needsReview ? 'review' : actual >= target ? 'met' : 'not-met'
const goalCheckState = (check: GoalCheck): GoalState => {
  if (check.state === 'review' || check.secondary?.state === 'review') return 'review'
  if (check.state === 'not-met' || check.secondary?.state === 'not-met') return 'not-met'
  return 'met'
}
const formatGoalValue = (value: number, unit: GoalCheck['unit']) =>
  unit === 'seconds' ? formatTime(value) : `${value}`
const goalStateLabel: Record<GoalState, string> = {
  met: 'Estimated target reached',
  'not-met': 'Not yet reached / not detected',
  review: 'Needs manual review',
}
function GoalResultCard({ check, language }: { check: GoalCheck; language: Language }) {
  const t = (value: string) => translate(value, language)
  const progress = check.actual !== null && check.target !== null && check.target > 0
    ? Math.min(100, check.actual / check.target * 100)
    : 0
  return (
    <div className={`goal-check goal-${goalCheckState(check)}`}>
      <div className="goal-check-heading"><strong>{t(check.label)}</strong><span>{t(goalStateLabel[goalCheckState(check)])}</span></div>
      <p>{t(check.detail)}</p>
      {check.actual !== null && check.target !== null && (
        <>
          <div className="goal-check-values"><b>{formatGoalValue(check.actual, check.unit)}</b><span>/ {formatGoalValue(check.target, check.unit)} {t(check.unit === 'seconds' ? 'target' : 'reps')}</span></div>
          <div className="goal-check-bar"><i style={{ width: `${progress}%` }} /></div>
        </>
      )}
      {check.secondary && <div className={`goal-check-secondary goal-${check.secondary.state}`}>
        <div><span>{t(check.secondary.label)}</span><small>{t(goalStateLabel[check.secondary.state])}</small></div>
        <strong>{formatGoalValue(check.secondary.actual, check.secondary.unit)} / {formatGoalValue(check.secondary.target, check.secondary.unit)} {t('target')}</strong>
      </div>}
    </div>
  )
}
function GoalResultInline({ check, language }: { check: GoalCheck; language: Language }) {
  const t = (value: string) => translate(value, language)
  return (
    <div className={`combo-step-goal goal-${goalCheckState(check)}`}>
      <span>{t(goalStateLabel[goalCheckState(check)])}</span>
      {check.actual !== null && check.target !== null && (
        <strong>{formatGoalValue(check.actual, check.unit)} / {formatGoalValue(check.target, check.unit)} {t(check.unit === 'seconds' ? 'target' : 'reps')}</strong>
      )}
      {check.secondary && <div className="combo-step-goal-secondary"><span>{t(check.secondary.label)} · {t(goalStateLabel[check.secondary.state])}</span><strong>{formatGoalValue(check.secondary.actual, check.secondary.unit)} / {formatGoalValue(check.secondary.target, check.secondary.unit)} {t('target')}</strong></div>}
    </div>
  )
}
const loadStringList = (key: string, description: string) => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new Error(`Stored ${description} must be a list of strings.`)
    }
    return parsed
  } catch (reason) {
    console.warn(`Could not load ${description}.`, reason)
    return []
  }
}
const navItems = [
  { id: 'home' as const, label: 'Overview', icon: Activity },
  { id: 'select' as const, label: 'Analyze skill', icon: Plus },
  { id: 'combos' as const, label: 'Combo builder', icon: Layers },
  { id: 'freestyle' as const, label: 'Freestyle', icon: Sparkles },
  { id: 'history' as const, label: 'Training log', icon: History },
  { id: 'plan' as const, label: 'Training plan', icon: Dumbbell },
]
const skeletonLinks = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]]
const comboKindNames: Record<ComboStepKind, string> = { press: 'Press-to-handstand', hold: 'Handstand hold', hspu: 'Handstand push-ups', 'elbow-lever-to-handstand': 'Elbow Lever to Handstand', manual: 'Manual review' }
const freestyleLabels: Array<{ kind: FreestyleSkillKind; label: string }> = [
  { kind: 'handstand', label: 'Handstand hold' },
  { kind: 'handstand-push-up', label: 'Handstand Push-up pattern' },
  { kind: 'luschies-skill', label: 'Luschiess Skill (estimated)' },
  { kind: 'front-lever', label: 'Front-lever pattern' },
  { kind: 'front-lever-raise', label: 'Front-lever raise (manual)' },
  { kind: 'push-up', label: 'Push-up pattern' },
  { kind: 'press-to-handstand', label: 'Press-to-handstand (manual)' },
  { kind: 'pull-up', label: 'Pull-up (manual)' },
  { kind: 'muscle-up', label: 'Muscle-up (manual)' },
  { kind: 'unknown', label: 'Unclassified / unknown' },
]
const freestyleLabelOptions = [...new Set([
  ...freestyleLabels.map((item) => item.label),
  ...skills.map((skill) => skill.name),
  ...comboTemplates.map((combo) => combo.name),
])]
const freestyleKindForLabel = (label: string): FreestyleSkillKind => {
  const knownLabel = freestyleLabels.find((item) => item.label === label)
  if (knownLabel) return knownLabel.kind
  const skill = skills.find((item) => item.name === label)
  if (!skill) return 'other-skill'
  if (skill.name === 'Elbow Lever to Handstand') return 'elbow-lever-to-handstand'
  if (skill.name === 'Elbow Lever') return 'elbow-lever'
  if (skill.id === LUSCHIES_SKILL_ID) return 'luschies-skill'
  if (skill.name === 'Front Lever Raises') return 'front-lever-raise'
  switch (skill.category) {
    case 'handstand':
      return 'handstand'
    case 'handstand-push-up':
      return 'handstand-push-up'
    case 'front-lever':
      return 'front-lever'
    case 'push-up':
      return 'push-up'
    default:
      return 'other-skill'
  }
}

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return window.localStorage.getItem('skillanalyse-language') === 'de' ? 'de' : 'en'
    } catch (reason) {
      console.warn('Could not load language preference.', reason)
      return 'en'
    }
  })
  const t = useCallback((value: string) => translate(value, language), [language])
  const locale = language === 'de' ? 'de-DE' : 'en-US'
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [category, setCategory] = useState<string>('all')
  const [difficulty, setDifficulty] = useState('all')
  const [equipment, setEquipment] = useState('all')
  const [skillSort, setSkillSort] = useState<'difficulty' | 'alphabetical'>('difficulty')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteSkills, setFavoriteSkills] = useState<string[]>(() => loadStringList('skillanalyse-favorite-skills', 'favorite skills'))
  const [recentSkillIds, setRecentSkillIds] = useState<string[]>(() => loadStringList('skillanalyse-recent-skills', 'recent skill IDs'))
  const [query, setQuery] = useState('')
  const [comboMode, setComboMode] = useState(false)
  const [comboName, setComboName] = useState('')
  const [comboSteps, setComboSteps] = useState<ComboStep[]>([])
  const [freestyleMode, setFreestyleMode] = useState(false)
  const [targetReps, setTargetReps] = useState(5)
  const [targetHold, setTargetHold] = useState(20)
  const [measureHold, setMeasureHold] = useState(true)
  const [positionTolerance, setPositionTolerance] = useState(25)
  const [smoothingStrength, setSmoothingStrength] = useState(65)
  const [focus, setFocus] = useState('')
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [activeSession, setActiveSession] = useState<TrainingSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')
  const [pwaError, setPwaError] = useState('')
  const [offlineReady, setOfflineReady] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [appInstalled, setAppInstalled] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment')
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [metrics, setMetrics] = useState<LiveMetrics>(initialMetrics)
  const [landmarks, setLandmarks] = useState<PosePoint[] | null>(null)
  const [poseVideoSize, setPoseVideoSize] = useState({ width: 0, height: 0 })
  const [mediaMode, setMediaMode] = useState<MediaMode>('camera')
  const [uploadedVideo, setUploadedVideo] = useState<Blob | null>(null)
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [selectedTimelineStep, setSelectedTimelineStep] = useState<string | null>(null)
  const [selectedFreestyleSegment, setSelectedFreestyleSegment] = useState<string | null>(null)
  const [historySkill, setHistorySkill] = useState('all')
  const [historyCategory, setHistoryCategory] = useState('all')
  const [historyPeriod, setHistoryPeriod] = useState('all')
  const [historyAnchor] = useState(() => Date.now())
  const [manualRepetitions, setManualRepetitions] = useState(0)
  const [manualHold, setManualHold] = useState(0)
  const [freestylePrompt, setFreestylePrompt] = useState('')

  useEffect(() => {
    document.documentElement.lang = language
    try {
      window.localStorage.setItem('skillanalyse-language', language)
    } catch (reason) {
      console.warn('Could not save language preference.', reason)
    }
  }, [language])

  useEffect(() => {
    try {
      window.localStorage.setItem('skillanalyse-favorite-skills', JSON.stringify(favoriteSkills))
    } catch (reason) {
      console.warn('Could not save favorite skills.', reason)
    }
  }, [favoriteSkills])

  const cameraRef = useRef<HTMLVideoElement>(null)
  const uploadRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const analyzerRef = useRef<SkillAnalyzer | null>(null)
  const comboAnalyzerRef = useRef<ComboAnalyzer | null>(null)
  const freestyleAnalyzerRef = useRef<FreestyleAnalyzer | null>(null)
  const reportVideoRef = useRef<HTMLVideoElement>(null)
  const analysisSetupRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastVideoTimeRef = useRef(-1)
  const pausedRef = useRef(false)
  const countdownTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const pausedAtRef = useRef<number | null>(null)
  const pausedDurationRef = useRef(0)
  const uploadedVideoMutedRef = useRef<boolean | null>(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onOfflineReady: () => setOfflineReady(true),
    onRegisterError: (reason: unknown) => {
      console.error('Service worker registration failed.', reason)
      setPwaError('Offline support could not be enabled. The app remains available online; check the secure HTTPS deployment.')
    },
  })

  useEffect(() => {
    const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    const syncInstalledState = () => setAppInstalled(isStandalone())
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const onAppInstalled = () => {
      setAppInstalled(true)
      setInstallPrompt(null)
      setShowInstallHelp(false)
    }

    syncInstalledState()
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  useEffect(() => {
    listSessions().then((saved) => setSessions(saved.sort((a, b) => b.date.localeCompare(a.date)))).catch((reason: unknown) => {
      console.error('Could not load local training history.', reason)
      setError('Training history could not be read from this browser.')
    })
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
    }
  }, [])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!recording || paused) return
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording, paused])

  const uploadedUrl = useMemo(() => uploadedVideo ? URL.createObjectURL(uploadedVideo) : '', [uploadedVideo])
  useEffect(() => () => { if (uploadedUrl) URL.revokeObjectURL(uploadedUrl) }, [uploadedUrl])

  const filteredSkills = useMemo(() => skills.filter((skill) =>
    (category === 'all' || skill.category === category) &&
    (difficulty === 'all' || (difficulty === 'beginner' ? skill.level <= 2 : difficulty === 'intermediate' ? skill.level === 3 : skill.level >= 4)) &&
    (equipment === 'all' || skill.equipment.includes(equipment)) &&
    (!favoritesOnly || favoriteSkills.includes(skill.id)) &&
    `${skill.name} ${skill.categoryName} ${t(skill.name)} ${t(skill.categoryName)}`.toLowerCase().includes(query.toLowerCase()),
  ).sort((left, right) => skillSort === 'alphabetical'
    ? t(left.name).localeCompare(t(right.name), language)
    : left.level - right.level || t(left.name).localeCompare(t(right.name), language)), [category, difficulty, equipment, favoritesOnly, favoriteSkills, query, skillSort, t, language])

  const localizeSkill = (skill: Skill): Skill => ({
    ...skill,
    name: t(skill.name),
    categoryName: t(skill.categoryName),
    description: t(skill.description),
    camera: t(skill.camera),
    checkpoints: skill.checkpoints.map(t),
    cues: skill.cues.map(t),
  })

  const recentSessions = sessions.slice(0, 4)
  const bestScore = sessions.reduce((best, session) => Math.max(best, session.report.score ?? 0), 0)
  const bestHold = sessions.reduce((best, session) => Math.max(best, session.report.longestHold), 0)
  const filteredHistory = sessions.filter((session) => {
    const days = historyPeriod === 'all' ? 0 : Number(historyPeriod)
    const inPeriod = days === 0 || historyAnchor - new Date(session.date).getTime() <= days * 24 * 60 * 60 * 1000
    return (historySkill === 'all' || session.skillId === historySkill) &&
      (historyCategory === 'all' || session.category === historyCategory) && inPeriod
  })
  const elbowLeverTransitionAnalysis = selectedSkill?.name === 'Elbow Lever to Handstand'
  const patternAnalysisMode = freestyleMode || elbowLeverTransitionAnalysis

  const chooseSkill = (skill: Skill) => {
    setSelectedSkill(skill)
    setFreestyleMode(false)
    setComboMode(false)
    setMeasureHold(skill.id === LUSCHIES_SKILL_ID || skill.type !== 'dynamic')
    if (skill.id === LUSCHIES_SKILL_ID) setTargetReps(1)
    setScreen('skill-detail')
    setError('')
    const recent = [skill.id, ...recentSkillIds.filter((id) => id !== skill.id)].slice(0, 8)
    setRecentSkillIds(recent)
    try {
      window.localStorage.setItem('skillanalyse-recent-skills', JSON.stringify(recent))
    } catch (reason) {
      console.warn('Could not save recently viewed skills.', reason)
    }
  }

  const toggleFavorite = (skillId: string) => setFavoriteSkills((previous) =>
    previous.includes(skillId) ? previous.filter((id) => id !== skillId) : [...previous, skillId],
  )

  const startSelectedSkillAnalysis = () => {
    if (!selectedSkill || selectedSkill.analysisSupport === 'manual') return
    setScreen('session')
  }

  const saveManualSkillLog = async () => {
    if (!selectedSkill || selectedSkill.analysisSupport !== 'manual') return
    const report: AnalysisReport = {
      ...emptyReport(),
      validReps: manualRepetitions,
      longestHold: manualHold,
      totalHold: manualHold,
      limitations: ['Manually logged by the athlete; no camera analysis or technique score was produced.'],
    }
    const session: TrainingSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      skillId: selectedSkill.id,
      skillName: selectedSkill.name,
      category: selectedSkill.category,
      report,
      settings: { targetReps, measureHold: true, targetHold, focus: '', positionTolerance, smoothingStrength },
    }
    setActiveSession(session)
    try {
      await saveSession(session)
      setSessions((previous) => [session, ...previous])
    } catch (reason) {
      console.error('Could not save manual skill log.', reason)
      setSessions((previous) => [session, ...previous])
      setError('The manual entry is visible but could not be saved to local storage.')
    }
    setScreen('report')
  }

  const stopInference = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    lastVideoTimeRef.current = -1
    setAnalysisRunning(false)
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
    if (cameraRef.current) cameraRef.current.srcObject = null
  }, [])

  const navigateTo = (destination: Screen) => {
    if (recording || analysisRunning || countdown > 0 || loading) {
      setError('Finish or stop the active analysis before leaving this screen.')
      return
    }
    stopInference()
    stopCamera()
    setScreen(destination)
  }

  const installApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp((visible) => !visible)
      return
    }
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') setAppInstalled(true)
      setInstallPrompt(null)
    } catch (reason) {
      console.error('App installation prompt failed.', reason)
      setPwaError('The browser could not open its install prompt. Use the browser menu to install this app.')
    }
  }

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not supported by this browser. Upload a video instead.')
      return
    }
    if (!window.isSecureContext) {
      setError('Camera access requires HTTPS or localhost. Open this app on a secure connection, or upload a video.')
      return
    }
    setLoading(true)
    setLoadingMessage('Requesting camera access…')
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraFacing(facing)
      setMediaMode('camera')
      setCameraActive(true)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50))
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream
        await cameraRef.current.play()
      }
    } catch (reason) {
      console.error('Camera initialization failed.', reason)
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in browser settings or upload a video.'
        : 'Could not start the camera. Check that another app is not using it, or upload a video instead.')
      setCameraActive(false)
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const ensurePoseModel = async () => {
    if (landmarkerRef.current) return landmarkerRef.current
    const landmarker = await loadPoseLandmarker(setLoadingMessage)
    landmarkerRef.current = landmarker
    return landmarker
  }

  const inferenceLoop = (video: HTMLVideoElement, time: () => number) => {
    stopInference()
    setPoseVideoSize({ width: video.videoWidth, height: video.videoHeight })
    setAnalysisRunning(true)
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      if (pausedRef.current || !landmarkerRef.current || (!analyzerRef.current && !comboAnalyzerRef.current && !freestyleAnalyzerRef.current) || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      if (video.currentTime === lastVideoTimeRef.current) return
      lastVideoTimeRef.current = video.currentTime
      try {
        const points = detectPose(landmarkerRef.current, video)
        setLandmarks(points)
        setMetrics(freestyleAnalyzerRef.current
          ? freestyleAnalyzerRef.current.consume(points, time())
          : comboAnalyzerRef.current
            ? comboAnalyzerRef.current.consume(points, time())
            : analyzerRef.current?.consume(points, time()) ?? initialMetrics)
      } catch (reason) {
        console.error('Pose inference failed.', reason)
        setError('Pose analysis stopped unexpectedly. You can still save this session without a technique score.')
        stopInference()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const createAndSaveSession = async (video?: Blob) => {
    const freestyle = freestyleAnalyzerRef.current?.analysis()
    const report = freestyleAnalyzerRef.current?.report() ?? comboAnalyzerRef.current?.report() ?? analyzerRef.current?.report() ?? emptyReport()
    const combo = comboAnalyzerRef.current?.comboReport()
    const session: TrainingSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      skillId: freestyleMode ? '' : selectedSkill?.id ?? '',
      skillName: freestyleMode ? 'Freestyle' : combo ? comboName || 'Handstand Combo' : selectedSkill?.name ?? 'Unknown skill',
      category: selectedSkill?.category ?? 'handstand',
      report,
      ...(combo ? { combo } : {}),
      ...(freestyle ? { freestyle } : {}),
      settings: { targetReps, measureHold, targetHold, focus, positionTolerance, smoothingStrength },
      ...(video ? { video } : {}),
    }
    setActiveSession(session)
    try {
      await saveSession(session)
      setSessions((previous) => [session, ...previous])
    } catch (reason) {
      console.error('Could not save training session locally.', reason)
      setSessions((previous) => [session, ...previous])
      setError('The report is ready, but browser storage could not save it. Your recording may exceed available local storage.')
    }
    stopInference()
    stopCamera()
    setRecording(false)
    setPaused(false)
    setCountdown(0)
    setScreen('report')
  }

  const beginRecording = async () => {
    if (analysisSetupRef.current) return
    if ((!selectedSkill && !freestyleMode) || !cameraRef.current || !cameraActive) {
      setError('Start the camera before recording.')
      return
    }
    analysisSetupRef.current = true
    setError('')
    setLoading(true)
    setLoadingMessage('Preparing pose analysis…')
    try {
      await ensurePoseModel()
      analyzerRef.current = selectedSkill ? new SkillAnalyzer(selectedSkill, { targetReps, measureHold, targetHold, focus, positionTolerance, smoothingStrength }) : null
      comboAnalyzerRef.current = comboMode ? new ComboAnalyzer(comboSteps) : null
      freestyleAnalyzerRef.current = patternAnalysisMode ? new FreestyleAnalyzer({ targetElbowLeverToHandstand: elbowLeverTransitionAnalysis }) : null
      setMetrics(initialMetrics)
      setElapsed(0)
      setLandmarks(null)
      setCountdown(3)
      let remaining = 3
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1
        setCountdown(Math.max(remaining, 0))
        if (remaining <= 0) {
          if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
          const stream = streamRef.current
          if (!stream || !cameraRef.current) {
            setError('The camera disconnected before recording began.')
            setCountdown(0)
            return
          }
          chunksRef.current = []
          if (typeof MediaRecorder !== 'undefined') {
            try {
              const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
              recorderRef.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
              recorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data)
              }
              recorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'video/webm' })
                void createAndSaveSession(blob.size > 0 ? blob : undefined)
              }
              recorderRef.current.start(500)
              setRecording(true)
            } catch (reason) {
              console.error('MediaRecorder failed to start.', reason)
              setError('Recording is not supported in this browser. You can still analyze the live camera feed, then stop to save the report.')
              setRecording(true)
            }
          } else {
            setError('This browser cannot save video recordings; live pose analysis is still available.')
            setRecording(true)
          }
          startedAtRef.current = performance.now()
          pausedAtRef.current = null
          pausedDurationRef.current = 0
          inferenceLoop(cameraRef.current, () => {
            const currentPause = pausedAtRef.current === null ? 0 : performance.now() - pausedAtRef.current
            return (performance.now() - startedAtRef.current - pausedDurationRef.current - currentPause) / 1000
          })
        }
      }, 1000)
    } catch (reason) {
      console.error('Pose model could not be initialized.', reason)
      setError(`Pose analysis could not initialize from the app's local assets. Check the deployed site's models/pose_landmarker_lite.task and mediapipe/wasm files. ${errorMessage(reason)}`)
      setCountdown(0)
    } finally {
      analysisSetupRef.current = false
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const pauseRecording = () => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.pause()
      pausedAtRef.current = performance.now()
      setPaused(true)
    } catch (reason) {
      console.error('Could not pause recording.', reason)
      setError('Recording could not be paused by this browser.')
    }
  }

  const resumeRecording = () => {
    try {
      if (recorderRef.current?.state === 'paused') recorderRef.current.resume()
      if (pausedAtRef.current !== null) pausedDurationRef.current += performance.now() - pausedAtRef.current
      pausedAtRef.current = null
      setPaused(false)
    } catch (reason) {
      console.error('Could not resume recording.', reason)
      setError('Recording could not be resumed by this browser.')
    }
  }

  const stopRecording = () => {
    stopInference()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    else void createAndSaveSession()
  }

  const selectVideo = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Choose a supported video file.')
      return
    }
    setError('')
    stopCamera()
    setMediaMode('upload')
    setUploadedVideo(file)
    setLandmarks(null)
    setPoseVideoSize({ width: 0, height: 0 })
    setMetrics(initialMetrics)
    analyzerRef.current = null
    comboAnalyzerRef.current = null
    freestyleAnalyzerRef.current = null
  }

  const analyzeUploadedVideo = async () => {
    if (analysisSetupRef.current) return
    const video = uploadRef.current
    if ((!selectedSkill && !freestyleMode) || !video || !uploadedVideo) return
    analysisSetupRef.current = true
    setError('')
    setLoading(true)
    setLoadingMessage('Preparing local pose analysis…')
    uploadedVideoMutedRef.current = video.muted
    video.muted = true
    try {
      await ensurePoseModel()
      analyzerRef.current = selectedSkill ? new SkillAnalyzer(selectedSkill, { targetReps, measureHold, targetHold, focus, positionTolerance, smoothingStrength }) : null
      comboAnalyzerRef.current = comboMode ? new ComboAnalyzer(comboSteps) : null
      freestyleAnalyzerRef.current = patternAnalysisMode ? new FreestyleAnalyzer({ targetElbowLeverToHandstand: elbowLeverTransitionAnalysis }) : null
      setMetrics(initialMetrics)
      setLandmarks(null)
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.currentTime > 0) video.currentTime = 0
      await video.play()
      inferenceLoop(video, () => video.currentTime)
    } catch (reason) {
      console.error('Uploaded video analysis failed.', reason)
      video.muted = uploadedVideoMutedRef.current
      uploadedVideoMutedRef.current = null
      setError(`Could not start pose analysis. Check that the video codec is supported and that the local pose assets loaded. ${errorMessage(reason)}`)
    } finally {
      analysisSetupRef.current = false
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const finishUploadedAnalysis = () => {
    if (!analyzerRef.current && !freestyleAnalyzerRef.current && !comboAnalyzerRef.current) return
    stopInference()
    const video = uploadRef.current
    video?.pause()
    if (video && uploadedVideoMutedRef.current !== null) video.muted = uploadedVideoMutedRef.current
    uploadedVideoMutedRef.current = null
    void createAndSaveSession(uploadedVideo ?? undefined)
  }

  const showHistory = () => setScreen('history')

  const removeSession = async (id: string) => {
    try {
      await deleteSession(id)
      setSessions((previous) => previous.filter((session) => session.id !== id))
      if (activeSession?.id === id) setActiveSession(null)
    } catch (reason) {
      console.error('Could not delete training session.', reason)
      setError('Could not delete this session from local storage.')
    }
  }

  const removeAllSessions = async () => {
    if (!window.confirm(t('Delete all locally stored training sessions and videos? This cannot be undone.'))) return
    try {
      await clearSessions()
      setSessions([])
      setActiveSession(null)
    } catch (reason) {
      console.error('Could not clear training history.', reason)
      setError('Could not clear local training history.')
    }
  }

  const resetWorkflow = () => {
    stopInference()
    stopCamera()
    setSelectedSkill(null)
    setFreestyleMode(false)
    setComboMode(false)
    setActiveSession(null)
    setUploadedVideo(null)
    setScreen('select')
    setError('')
  }

  const openSession = (session: TrainingSession) => {
    setActiveSession(session)
    setScreen('report')
  }

  const startComboCameraAnalysis = (name: string, steps: ComboStep[]) => {
    const handstandSkill = skills.find((skill) => skill.name === 'Handstand')
    if (!handstandSkill) {
      setError('The handstand analyzer is not available in the skill library.')
      return
    }
    if (!steps.length) return
    setError('')
    setComboSteps(steps)
    setComboName(name)
    setSelectedSkill(handstandSkill)
    setFreestyleMode(false)
    setComboMode(true)
    setUploadedVideo(null)
    setMediaMode('camera')
    setScreen('session')
  }

  const startFreestyle = (referenceName?: string) => {
    if (recording || analysisRunning || countdown > 0 || loading) {
      setError('Finish or stop the active analysis before starting Freestyle.')
      return
    }
    const baseSkill = skills.find((skill) => skill.name === 'Handstand')
    if (!baseSkill) {
      setError('The local pose analyzer is not available.')
      return
    }
    setSelectedSkill(baseSkill)
    setFreestyleMode(true)
    setFreestylePrompt(referenceName ?? '')
    setComboMode(false)
    setUploadedVideo(null)
    setMediaMode('camera')
    setMetrics(initialMetrics)
    setError('')
    setScreen('session')
  }

  const updateComboSegment = (stepId: string, changes: Partial<NonNullable<TrainingSession['combo']>['segments'][number]>) => {
    if (!activeSession?.combo) return
    const updated: TrainingSession = {
      ...activeSession,
      combo: {
        ...activeSession.combo,
        segments: activeSession.combo.segments.map((segment) => segment.stepId === stepId ? { ...segment, ...changes } : segment),
      },
    }
    setActiveSession(updated)
    setSessions((previous) => previous.map((session) => session.id === updated.id ? updated : session))
    void saveSession(updated).catch((reason: unknown) => {
      console.error('Could not save corrected combo timeline.', reason)
      setError('The timeline correction is visible but could not be saved to local storage.')
    })
  }

  const updateFreestyleSegment = (segmentId: string, changes: Partial<FreestyleSegment>) => {
    if (!activeSession?.freestyle) return
    const segments = activeSession.freestyle.segments.map((segment) => {
      if (segment.id !== segmentId) return segment
      const updated = { ...segment, ...changes }
      if (updated.kind === 'unknown') return { ...updated, repetitions: 0, partialRepetitions: 0, holdSeconds: 0, status: 'unclear' as const }
      const staticKind = updated.kind === 'handstand' || updated.kind === 'front-lever' ||
        updated.kind === 'luschies-skill' || updated.kind === 'elbow-lever'
      return staticKind && (changes.kind !== undefined || changes.start !== undefined || changes.end !== undefined)
        ? { ...updated, holdSeconds: Math.max(0, updated.end - updated.start) }
        : updated
    }).sort((left, right) => left.start - right.start)
    const totalHold = segments.reduce((sum, segment) => sum + segment.holdSeconds, 0)
    const longestHold = segments.reduce((longest, segment) => Math.max(longest, segment.holdSeconds), 0)
    const repetitions = segments.reduce((sum, segment) => sum + segment.repetitions, 0)
    const partialRepetitions = segments.reduce((sum, segment) => sum + segment.partialRepetitions, 0)
    const reliableRepetitions = segments.reduce((sum, segment) => sum + (segment.status === 'reliable' ? segment.repetitions : 0), 0)
    const updated: TrainingSession = {
      ...activeSession,
      freestyle: {
        ...activeSession.freestyle,
        segments,
        reliableRepetitions,
      },
      report: { ...activeSession.report, totalHold, longestHold, validReps: repetitions, partialReps: partialRepetitions },
    }
    setActiveSession(updated)
    setSessions((previous) => previous.map((session) => session.id === updated.id ? updated : session))
    void saveSession(updated).catch((reason: unknown) => {
      console.error('Could not save corrected freestyle timeline.', reason)
      setError('The timeline correction is visible but could not be saved to local storage.')
    })
  }

  const addFreestyleSegment = () => {
    if (!activeSession?.freestyle) return
    const start = 0
    const end = Math.min(activeSession.freestyle.duration, 1)
    const segment: FreestyleSegment = {
      id: crypto.randomUUID(),
      kind: 'unknown',
      name: 'Unclassified / unknown',
      start,
      end,
      repetitions: 0,
      partialRepetitions: 0,
      holdSeconds: 0,
      confidence: 0,
      status: 'unclear',
      alignment: null,
      feedback: 'Added manually. Review the recording and assign the correct label and boundaries.',
      confirmed: false,
    }
    const updated: TrainingSession = {
      ...activeSession,
      freestyle: { ...activeSession.freestyle, segments: [...activeSession.freestyle.segments, segment].sort((left, right) => left.start - right.start) },
    }
    setActiveSession(updated)
    setSessions((previous) => previous.map((session) => session.id === updated.id ? updated : session))
    setSelectedFreestyleSegment(segment.id)
    if (reportVideoRef.current) reportVideoRef.current.currentTime = start
    void saveSession(updated).catch((reason: unknown) => {
      console.error('Could not save manually added freestyle interval.', reason)
      setError('The new interval is visible but could not be saved to local storage.')
    })
  }

  const removeFreestyleSegment = (segmentId: string) => {
    if (!activeSession?.freestyle) return
    const segments = activeSession.freestyle.segments.filter((segment) => segment.id !== segmentId)
    const totalHold = segments.reduce((sum, segment) => sum + segment.holdSeconds, 0)
    const longestHold = segments.reduce((longest, segment) => Math.max(longest, segment.holdSeconds), 0)
    const validReps = segments.reduce((sum, segment) => sum + segment.repetitions, 0)
    const partialReps = segments.reduce((sum, segment) => sum + segment.partialRepetitions, 0)
    const reliableRepetitions = segments.reduce((sum, segment) => sum + (segment.status === 'reliable' ? segment.repetitions : 0), 0)
    const updated: TrainingSession = {
      ...activeSession,
      freestyle: { ...activeSession.freestyle, segments, reliableRepetitions },
      report: { ...activeSession.report, totalHold, longestHold, validReps, partialReps },
    }
    setActiveSession(updated)
    setSessions((previous) => previous.map((session) => session.id === updated.id ? updated : session))
    if (selectedFreestyleSegment === segmentId) setSelectedFreestyleSegment(null)
    void saveSession(updated).catch((reason: unknown) => {
      console.error('Could not save removed freestyle interval.', reason)
      setError('The interval was removed from this view but could not be saved to local storage.')
    })
  }

  const sessionVideo = activeSession?.video
  const videoUrl = useMemo(() => sessionVideo ? URL.createObjectURL(sessionVideo) : '', [sessionVideo])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])
  const poseVideoWidth = poseVideoSize.width || 1
  const poseVideoHeight = poseVideoSize.height || 1
  const activeSkill = activeSession ? getSkill(activeSession.skillId) : undefined
  const comboHasManualReview = comboSteps.some((step) => step.kind === 'manual')
  const activeFreestyle = activeSession?.freestyle
  const skillGoalChecks: GoalCheck[] = activeSession && activeSkill && !activeSession.combo
    ? (() => {
      const { report, settings } = activeSession
      const needsReview = report.insufficientConfidence
      if (activeSkill.id === 'floorwork-elbow-lever-to-handstand') {
        const transitions = activeFreestyle?.segments.filter((segment) => segment.kind === 'elbow-lever-to-handstand' && segment.status !== 'unclear') ?? []
        return [{
          label: 'Detected transitions',
          actual: transitions.length,
          target: settings.targetReps,
          state: goalStateFor(transitions.length, settings.targetReps, needsReview),
          detail: 'Counted from estimated transition intervals; review them in the timeline before treating the count as confirmed.',
          unit: 'reps',
        }]
      }
      const checks: GoalCheck[] = []
      if (activeSkill.type === 'dynamic') {
        checks.push({
          label: 'Completed repetitions',
          actual: report.validReps,
          target: settings.targetReps,
          state: goalStateFor(report.validReps, settings.targetReps, needsReview),
          detail: 'Compared with the repetition goal saved for this session.',
          unit: 'reps',
        })
      }
      if (settings.measureHold && (activeSkill.type !== 'dynamic' || activeSkill.id === LUSCHIES_SKILL_ID)) {
        checks.push({
          label: 'Longest measured hold',
          actual: report.longestHold,
          target: settings.targetHold,
          state: goalStateFor(report.longestHold, settings.targetHold, needsReview),
          detail: 'Camera-estimated hold duration; pose tracking cannot confirm balance or contact.',
          unit: 'seconds',
        })
      }
      return checks
    })()
    : []
  const activeCombo = activeSession?.combo
  const comboGoalChecks: GoalCheck[] = activeCombo
    ? [
      ...activeCombo.segments.map((segment): GoalCheck => {
        const repeatedType = activeCombo.segments.filter((candidate) => candidate.kind === segment.kind).length > 1
        const needsReview = (activeSession?.report.insufficientConfidence ?? true) || segment.kind === 'manual'
        if (segment.kind === 'manual') return {
          label: segment.name,
          actual: null,
          target: null,
          state: 'review',
          detail: 'This step needs manual review; the camera does not measure a target for it.',
          unit: 'reps',
        }
        if (repeatedType && (segment.kind === 'press' || segment.kind === 'hspu')) return {
          label: segment.name,
          actual: null,
          target: null,
          state: 'review',
          detail: 'Camera cues are aggregate across multiple steps of this type and cannot be assigned to this step. Review and count this step in the video.',
          unit: 'reps',
        }
        if (segment.kind === 'elbow-lever-to-handstand') {
          const repetitions = segment.detected ? segment.repetitions : 0
          const check: GoalCheck = {
            label: segment.name,
            actual: repetitions,
            target: segment.targetRepetitions,
            state: goalStateFor(repetitions, segment.targetRepetitions, needsReview || !segment.detected),
            detail: segment.detected
              ? 'Estimated bent-arm support to handstand transitions; elbow contact and press technique are not confirmed.'
              : 'No qualifying bent-arm support followed by a sustained handstand was detected.',
            unit: 'reps',
          }
          if (segment.targetHoldSeconds > 0) {
            const holdSeconds = segment.measuredHoldSeconds ?? 0
            check.secondary = {
              label: 'Terminal handstand hold',
              actual: holdSeconds,
              target: segment.targetHoldSeconds,
              state: goalStateFor(holdSeconds, segment.targetHoldSeconds, needsReview || !segment.detected),
              detail: 'Estimated continuous inverted posture following the transition; balance is not verified.',
              unit: 'seconds',
            }
          }
          return check
        }
        if (segment.kind === 'hspu') {
          const repetitions = segment.detected ? segment.repetitions : 0
          if (segment.targetRepetitions <= 0) return {
            label: segment.name,
            actual: null,
            target: null,
            state: 'review',
            detail: 'No repetition target was set for this step.',
            unit: 'reps',
          }
          return {
            label: segment.name,
            actual: repetitions,
            target: segment.targetRepetitions,
            state: goalStateFor(repetitions, segment.targetRepetitions, needsReview),
            detail: segment.detected ? 'Estimated completed inverted movement cycles allocated to this step in combo order.' : 'No reliable cycle was detected for this step.',
            unit: 'reps',
          }
        }
        if (segment.kind === 'hold') {
          if (segment.targetHoldSeconds <= 0) return {
            label: segment.name,
            actual: null,
            target: null,
            state: 'review',
            detail: 'No hold-time target was set for this step.',
            unit: 'seconds',
          }
          const duration = segment.detected ? Math.max(0, segment.end - segment.start) : 0
          return {
            label: segment.name,
            actual: duration,
            target: segment.targetHoldSeconds,
            state: goalStateFor(duration, segment.targetHoldSeconds, needsReview || !segment.detected),
            detail: 'Estimated hold interval allocated to this step in combo order; not proof of balance.',
            unit: 'seconds',
          }
        }
        if (segment.targetRepetitions <= 0) return {
          label: segment.name,
          actual: null,
          target: null,
          state: 'review',
          detail: 'No repetition target was set for this step.',
          unit: 'reps',
        }
        const hasSingleCue = segment.detected ? 1 : 0
        return {
          label: segment.name,
          actual: hasSingleCue,
          target: segment.targetRepetitions,
          state: goalStateFor(hasSingleCue, segment.targetRepetitions, needsReview),
          detail: segment.detected ? 'A transition cue was estimated; the camera cannot verify press technique.' : 'No transition cue was confidently detected.',
          unit: 'reps',
        }
      }),
    ]
    : []
  const comboStepGoalChecks = comboGoalChecks
  const reportLimitations = activeSession
    ? activeSession.report.limitations ?? ['This saved report predates detailed measurement limits. Treat 2D pose scores as estimates, not verified exercise recognition.']
    : []
  const recentSkillSessions = activeSession
    ? sessions.filter((session) => session.skillId !== '' && !session.combo && session.skillId === activeSession.skillId && session.id !== activeSession.id).slice(0, 3)
    : []

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigateTo('home')} aria-label={t('CaliTracker home')}>
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span>CALITRACKER</span>
        </button>
        <div className="sidebar-label">{t('WORKSPACE')}</div>
        <nav className="side-nav" aria-label={t('Main navigation')}>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${(id === 'freestyle' ? screen === 'session' && freestyleMode || screen === 'report' && Boolean(activeSession?.freestyle) : screen === id) ? 'active' : ''}`} onClick={() => id === 'freestyle' ? startFreestyle() : navigateTo(id)}>
              <Icon size={18} /><span>{t(label)}</span>
              {id === 'history' && sessions.length > 0 && <span className="nav-count">{sessions.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={17} />
            <div><strong>{t('Your data stays yours')}</strong><span>{t('Analysis runs on this device.')}</span></div>
          </div>
          <div className="profile-mini"><div className="avatar">A</div><div><strong>{t('Athlete')}</strong><span>{t('Personal workspace')}</span></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-area">
        <LocalizedContent language={language}>
        <header className="topbar">
          <div className="breadcrumb"><span>{t('TRAINING')}</span><span className="crumb-slash">/</span><strong>{t(freestyleMode && screen === 'session' ? 'Freestyle' : screen === 'home' ? 'Overview' : screen === 'select' || screen === 'skill-detail' ? 'Skill library' : screen === 'combos' ? 'Combo builder' : screen === 'session' ? 'New analysis' : screen === 'report' ? 'Session report' : screen === 'plan' ? 'Training plan' : 'Training log')}</strong></div>
          <div className="topbar-actions">
            <label className="language-switch"><span>{t('Language')}</span><select aria-label={t('Select language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="de">Deutsch</option></select></label>
            {!appInstalled && <button className="topbar-cta install-action" onClick={() => void installApp()} aria-label={t(installPrompt ? 'Install CaliTracker' : 'Show installation instructions')}><Download size={15} /><span>{t(installPrompt ? 'Install app' : 'Install')}</span></button>}
            <button className="topbar-cta" onClick={() => { setError(''); navigateTo('select') }} aria-label={t('New skill analysis')} title={t('New analysis')}><Plus size={16} /><span>{t('New analysis')}</span></button>
            <button className="topbar-cta" onClick={() => startFreestyle()} aria-label={t('Start Freestyle')} title={t('Freestyle')}><Sparkles size={15} /><span>{t('Freestyle')}</span></button>
          </div>
        </header>

        {showInstallHelp && !appInstalled && <div className="pwa-notice" role="status"><Smartphone size={17} /><span>{t('To install, open this site’s browser menu and choose “Install app” or “Add to Home screen”. Installation requires HTTPS.')}</span><button aria-label={t('Dismiss installation instructions')} onClick={() => setShowInstallHelp(false)}><X size={16} /></button></div>}
        {offlineReady && <div className="pwa-notice" role="status"><ShieldCheck size={17} /><span>{t('The app shell is available offline. Pose model files are cached after they are first loaded while online.')}</span><button aria-label={t('Dismiss offline status')} onClick={() => setOfflineReady(false)}><X size={16} /></button></div>}
        {needRefresh && <div className="pwa-notice" role="status"><RotateCcw size={17} /><span>{t('An app update is ready. Finish any active recording before updating.')}</span><button className="pwa-update" onClick={() => void updateServiceWorker(true)} disabled={recording || analysisRunning || countdown > 0 || loading}>{t('Update now')}</button><button aria-label={t('Dismiss update notice')} onClick={() => setNeedRefresh(false)}><X size={16} /></button></div>}
        {pwaError && <div className="global-alert" role="alert"><CircleAlert size={17} /><span>{t(pwaError)}</span><button aria-label={t('Dismiss offline support error')} onClick={() => setPwaError('')}><X size={16} /></button></div>}
        {error && <div className="global-alert" role="alert"><CircleAlert size={17} /><span>{t(error)}</span><button aria-label={t('Dismiss error')} onClick={() => setError('')}><X size={16} /></button></div>}

        {screen === 'home' && (
          <section className="page-content">
            <section className="panel hero-panel">
              <div>
                <div className="eyebrow">MOVEMENT ANALYSIS</div>
                <h1>Train with <em>clarity.</em></h1>
                <p className="lede">Choose a skill, record a set, and review the result without extra noise.</p>
              </div>
              <div className="welcome-actions">
                <button className="button-primary welcome-action" onClick={() => setScreen('select')}><Video size={17} /> Analyze now</button>
                <button className="button-secondary welcome-action" onClick={() => startFreestyle()}><Sparkles size={17} /> Freestyle</button>
              </div>
            </section>

            <div className="stat-grid">
              <StatCard label="Sessions logged" value={String(sessions.length).padStart(2, '0')} note="On this device" icon={<Dumbbell size={18} />} />
              <StatCard label="Best score" value={bestScore ? `${bestScore}` : '—'} suffix={bestScore ? '/ 100' : ''} note={bestScore ? 'Best recorded session' : 'No score yet'} icon={<Sparkles size={18} />} />
              <StatCard label="Longest hold" value={bestHold ? formatTime(bestHold) : '—'} note="Technique-qualified" icon={<Clock3 size={18} />} />
            </div>

            <div className="home-grid">
              <section className="panel progress-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">RECENT</div>
                    <h2>Last sessions</h2>
                  </div>
                  <button className="text-button" onClick={showHistory}>Open log <ArrowRight size={15} /></button>
                </div>
                {recentSessions.length ? (
                  <div className="session-list">
                    {recentSessions.map((session) => <SessionRow key={session.id} session={session} language={language} onClick={() => openSession(session)} />)}
                  </div>
                ) : (
                  <EmptyState title="Your training starts here" text="Run your first analysis to build a log." action="Choose a skill" onClick={() => setScreen('select')} />
                )}
              </section>

              <section className="panel">
                <div className="eyebrow">START</div>
                <h2>Quick actions</h2>
                <div className="camera-check-list">
                  <button className="quick-action-row" onClick={() => setScreen('select')}>
                    <span>Choose a skill</span>
                    <ArrowRight size={16} />
                  </button>
                  <button className="quick-action-row" onClick={() => startFreestyle()}>
                    <span>Freestyle</span>
                    <ArrowRight size={16} />
                  </button>
                  <button className="quick-action-row" onClick={() => setScreen('plan')}>
                    <span>Training plan</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </section>
            </div>
          </section>
        )}

        {screen === 'select' && (
          <section className="page-content">
            <div className="page-heading"><div><div className="eyebrow">BUILD YOUR SESSION</div><h1>Choose your <em>skill.</em></h1><p className="lede">Select a specific progression before recording. Each skill has its own movement checks.</p></div></div>
            <section className="combo-builder panel combo-builder-shortcut">
              <div className="panel-heading"><div><div className="eyebrow">{t('COMBO BUILDER')}</div><h2>{t('Build a flowing sequence')}</h2></div><button className="button-primary" onClick={() => navigateTo('combos')}><Layers size={15} /> {t('Open combo builder')}</button></div>
              <p className="combo-intro">{t('Create, organize and analyze your own combos in one place.')}</p>
            </section>
            <div className="library-tools"><label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills…" aria-label="Search skills" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}</label>
              <label className="difficulty-filter"><span>DIFFICULTY</span><select aria-label="Filter by difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">All levels</option><option value="beginner">Beginner · 1–2</option><option value="intermediate">Intermediate · 3</option><option value="advanced">Advanced · 4–5</option></select></label>
              <label className="difficulty-filter"><span>{t('EQUIPMENT')}</span><select aria-label={t('Filter by equipment')} value={equipment} onChange={(event) => setEquipment(event.target.value)}><option value="all">{t('All equipment')}</option>{[...new Set(skills.flatMap((skill) => skill.equipment))].sort().map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label>
              <label className="difficulty-filter"><span>{t('SORT')}</span><select aria-label={t('Sort skills')} value={skillSort} onChange={(event) => setSkillSort(event.target.value as 'difficulty' | 'alphabetical')}><option value="difficulty">{t('Difficulty')}</option><option value="alphabetical">{t('Alphabetical')}</option></select></label>
              <label className="favorite-filter"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> {t('Favorites only')}</label>
              <div className="category-pills">{categories.map((item) => <button key={item.id} className={category === item.id ? 'selected' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
            </div>
            {recentSkillIds.length > 0 && <div className="recent-skills"><strong>{t('Recently viewed')}</strong>{recentSkillIds.map((id) => getSkill(id)).filter((skill): skill is Skill => Boolean(skill)).map((skill) => <button key={skill.id} onClick={() => chooseSkill(skill)}>{t(skill.name)}</button>)}</div>}
            {categories.filter((item) => item.id !== 'all' && (category === 'all' || category === item.id)).map((item) => {
              const group = filteredSkills.filter((skill) => skill.category === item.id)
              if (!group.length) return null
              return <div className="skill-group" key={item.id}><div className="group-title"><span className="category-indicator" />{item.label}<span className="group-count">{String(group.length).padStart(2, '0')}</span></div><div className="skill-grid">
                {group.map((skill) => <SkillCard key={skill.id} skill={localizeSkill(skill)} language={language} favorite={favoriteSkills.includes(skill.id)} onFavorite={() => toggleFavorite(skill.id)} onChoose={() => chooseSkill(skill)} />)}
              </div></div>
            })}
            {filteredSkills.length === 0 && <EmptyState title="No matching skills" text="Try a different search term, category or difficulty." action="Clear filters" onClick={() => { setQuery(''); setCategory('all'); setDifficulty('all') }} />}
          </section>
        )}

        {screen === 'combos' && (
          <section className="page-content combo-builder-page">
            <div className="page-heading"><div><div className="eyebrow">{t('COMBO BUILDER')}</div><h1>{t('Build a flowing sequence')}</h1><p className="lede">{t('Create, organize and analyze your own combos in one place.')}</p></div></div>
            <ComboLibrary language={language} onFreestyle={startFreestyle} onAnalyzeCombo={startComboCameraAnalysis} />
          </section>
        )}

        {screen === 'skill-detail' && selectedSkill && (
          <section className="page-content skill-detail-page">
            <button className="back-link" onClick={() => setScreen('select')}>← {t('Skill library')}</button>
            <div className="skill-detail-heading"><div><div className="eyebrow">{t(selectedSkill.categoryName)} · {t('Level')} {selectedSkill.level}{selectedSkill.difficultyTag ? ` · ${t(selectedSkill.difficultyTag)}` : ''}</div><h1>{t(selectedSkill.name)}</h1><p className="lede">{t(selectedSkill.description)}</p></div><button className="icon-button" aria-label={favoriteSkills.includes(selectedSkill.id) ? t('Remove from favorites') : t('Add to favorites')} onClick={() => toggleFavorite(selectedSkill.id)}>{favoriteSkills.includes(selectedSkill.id) ? '★' : '☆'}</button></div>
            <div className="skill-detail-grid">
              <section className="panel skill-detail-panel"><div className="eyebrow">{t('PROGRESSION')}</div><div className="progression-chain">{selectedSkill.regressions.map((item) => <span key={item}>{t(item)}</span>)}<strong>{t(selectedSkill.name)}</strong>{selectedSkill.progressions.map((item) => <span key={item}>{t(item)}</span>)}</div><h3>{t('Prerequisites')}</h3><ul>{selectedSkill.prerequisites.map((item) => <li key={item}>{t(item)}</li>)}</ul><h3>{t('Related skills')}</h3><div className="related-skills">{selectedSkill.relatedSkillIds.map((id) => getSkill(id)).filter((skill): skill is Skill => Boolean(skill)).map((skill) => <button key={skill.id} onClick={() => chooseSkill(skill)}>{t(skill.name)} <ArrowRight size={14} /></button>)}</div></section>
              <section className="panel skill-detail-panel"><div className="eyebrow">{t('TECHNIQUE & SAFETY')}</div><h3>{t('Technique checkpoints')}</h3><ul>{selectedSkill.checkpoints.map((item) => <li key={item}>{t(item)}</li>)}</ul><h3>{t('Common errors')}</h3><ul>{selectedSkill.commonErrors.map((item) => <li key={item}>{t(item)}</li>)}</ul><h3>{t('Useful drills')}</h3><ul>{selectedSkill.drills.map((item) => <li key={item}>{t(item)}</li>)}</ul><h3>{t('Safety')}</h3><ul>{selectedSkill.safety.map((item) => <li key={item}>{t(item)}</li>)}</ul><p><strong>{t('Equipment')}:</strong> {selectedSkill.equipment.map(t).join(' · ')}</p></section>
            </div>
            <div className={`analysis-support support-${selectedSkill.analysisSupport}`}><strong>{t('Camera analysis')}: {t(selectedSkill.analysisSupport === 'automatic' ? 'Automatic analysis' : selectedSkill.analysisSupport === 'partial' ? 'Partially analyzable' : 'Manual documentation only')}</strong><span>{t(selectedSkill.analysisSupport === 'manual' ? 'The current pose model cannot reliably analyze this skill. Record reps and holds manually; no camera score or counts will be invented.' : 'Pose analysis is an estimate from visible 2D landmarks, not validated exercise recognition. Review the recording and treat results as approximate.')}</span></div>
            {selectedSkill.analysisSupport === 'manual' ? <section className="panel manual-skill-log"><h2>{t('Manual training log')}</h2><div className="manual-log-fields"><label>{t('Completed reps')}<input type="number" min="0" max="999" value={manualRepetitions} onChange={(event) => setManualRepetitions(Math.max(0, Number(event.target.value) || 0))} /></label><label>{t('Hold seconds')}<input type="number" min="0" max="3600" value={manualHold} onChange={(event) => setManualHold(Math.max(0, Number(event.target.value) || 0))} /></label><button className="button-primary" onClick={() => void saveManualSkillLog()}>{t('Save manual entry')}</button></div></section> : <button className="button-primary" onClick={startSelectedSkillAnalysis}><Video size={16} /> {t('Start camera analysis')}</button>}
          </section>
        )}

        {screen === 'session' && selectedSkill && (
          <section className="page-content session-page">
            <div className="page-heading compact-heading">            <div><button className="back-link" onClick={() => navigateTo(freestyleMode ? 'home' : 'select')}>← {freestyleMode ? 'Overview' : comboMode ? 'Combo editor' : 'Skill library'}</button><div className="eyebrow">{freestyleMode ? 'FREESTYLE · CONTINUOUS LOCAL POSE ANALYSIS' : comboMode ? t('COMBO · LOCAL POSE ANALYSIS') : `${selectedSkill.categoryName.toUpperCase()} · LEVEL ${selectedSkill.level}`}</div><h1>{freestyleMode ? 'Move freely' : comboMode ? 'Record your combo' : selectedSkill.name}</h1><p className="lede">{freestyleMode ? 'No exercise selection needed. Record a sequence and review only the pose patterns supported by the current model.' : comboMode ? t('Combo analysis estimates handstand entry, hold, push-up cycles and Elbow Lever to Handstand transitions; other skills need manual timeline review.') : selectedSkill.description}</p></div></div>
            <div className="session-layout">
              <div className="session-left">
                <div className="camera-stage">
                  {mediaMode === 'camera' ? <video ref={cameraRef} className="preview-video" autoPlay muted playsInline /> : <video ref={uploadRef} className="preview-video" src={uploadedUrl} controls playsInline onEnded={finishUploadedAnalysis} />}
                  <div className="camera-vignette" />
                  {landmarks && (cameraActive || analysisRunning) && <svg className="skeleton-overlay" viewBox={`0 0 ${poseVideoWidth} ${poseVideoHeight}`} preserveAspectRatio="xMidYMid meet" aria-label="Detected pose overlay">{skeletonLinks.map(([a, b]) => {
                    const pointA = landmarks[a]; const pointB = landmarks[b]
                    return pointA && pointB && pointA.visibility > 0.35 && pointB.visibility > 0.35 ? <line key={`${a}-${b}`} x1={pointA.x * poseVideoWidth} y1={pointA.y * poseVideoHeight} x2={pointB.x * poseVideoWidth} y2={pointB.y * poseVideoHeight} /> : null
                  })}{landmarks.map((point, index) => point.visibility > 0.45 ? <circle key={index} cx={point.x * poseVideoWidth} cy={point.y * poseVideoHeight} r={poseVideoWidth * .009} /> : null)}</svg>}
                  {!cameraActive && mediaMode === 'camera' && <div className="camera-placeholder"><div className="camera-placeholder-icon"><Video size={26} /></div><strong>Set up your camera</strong><span>Position your phone so your full body stays in frame.</span><button className="button-primary" onClick={() => void startCamera()} disabled={loading}><Video size={16} /> Enable camera</button></div>}
                  {mediaMode === 'upload' && !uploadedUrl && <div className="camera-placeholder"><div className="camera-placeholder-icon"><Upload size={26} /></div><strong>Choose a video</strong><span>MP4 and WebM are supported where your browser can decode them.</span><button className="button-primary" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Browse files</button></div>}
                  {cameraActive && <div className="camera-topline"><span><i className={recording ? 'recording-dot' : 'ready-dot'} />{recording ? paused ? 'PAUSED' : 'RECORDING' : analysisRunning ? 'ANALYZING' : 'CAMERA READY'}</span><span>{freestyleMode ? 'KEEP FULL BODY VISIBLE' : 'FULL BODY · SIDE VIEW'}</span></div>}
                  {countdown > 0 && <div className="countdown-overlay"><span>GET READY</span><strong>{countdown}</strong></div>}
                  {paused && <div className="paused-overlay"><span>RECORDING PAUSED</span></div>}
                  {recording && <div className="recording-clock"><span className="recording-dot" /> REC&nbsp; {formatTime(elapsed)}</div>}
                  {analysisRunning && <div className="live-metric-chip">{patternAnalysisMode ? <><span>POSE PATTERN · REPS</span><strong>{metrics.confidence < 0.45 ? 'UNCLEAR' : metrics.validReps}</strong></> : comboMode ? <><span>{t('HANDSTAND CUES · EST.')}</span><strong>{metrics.validReps} · {formatTime(metrics.currentHold)}</strong></> : selectedSkill.id === LUSCHIES_SKILL_ID ? <><span>{t('LUSCHIESS SKILL · PHASE')}</span><strong>{metrics.phaseLabel ? t(metrics.phaseLabel) : t('Waiting for kneeling pose')} · {metrics.validReps}/{targetReps} {t('reps')}</strong></> : selectedSkill.type === 'dynamic' ? <><span>REPS</span><strong>{metrics.validReps}</strong></> : <><span>HOLD</span><strong>{formatTime(metrics.currentHold)}</strong></>}</div>}
                </div>
                {analysisRunning && metrics.confidence < 0.3 && <div className="perspective-warning" role="status"><CircleAlert size={15} /><span>{patternAnalysisMode ? 'Too few visible body landmarks for useful movement-pattern analysis. Improve lighting and keep your full body in frame.' : `Pose landmarks are difficult to read. Adjust lighting and framing; recommended view: ${selectedSkill.camera}`}</span></div>}
                <div className="camera-controls">
                  {mediaMode === 'camera' ? <>
                    <button className="camera-switch" onClick={() => void startCamera(cameraFacing === 'environment' ? 'user' : 'environment')} disabled={!cameraActive || recording || loading}><RotateCcw size={16} /> Flip camera</button>
                    {!cameraActive ? <button className="button-primary" onClick={() => void startCamera()} disabled={loading}>{loading ? <><span className="spinner" />{loadingMessage}</> : <><Video size={16} /> Start camera</>}</button>
                      : !recording ? <button className="button-primary record-button" onClick={() => void beginRecording()} disabled={loading || countdown > 0}>{loading ? <><span className="spinner" />{loadingMessage || 'Loading model…'}</> : <><span className="record-dot" /> {freestyleMode ? 'Start Freestyle' : 'Record session'}</>}</button>
                        : <div className="record-buttons">{paused ? <button className="button-primary" onClick={resumeRecording}><Play size={15} /> Resume</button> : <button className="button-secondary" onClick={pauseRecording}><span className="pause-symbol" /> Pause</button>}<button className="button-danger" onClick={stopRecording}><Square size={14} fill="currentColor" /> {freestyleMode ? 'Stop Freestyle' : 'Finish'}</button></div>}
                    <button className="upload-inline" onClick={() => fileInputRef.current?.click()} disabled={recording || loading}><Upload size={16} /> Upload</button>
                  </> : <>
                    <button className="camera-switch" onClick={() => { setMediaMode('camera'); setUploadedVideo(null) }} disabled={loading || analysisRunning}><Video size={16} /> Use camera</button>
                    <button className="button-primary" onClick={() => analysisRunning ? finishUploadedAnalysis() : void analyzeUploadedVideo()} disabled={loading || !uploadedUrl}>{loading ? <><span className="spinner" />{loadingMessage}</> : analysisRunning ? <><Square size={14} fill="currentColor" /> Finish analysis</> : <><Activity size={16} /> Analyze video</>}</button>
                    <button className="upload-inline" onClick={() => fileInputRef.current?.click()} disabled={loading || analysisRunning}><Upload size={16} /> Replace</button>
                  </>}
                  <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={(event) => { selectVideo(event.target.files?.[0]); event.target.value = '' }} />
                </div>
                {analysisRunning && <div className="live-readout"><div><span>POSE CONFIDENCE</span><strong>{Math.round(metrics.confidence * 100)}%{patternAnalysisMode && metrics.confidence < 0.45 ? ' · LOW' : ''}</strong></div><div><span>{patternAnalysisMode ? 'VISIBLE REP PATTERNS' : comboMode || selectedSkill.type === 'dynamic' ? 'COMPLETED REPS' : 'LONGEST HOLD'}</span><strong>{patternAnalysisMode || comboMode || selectedSkill.type === 'dynamic' ? metrics.validReps : formatTime(metrics.longestHold)}</strong></div><div><span>{comboMode || patternAnalysisMode ? 'ESTIMATED HOLD TIME' : 'VALID HOLD TIME'}</span><strong>{formatTime(metrics.totalHold)}</strong></div></div>}
                <div className="camera-note"><ShieldCheck size={16} /><span>Video analysis runs locally on this device. No video is uploaded.</span></div>
              </div>
              <aside className="session-right">
                <section className="panel setup-panel"><div className="panel-heading"><div><div className="eyebrow">{freestyleMode ? 'FREESTYLE MODE' : comboMode ? 'COMBO ORDER' : elbowLeverTransitionAnalysis ? 'CAMERA-ASSISTED ANALYSIS' : 'SESSION SETUP'}</div><h2>{freestyleMode ? 'Automatic pattern scan' : comboMode ? 'Planned sequence' : elbowLeverTransitionAnalysis ? 'Elbow Lever to Handstand' : 'Make it yours'}</h2></div></div>
                  {patternAnalysisMode ? <>{freestyleMode ? <><p className="freestyle-description">Freestyle starts without selecting a skill or planned combo, so you can move through skills in any order. The local model estimates broad pose patterns; review and label any library skill or combo in the timeline.</p>{freestylePrompt && <p className="freestyle-reference"><strong>{t('Reference sequence only')}:</strong> {t(freestylePrompt)}. {t('Freestyle does not enforce this order.')}</p>}<ul className="freestyle-support-list"><li>Handstand holds and visible HSPU elbow cycles</li><li>{t('Kneeling-start to handstand pose sequence (estimated)')}</li><li>Elbow-lever-like support to handstand (estimated)</li><li>Horizontal front-lever-like body positions</li><li>Horizontal push-up patterns and elbow cycles</li></ul></> : <><p className="freestyle-description">The camera estimates a bent-arm horizontal support followed by an inverted position. It cannot confirm elbow contact or prove that the transition was a controlled press.</p><ul className="freestyle-support-list"><li>Keep your whole body, hands and elbows visible</li><li>Use a side or slightly angled view</li><li>Review the estimated interval and timing in the report</li></ul></>}<div className="disclaimer"><CircleAlert size={15} /><p>{freestyleMode ? 'All skill names and combo names are available for manual timeline labels; this does not make every movement automatically recognizable. Press intent, push-up variations, wall contact, pull-ups and muscle-ups are not reliably identifiable from these landmarks alone. Unclassified periods are labeled unknown, not guessed.' : 'This is an estimated 2D pose pattern, not validated recognition. Similar bent-arm transitions may look alike to the camera; confirm the interval against your video.'}</p></div></>
                    : comboMode ? <><p className="freestyle-reference">{comboName}</p><ol className="combo-session-order">{comboSteps.map((step) => <li key={step.id}><span>{t(comboKindNames[step.kind])}</span><strong>{step.name}</strong><small>{`${step.repetitions} rep${step.repetitions === 1 ? '' : 's'}${step.holdSeconds > 0 ? ` · ${step.holdSeconds}s hold` : ''}${step.description ? ` · ${step.description}` : ''}`}</small></li>)}</ol><div className="disclaimer"><CircleAlert size={15} /><p>{comboHasManualReview ? t('Handstand and Elbow Lever to Handstand cues are estimated automatically. Other elements remain available for manual timing and confirmation in the report.') : 'Automatic labels are estimates. The final timeline asks for confirmation where pose cues are ambiguous.'}</p></div></>
                    : <>
                  {selectedSkill.type === 'dynamic' && <div className="form-row"><label htmlFor="target-reps">Rep target</label><div className="number-control"><button onClick={() => setTargetReps(Math.max(1, targetReps - 1))} aria-label="Decrease rep target">−</button><input id="target-reps" type="number" min="1" max="50" value={targetReps} onChange={(event) => setTargetReps(Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /><button onClick={() => setTargetReps(Math.min(50, targetReps + 1))} aria-label="Increase rep target">+</button></div></div>}
                  {(selectedSkill.type !== 'dynamic' || selectedSkill.id === LUSCHIES_SKILL_ID) && <><label className="toggle-row"><span><strong>Measure valid holds</strong><small>Track only time in a qualified position</small></span><input type="checkbox" checked={measureHold} onChange={(event) => setMeasureHold(event.target.checked)} /><i /></label>
                    {measureHold && <div className="form-row"><label htmlFor="target-hold">Target hold</label><div className="number-control"><button onClick={() => setTargetHold(Math.max(5, targetHold - 5))}>−</button><input id="target-hold" type="number" min="5" max="300" step="5" value={targetHold} onChange={(event) => setTargetHold(Math.min(300, Math.max(5, Number(event.target.value) || 5)))} /><button onClick={() => setTargetHold(Math.min(300, targetHold + 5))}>+</button></div></div>}</>}
                  {selectedSkill.type !== 'dynamic' && <div className="sensitivity-control"><label htmlFor="position-tolerance">Hold position tolerance <b>±{positionTolerance}°</b></label><input id="position-tolerance" type="range" min="12" max="35" value={positionTolerance} onChange={(event) => setPositionTolerance(Number(event.target.value))} /><small>Higher tolerance accepts more position drift.</small><label htmlFor="smoothing-strength">Pose smoothing <b>{smoothingStrength}%</b></label><input id="smoothing-strength" type="range" min="45" max="85" value={smoothingStrength} onChange={(event) => setSmoothingStrength(Number(event.target.value))} /><small>Higher smoothing filters brief landmark noise.</small></div>}
                  <div className="form-field"><label htmlFor="focus">Technique focus <span>OPTIONAL</span></label><input id="focus" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="e.g. keep hips level" maxLength={70} /></div>
                  <div className="setup-divider" /><div className="checklist-heading"><span className="mini-check"><Check size={12} /></span><strong>Technique checkpoints</strong></div>
                  <ul className="checkpoint-list">{selectedSkill.checkpoints.map((checkpoint) => <li key={checkpoint}><span />{checkpoint}</li>)}</ul>
                  <div className="camera-position"><span className="camera-position-icon"><Video size={16} /></span><div><small>RECOMMENDED CAMERA</small><p>{selectedSkill.camera}</p></div></div>
                  </>}
                </section>
                <div className="disclaimer"><CircleAlert size={15} /><p>2D pose estimates are directional, not clinical measurements. Camera angle and occlusion can affect results.</p></div>
              </aside>
            </div>
          </section>
        )}

        {screen === 'report' && activeSession && (
          <section className="page-content report-page">
            <div className="report-top"><div><button className="back-link" onClick={showHistory}>← Training log</button><div className="eyebrow">SESSION COMPLETE · {new Date(activeSession.date).toLocaleDateString(locale, { dateStyle: 'medium' })}</div><h1>{activeSession.skillName}</h1><p className="lede">Your analysis is ready. Treat 2D estimates as training feedback, not a precise biomechanical measurement.</p>{activeSession.freestyle ? <p className="report-settings">{formatTime(activeSession.freestyle.duration)} duration · {activeSession.freestyle.segments.length} analyzed intervals · {activeSession.freestyle.reliableRepetitions} higher-confidence repetitions</p> : activeSession.combo ? <p className="report-settings">Sequence of {activeSession.combo.segments.length} planned steps · {formatTime(activeSession.combo.duration)} recording duration · local analysis</p> : <p className="report-settings">{activeSkill?.id === LUSCHIES_SKILL_ID ? `${activeSession.settings.targetReps} rep target · ${activeSession.settings.measureHold ? `${activeSession.settings.targetHold}s hold target` : 'hold timer off'} · kneeling-to-handstand cycles · 2D phase estimates` : `${activeSkill?.type === 'dynamic' ? `${activeSession.settings.targetReps} rep target · ` : ''}${activeSession.settings.measureHold ? `${activeSession.settings.targetHold}s hold target · ±${activeSession.settings.positionTolerance}° tolerance` : 'hold timer off'} · ${activeSession.settings.smoothingStrength}% smoothing`}{activeSession.settings.focus ? ` · Focus: ${activeSession.settings.focus}` : ''}</p>}</div><button className="button-primary" onClick={resetWorkflow}><RotateCcw size={16} /> Analyze again</button></div>
            <div className="analysis-context panel"><div><span className="eyebrow">{activeSession.freestyle ? activeSession.skillId ? 'AUTOMATIC TRANSITION SCAN · ESTIMATED' : 'AUTOMATIC FREESTYLE SCAN' : activeSession.combo ? 'COMBO SEQUENCE' : 'SELECTED EXERCISE'}</span><strong>{activeSession.skillName}</strong><small>{activeSession.freestyle ? activeSession.freestyle.note : activeSession.combo ? 'Each step is estimated from pose cues, not independently recognized.' : `${activeSkill?.categoryName ?? 'Calisthenics'} · Level ${activeSkill?.level ?? '—'} · Exercise identity is selected, not independently recognized by the camera.`}</small></div>{activeSkill && <p><Video size={15} /> Recommended view: {activeSkill.camera}</p>}</div>
            {activeSession.report.insufficientConfidence && <div className="confidence-alert"><CircleAlert size={18} /><div><strong>Not enough reliable pose evidence for a score</strong><span>Check lighting and framing. Recommended view: {activeSkill?.camera ?? 'keep the full body visible'}. No score was invented.</span></div></div>}
            {skillGoalChecks.length > 0 && <section className="goal-results panel">
              <div className="panel-heading"><div><div className="eyebrow">GOAL CHECK · CAMERA ESTIMATE</div><h2>Skill target</h2></div><span className="goal-summary">{skillGoalChecks.every((check) => check.state === 'met') ? 'Estimated target reached' : skillGoalChecks.some((check) => check.state === 'review') ? 'Evidence needs review' : 'Target not yet reached / detected'}</span></div>
              <div className="goal-check-grid">{skillGoalChecks.map((check) => <GoalResultCard key={check.label} check={check} language={language} />)}</div>
              <p className="goal-disclaimer">These are estimates from camera pose data, not proof of skill identity or technique quality. Review the video, especially when a target appears reached.</p>
            </section>}
            {activeSession.combo && comboGoalChecks.length > 0 && <section className="goal-results panel">
              <div className="panel-heading"><div><div className="eyebrow">GOAL CHECK · CAMERA ESTIMATE</div><h2>Combo goals by skill</h2></div><span className="goal-summary">{comboStepGoalChecks.filter((check) => goalCheckState(check) === 'met').length} {t('estimated reached')} · {comboStepGoalChecks.filter((check) => goalCheckState(check) === 'not-met').length} {t('not detected')} · {comboStepGoalChecks.filter((check) => goalCheckState(check) === 'review').length} {t('need review')}</span></div>
              <div className="goal-check-grid">{comboStepGoalChecks.map((check, index) => <GoalResultCard key={`${index}-${check.label}`} check={check} language={language} />)}</div>
              <p className="goal-disclaimer">A detected cue or duration is only an estimate. Manual steps and low-confidence results are not counted as confirmed goals.</p>
            </section>}
            <div className="report-summary">
              <div className="score-card panel"><div className="eyebrow">{activeSession.freestyle ? 'TECHNIQUE SCORE' : activeSession.combo ? 'VALIDATED SCORE' : 'TECHNIQUE SCORE'}</div><div className={`score-number ${activeSession.report.score === null ? 'no-score' : ''}`}>{activeSession.report.score ?? '—'}<small>{activeSession.report.score !== null && '/100'}</small></div><div className="score-caption">{activeSession.freestyle ? 'No overall score; inspect per-segment cues' : activeSession.combo ? 'No validated combo score is produced' : activeSkill?.id === LUSCHIES_SKILL_ID ? 'No validated technique score; review phase cues' : activeSession.report.score === null ? 'Insufficient confidence' : 'Estimated from visible pose frames'}</div><div className="score-bar"><i style={{ width: `${activeSession.report.score ?? 0}%` }} /></div><div className="score-foot"><span>POSE CONFIDENCE</span><strong>{activeSession.report.confidence}%</strong></div></div>
              <div className="result-metrics panel">
                {activeSession.freestyle ? <>
                  <Metric label="Higher-confidence reps" value={String(activeSession.freestyle.reliableRepetitions)} helper="Only completed cycles in higher-visibility intervals." icon={<Activity size={17} />} />
                  <Metric label="All estimated reps" value={String(activeSession.report.validReps)} helper={`Estimated partial phases · ${activeSession.report.partialReps}`} icon={<ArrowDownRight size={17} />} />
                  <Metric label="Measured hold time" value={formatTime(activeSession.report.totalHold)} helper="Estimated static-looking intervals, not proof of balance." icon={<Clock3 size={17} />} />
                  <Metric label="Analyzed pose frames" value={`${activeSession.freestyle.framesAnalyzed}`} helper={`${activeSession.freestyle.lowConfidenceFrames} frames had low or missing landmark confidence.`} icon={<ShieldCheck size={17} />} />
                </> : activeSession.combo ? <>
                  {activeSession.combo.segments.some((segment) => segment.kind === 'hspu') && <Metric label="Detected inverted elbow cycles" value={String(activeSession.report.validReps)} helper={`Handstand-only 2D cue; incomplete phase · ${activeSession.report.partialReps}`} icon={<Activity size={17} />} />}
                  <Metric label="Estimated inverted time" value={formatTime(activeSession.report.totalHold)} helper="Inverted pose interval; not proof of balance or a stationary hold." icon={<Clock3 size={17} />} />
                  <Metric label="Pose frames analyzed" value={String(activeSession.report.framesAnalyzed)} helper={`Mean landmark confidence · ${activeSession.report.confidence}%`} icon={<ShieldCheck size={17} />} />
                </> : activeSkill?.type === 'dynamic' ? <>
                  <Metric label="Detected repetitions" value={String(activeSession.report.validReps)} helper={`Incomplete phases · ${activeSession.report.partialReps}`} icon={<Activity size={17} />} />
                  {activeSkill.id === LUSCHIES_SKILL_ID && <Metric label="Estimated final handstand hold" value={formatTime(activeSession.report.longestHold)} helper={activeSession.settings.measureHold ? `Target · ${activeSession.settings.targetHold}s; pose steadiness is not proof of balance.` : 'Hold measurement was disabled for this session.'} icon={<Clock3 size={17} />} />}
                  {activeSession.report.movementRange !== 'not-applicable' && activeSkill?.id !== LUSCHIES_SKILL_ID && <Metric label="Observed elbow movement" value={movementRangeLabel(activeSession.report.movementRange)} helper="Approximate 2D angle change; not a physical range measurement." icon={<ArrowDownRight size={17} />} />}
                  <Metric label="Pose frames analyzed" value={String(activeSession.report.framesAnalyzed)} helper={`Mean landmark confidence · ${activeSession.report.confidence}%`} icon={<ShieldCheck size={17} />} />
                </> : <>
                  <Metric label="Longest valid hold" value={formatTime(activeSession.report.longestHold)} helper="Continuous qualified position" icon={<Clock3 size={17} />} />
                  <Metric label="Total valid hold" value={formatTime(activeSession.report.totalHold)} helper="Time in the estimated target position" icon={<ShieldCheck size={17} />} />
                  <Metric label="Pose frames analyzed" value={String(activeSession.report.framesAnalyzed)} helper={`Mean landmark confidence · ${activeSession.report.confidence}%`} icon={<Activity size={17} />} />
                </>}
              </div>
              {activeSession.video && videoUrl && <div className="report-video panel"><div className="panel-heading"><div><div className="eyebrow">SESSION RECORDING</div><h2>Review your movement</h2></div></div><video ref={reportVideoRef} controls playsInline src={videoUrl} /></div>}
            </div>
            {activeFreestyle && <section className="combo-timeline panel freestyle-timeline"><div className="panel-heading"><div><div className="eyebrow">{activeSession.skillId ? 'TRANSITION TIMELINE' : 'FREESTYLE TIMELINE'} · {formatTime(activeFreestyle.duration)}</div><h2>Detected patterns</h2></div><div className="freestyle-timeline-actions"><span className="combo-order-status">{activeFreestyle.framesAnalyzed < 12 ? 'Insufficient camera evidence' : `${activeFreestyle.segments.length} intervals · no overall score`}</span><button className="button-secondary" onClick={addFreestyleSegment}><Plus size={14} /> Add interval</button></div></div>
            <datalist id="freestyle-label-options">{freestyleLabelOptions.map((label) => <option key={label} value={label} />)}</datalist>
              {activeFreestyle.framesAnalyzed < 12 && activeFreestyle.segments.length === 0 && <p className="combo-intro">The camera did not provide enough confident pose frames. The timeline is intentionally empty rather than guessing skills.</p>}
              {(activeFreestyle.framesAnalyzed >= 12 || activeFreestyle.segments.length > 0) && <><p className="combo-intro">{activeFreestyle.framesAnalyzed < 12 ? 'Only a few clear intervals were found; treat them as unconfirmed and review manually. ' : ''}{activeFreestyle.note}</p>{activeFreestyle.segments.length === 0 && <p className="combo-intro">No supported movement pattern was found in this recording. This does not mean no exercise occurred; review the video or add an interval manually.</p>}<div className="timeline-track" aria-label="Freestyle movement timeline">{activeFreestyle.segments.map((segment, index) => <button key={segment.id} className={`timeline-block ${segment.status === 'unclear' ? 'uncertain' : 'detected'} ${selectedFreestyleSegment === segment.id ? 'active' : ''}`} style={{ left: `${activeFreestyle.duration ? segment.start / activeFreestyle.duration * 100 : 0}%`, width: `${activeFreestyle.duration ? Math.max(1, (segment.end - segment.start) / activeFreestyle.duration * 100) : 1}%` }} onClick={() => { setSelectedFreestyleSegment(segment.id); if (reportVideoRef.current) reportVideoRef.current.currentTime = segment.start }} title={`${segment.name}: ${formatTime(segment.start)}–${formatTime(segment.end)}`}>{index + 1}</button>)}</div>
                <div className="timeline-legend"><span><i className="timeline-key detected" />Pose pattern estimate</span><span><i className="timeline-key uncertain" />Unknown / uncertain</span><span>Click a segment to seek the recording</span></div>
                <div className="timeline-segments">{activeFreestyle.segments.map((segment, index) => <div className={`timeline-segment ${selectedFreestyleSegment === segment.id ? 'selected' : ''}`} key={segment.id}>
                  <div className="timeline-segment-heading"><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{segment.name}</strong><small>{segment.confirmed ? 'Manually confirmed' : `${segment.status === 'reliable' ? 'Higher-confidence pattern' : segment.status === 'unclear' ? 'Unclear pattern' : 'Estimated pattern'} · ${Math.round(segment.confidence)}% pose visibility`}</small></div><button className="button-secondary" onClick={() => { setSelectedFreestyleSegment(segment.id); if (reportVideoRef.current) reportVideoRef.current.currentTime = segment.start }}>View</button><button className="icon-button destructive" aria-label={`Remove ${segment.name} from timeline`} onClick={() => removeFreestyleSegment(segment.id)}><Trash2 size={14} /></button></div>
                  <p>{segment.feedback}{segment.alignment === null ? '' : ` Estimated alignment signal: ${segment.alignment}/100 (not a technique score).`}</p>
                  <div className="timeline-edit"><label>Skill or combo label<input list="freestyle-label-options" maxLength={100} value={segment.name} onChange={(event) => { const name = event.target.value; updateFreestyleSegment(segment.id, { kind: name ? freestyleKindForLabel(name) : 'unknown', name, confirmed: true }) }} /></label><label>Start (sec)<input type="number" min="0" max={activeFreestyle.duration} step="0.1" value={segment.start.toFixed(1)} onChange={(event) => updateFreestyleSegment(segment.id, { start: Math.min(segment.end, Math.max(0, Number(event.target.value) || 0)), confirmed: true })} /></label><label>End (sec)<input type="number" min={segment.start} max={activeFreestyle.duration} step="0.1" value={segment.end.toFixed(1)} onChange={(event) => updateFreestyleSegment(segment.id, { end: Math.min(activeFreestyle.duration, Math.max(segment.start, Number(event.target.value) || 0)), confirmed: true })} /></label><label>Reps<input type="number" min="0" max="99" value={segment.repetitions} onChange={(event) => updateFreestyleSegment(segment.id, { repetitions: Math.max(0, Math.min(99, Number(event.target.value) || 0)), confirmed: true })} /></label><label>Hold (sec)<input type="number" min="0" max={activeFreestyle.duration} step="0.1" value={segment.holdSeconds.toFixed(1)} onChange={(event) => updateFreestyleSegment(segment.id, { holdSeconds: Math.max(0, Number(event.target.value) || 0), confirmed: true })} /></label><label className="timeline-confirm"><input type="checkbox" checked={segment.confirmed} onChange={(event) => updateFreestyleSegment(segment.id, { confirmed: event.target.checked })} /> Confirmed</label></div>
                  <small className="freestyle-segment-stats">{segment.repetitions ? `${segment.repetitions} repetitions · ` : ''}{segment.partialRepetitions ? `${segment.partialRepetitions} partial · ` : ''}{segment.holdSeconds > 0 ? `${formatTime(segment.holdSeconds)} estimated hold` : 'no static hold measured'}</small>
                </div>)}</div></>}
            </section>}
            {activeSession.combo && <section className="combo-timeline panel">            <div className="panel-heading"><div><div className="eyebrow">COMBO TIMELINE · {formatTime(activeSession.combo.duration)}</div><h2>Your combo, step by step</h2></div><span className="combo-order-status">{activeSession.combo.sequenceFollowed === null ? 'Order not verifiable' : activeSession.combo.sequenceFollowed ? 'Estimated order matches' : 'Order differs or is incomplete'}</span></div>
              <p className="combo-intro">{activeSession.combo.note}</p>
              <div className="timeline-track" aria-label="Detected combo timeline">{activeSession.combo.segments.map((segment, index) => <button key={segment.stepId} className={`timeline-block ${segment.detected ? 'detected' : 'uncertain'} ${selectedTimelineStep === segment.stepId ? 'active' : ''}`} style={{ left: `${activeSession.combo?.duration ? segment.start / activeSession.combo.duration * 100 : 0}%`, width: `${activeSession.combo?.duration ? Math.max(1, (segment.end - segment.start) / activeSession.combo.duration * 100) : 1}%` }} onClick={() => { setSelectedTimelineStep(segment.stepId); if (reportVideoRef.current) reportVideoRef.current.currentTime = segment.start }} title={`${segment.name}: ${formatTime(segment.start)}–${formatTime(segment.end)}`}>{index + 1}</button>)}</div>
              <div className="timeline-legend"><span><i className="timeline-key detected" />Estimated pose cue</span><span><i className="timeline-key uncertain" />Unconfirmed / not detected</span><span>Click a segment to seek the recording</span></div>
              <div className="timeline-segments">{activeSession.combo.segments.map((segment, index) => <div className={`timeline-segment ${selectedTimelineStep === segment.stepId ? 'selected' : ''}`} key={segment.stepId}>
                <div className="timeline-segment-heading"><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{segment.name}</strong><small>{segment.confirmed ? 'Manually confirmed' : segment.detected ? `Estimated · ${segment.kind === 'hspu' ? `${segment.repetitions}/${segment.targetRepetitions} cycles` : `${formatTime(Math.max(0, segment.end - segment.start))} segment`}` : 'Unclear · manual confirmation needed'}</small></div><button className="button-secondary" onClick={() => { setSelectedTimelineStep(segment.stepId); if (reportVideoRef.current) reportVideoRef.current.currentTime = segment.start }}>View</button></div>
                <p>{segment.description && <><strong>{segment.description} </strong></>}{segment.feedback}</p>
                {comboStepGoalChecks[index] && <GoalResultInline check={comboStepGoalChecks[index]} language={language} />}
                <div className="timeline-edit"><label>Start (sec)<input type="number" min="0" max={activeSession.combo?.duration ?? 0} step="0.1" value={segment.start.toFixed(1)} onChange={(event) => updateComboSegment(segment.stepId, { start: Math.min(segment.end, Math.max(0, Number(event.target.value) || 0)), confirmed: true })} /></label><label>End (sec)<input type="number" min={segment.start} max={activeSession.combo?.duration ?? 0} step="0.1" value={segment.end.toFixed(1)} onChange={(event) => updateComboSegment(segment.stepId, { end: Math.min(activeSession.combo?.duration ?? 0, Math.max(segment.start, Number(event.target.value) || 0)), confirmed: true })} /></label><label className="timeline-confirm"><input type="checkbox" checked={segment.confirmed} onChange={(event) => updateComboSegment(segment.stepId, { confirmed: event.target.checked })} /> I confirm this segment</label></div>
              </div>)}</div>
            </section>}
            {reportLimitations.length > 0 && <div className="analysis-limitations panel"><div className="eyebrow"><CircleAlert size={14} /> MEASUREMENT LIMITS</div>{reportLimitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</div>}
            <div className="report-details">
              <div className="panel criteria-panel"><div className="panel-heading"><div><div className="eyebrow">SKILL-SPECIFIC BREAKDOWN</div><h2>Technique signals</h2></div></div>
                {activeSession.report.criteria.length ? <div className="criteria-list">{activeSession.report.criteria.map((criterion) => <div className="criterion" key={criterion.name}><div className="criterion-top"><div><strong>{criterion.name}</strong><small>{criterion.detail}</small></div><b>{activeSession.report.score === null ? '—' : criterion.score}</b></div><div className="criterion-bar"><i style={{ width: `${activeSession.report.score === null ? 0 : criterion.score}%` }} /></div></div>)}</div> : <p className="muted-text">No pose frames were recorded for this session.</p>}
                {activeSession.report.repConfidence.length > 0 && <div className="rep-confidence"><strong>REP LANDMARK CONFIDENCE</strong><div>{activeSession.report.repConfidence.map((confidence, index) => <span key={`${index}-${confidence}`}>#{index + 1} <b>{Math.round(confidence * 100)}%</b></span>)}</div><small>Visibility confidence at each completed rep; not a form-quality score.</small></div>}
              </div>
              <section className="recent-attempts panel"><div className="panel-heading"><div><div className="eyebrow">PERSONAL TREND</div><h2>Recent {activeSession.skillName} attempts</h2></div></div>
                {recentSkillSessions.length ? <div className="attempt-list">{recentSkillSessions.map((session) => <button className="attempt-row" key={session.id} onClick={() => openSession(session)}><span>{new Date(session.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</span><strong>{activeSkill?.type === 'dynamic' ? `${session.report.validReps} reps` : formatTime(session.report.longestHold)}</strong><small>{session.report.score === null ? 'No reliable score' : `Estimated score · ${session.report.score}/100`}</small><ArrowRight size={15} /></button>)}</div> : <p>No earlier attempts for this exercise have been saved on this device.</p>}
              </section>
              <div className="panel notes-panel"><div className="eyebrow">COACHING NOTES</div><h2>What we noticed</h2>
                <div className="note-section"><strong className="note-positive">GOOD SIGNALS</strong>{activeSession.report.positives.map((item) => <p key={item}><Check size={14} />{item}</p>)}</div>
                {activeSession.report.issues.length > 0 && <div className="note-section"><strong className="note-warning">AREAS TO REVIEW</strong>{activeSession.report.issues.map((item) => { const example = activeSession.report.timestampExamples.find((entry) => entry.issue === item); return <p key={item}><ArrowDownRight size={14} />{example && <time className="issue-timestamp">{formatTime(example.time)}</time>}{item}</p> })}</div>}
                <div className="note-section"><strong className="note-suggestion">NEXT SESSION</strong>{activeSession.report.suggestions.map((item, index) => <p key={item}><span className="suggestion-index">0{index + 1}</span>{item}</p>)}</div>
              </div>
            </div>
            <div className="report-actions"><button className="button-secondary" onClick={showHistory}><History size={16} /> Training log</button><button className="button-primary" onClick={resetWorkflow}><Plus size={17} /> New analysis</button></div>
          </section>
        )}

        {screen === 'history' && (
          <section className="page-content">
            <div className="history-heading"><div><div className="eyebrow">YOUR LOCAL TRAINING LOG</div><h1>Keep showing up.</h1><p className="lede">Your sessions are stored on this device. They are never sent to a server.</p></div><div className="history-tools"><select aria-label="Filter by category" value={historyCategory} onChange={(event) => setHistoryCategory(event.target.value)}><option value="all">All categories</option>{categories.filter((item) => item.id !== 'all').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select aria-label="Filter by skill" value={historySkill} onChange={(event) => setHistorySkill(event.target.value)}><option value="all">All skills</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select><select aria-label="Filter by date" value={historyPeriod} onChange={(event) => setHistoryPeriod(event.target.value)}><option value="all">Any date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>{sessions.length > 0 && <button className="icon-button destructive" onClick={() => void removeAllSessions()} aria-label="Delete all training history"><Trash2 size={16} /></button>}</div></div>
            {filteredHistory.length ? <div className="history-table panel"><div className="history-table-head"><span>SESSION</span><span>TECHNIQUE</span><span>REPS / HOLD</span><span>DATE</span><span /></div>
              {filteredHistory.map((session) => <div className="history-table-row" key={session.id}><button className="history-session" onClick={() => openSession(session)}><span className="history-thumb"><Activity size={16} /></span><span><strong>{session.skillName}</strong><small>{getSkill(session.skillId)?.categoryName ?? 'Calisthenics'}</small></span></button><div className="history-score">{session.report.score === null ? <span className="score-muted">No score</span> : <><strong>{session.report.score}</strong><small>/100</small></>}</div><div className="history-stat">{session.report.validReps ? `${session.report.validReps} reps` : formatTime(session.report.longestHold)}</div><div className="history-date">{new Date(session.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}</div><button className="icon-button" onClick={() => void removeSession(session.id)} aria-label={`Delete ${session.skillName} session`}><Trash2 size={15} /></button></div>)}
              </div> : <EmptyState title={sessions.length ? 'No sessions match these filters' : 'No sessions yet'} text={sessions.length ? 'Choose a wider date range or clear one of the filters.' : 'Choose a skill, record or upload a video, and save your first analysis.'} action={sessions.length ? 'Clear filters' : 'Choose a skill'} onClick={() => sessions.length ? (setHistorySkill('all'), setHistoryCategory('all'), setHistoryPeriod('all')) : setScreen('select')} />}
            <div className="storage-note"><ShieldCheck size={16} /><span>Local storage · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} · Delete any session or clear all data at any time.</span></div>
          </section>
        )}

        {screen === 'plan' && <WorkoutPlanner language={language} />}

        <footer className="app-footer"><span>CALITRACKER <i>·</i> TRAIN SMARTER, STAY GROUNDED</span><span>BUILT FOR MOVEMENT <Activity size={13} /></span></footer>
        </LocalizedContent>
      </main>
    </div>
  )
}

function StatCard({ label, value, suffix, note, icon }: { label: string; value: string; suffix?: string; note: string; icon: ReactNode }) {
  return <div className="stat-card panel"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}<small>{suffix}</small></div><div className="stat-note">{note}</div></div>
}

function ScoreTrend({ sessions, language }: { sessions: TrainingSession[]; language: Language }) {
  const t = (value: string) => translate(value, language)
  const locale = language === 'de' ? 'de-DE' : 'en-US'
  const scored = sessions.filter((session) => session.report.score !== null).slice(0, 8).reverse()
  const points = scored.map((session, index) => ({
    x: scored.length === 1 ? 160 : 10 + index * (300 / (scored.length - 1)),
    y: 67 - ((session.report.score ?? 0) / 100) * 55,
  }))
  return <div className="score-trend">
    <div className="trend-heading"><span>{t('TECHNIQUE SCORE TREND')}</span><strong>{scored[scored.length - 1]?.report.score} <small>{t('latest')}</small></strong></div>
    <svg viewBox="0 0 320 82" role="img" aria-label={t('Technique score trend across recent sessions')}>
      <line x1="8" y1="12" x2="312" y2="12" /><line x1="8" y1="67" x2="312" y2="67" />
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
      {points.map((point, index) => <circle key={scored[index].id} cx={point.x} cy={point.y} r="3.2"><title>{scored[index].skillName}: {scored[index].report.score}/100</title></circle>)}
    </svg>
    <div className="trend-dates"><span>{new Date(scored[0].date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</span><span>{t(`${scored.length} scored sessions`)}</span><span>{new Date(scored[scored.length - 1].date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</span></div>
  </div>
}

function EmptyState({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Activity size={20} /></span><strong>{title}</strong><p>{text}</p><button className="button-secondary" onClick={onClick}>{action} <ArrowRight size={15} /></button></div>
}

function SessionRow({ session, language, onClick }: { session: TrainingSession; language: Language; onClick: () => void }) {
  const locale = language === 'de' ? 'de-DE' : 'en-US'
  const t = (value: string) => translate(value, language)
  return <button className="session-row" onClick={onClick}><span className="session-row-icon"><Activity size={17} /></span><span className="session-row-main"><strong>{t(session.skillName)}</strong><small>{new Date(session.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })} · {session.report.validReps ? t(`${session.report.validReps} reps`) : `${formatTime(session.report.longestHold)} ${t('hold')}`}</small></span><span className={`session-score ${session.report.score === null ? 'score-muted' : ''}`}>{session.report.score ?? '—'}<small>{session.report.score !== null && '/100'}</small></span><ArrowRight className="session-arrow" size={16} /></button>
}

function SkillCard({ skill, language, favorite, onFavorite, onChoose }: { skill: Skill; language: Language; favorite: boolean; onFavorite: () => void; onChoose: () => void }) {
  const t = (value: string) => translate(value, language)
  const difficulty = skill.level <= 2 ? 'Beginner' : skill.level === 3 ? 'Intermediate' : 'Advanced'
  return <article className="skill-card-wrap"><button className="skill-card panel" onClick={onChoose}><div className="skill-card-top"><span className={`skill-type ${skill.type}`}>{t(skill.type)}</span><span className="level-label">{t(difficulty)} · <b>{t('Level')} {skill.level}</b>{skill.difficultyTag && ` · ${t(skill.difficultyTag)}`}</span></div><h3>{skill.name}</h3><p>{skill.description}</p><div className="skill-card-bottom"><span>{skill.categoryName}</span><span className={`analysis-badge badge-${skill.analysisSupport}`}>{t(skill.analysisSupport === 'automatic' ? 'Auto' : skill.analysisSupport === 'partial' ? 'Partial' : 'Manual')}</span><span className="skill-select">{t('Details')} <ArrowRight size={14} /></span></div></button><button className={`skill-favorite ${favorite ? 'is-favorite' : ''}`} aria-label={t(favorite ? 'Remove from favorites' : 'Add to favorites')} onClick={onFavorite}>{favorite ? '★' : '☆'}</button></article>
}

function Metric({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: ReactNode }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><span>{helper}</span></div></div>
}

function LocalizedContent({ language, children }: { language: Language; children: ReactNode }) {
  const localize = (node: ReactNode): ReactNode => {
    if (typeof node === 'string') return translate(node, language)
    if (Array.isArray(node)) return node.map(localize)
    if (!isValidElement(node)) return node

    const props = node.props as Record<string, unknown>
    const nextProps: Record<string, unknown> = { ...props }
    const componentElement = typeof node.type === 'function'
    for (const [key, value] of Object.entries(props)) {
      if (key === 'children') {
        nextProps.children = Children.map(value as ReactNode, localize)
      } else if (typeof value === 'string' && componentElement && !['id', 'className', 'type', 'name'].includes(key)) {
        nextProps[key] = translate(value, language)
      } else if (typeof value === 'string' && !componentElement && ['aria-label', 'placeholder', 'title'].includes(key)) {
        nextProps[key] = translate(value, language)
      }
    }
    return cloneElement(node, nextProps)
  }
  return <>{Children.map(children, localize)}</>
}

export default App
