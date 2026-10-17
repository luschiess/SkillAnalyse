import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Clock3, Dumbbell, RotateCcw, Save, ShieldAlert, TrendingUp } from 'lucide-react'
import { skills as skillCatalog } from '../data/skills'
import type { Language } from '../lib/language'
import './WorkoutPlanner.css'

type Goal = 'push' | 'pull' | 'front-lever' | 'planche' | 'handstand' | 'muscle-up' | 'basics' | 'freestyle' | 'general'
type Level = 'beginner' | 'intermediate' | 'advanced'
type Exercise = {
  id: string
  name: string
  goals: Goal[]
  group: 'push' | 'pull' | 'skill' | 'mobility'
  kind: 'Strength' | 'Skill' | 'Technique' | 'Mobility'
  equipment: string[]
  sets: number
  target: string
  rest: number
  purpose: string
  cues: string[]
  easier: string
  progression: string[]
  targetCount: number
  targetUnit: 'reps' | 'sec'
}
type Workout = { id: string; day: number; label: string; focus: string; intensity: 'Heavy' | 'Technical' | 'Light'; exercises: Exercise[] }
type Plan = { config: Config; workouts: Workout[]; variants: Record<string, number>; adjustments: Record<string, number>; updatedAt: string }
type Config = { level: Level; days: number; minutes: number; equipment: string[]; goals: Goal[]; abilities: string; preferences: string[]; targetSkills: string[] }
type Log = { id: string; exerciseId: string; name: string; date: string; sets: number; count: number; unit: 'reps' | 'sec'; clean: boolean; note: string; difficulty: 'easy' | 'right' | 'hard' }
type LogDraft = Omit<Log, 'id' | 'date' | 'name'>

const PLAN_KEY = 'skillanalyse-training-plan-v1'
const LOG_KEY = 'skillanalyse-training-logs-v1'
const STORAGE_STATUS_EVENT = 'skillanalyse:workout-storage-status'
const goals: Array<{ id: Goal; en: string; de: string }> = [
  { id: 'push', en: 'Push strength & skills', de: 'Push-Kraft & Skills' },
  { id: 'pull', en: 'Pull strength & skills', de: 'Pull-Kraft & Skills' },
  { id: 'front-lever', en: 'Front lever', de: 'Front Lever' },
  { id: 'planche', en: 'Planche', de: 'Planche' },
  { id: 'handstand', en: 'Handstand & HSPU', de: 'Handstand & HSPU' },
  { id: 'muscle-up', en: 'Muscle-up', de: 'Muscle-up' },
  { id: 'basics', en: 'Push-up & pull-up progressions', de: 'Liegestütz- & Klimmzug-Progressionen' },
  { id: 'freestyle', en: 'Freestyle & combinations', de: 'Freestyle & Kombinationen' },
  { id: 'general', en: 'General calisthenics strength', de: 'Allgemeine Calisthenics-Kraft' },
]
const equipmentOptions = [
  { id: 'floor', en: 'Floor / bodyweight', de: 'Boden / Körpergewicht' },
  { id: 'bar', en: 'Pull-up bar', de: 'Klimmzugstange' },
  { id: 'rings', en: 'Rings', de: 'Ringe' },
  { id: 'parallettes', en: 'Parallettes', de: 'Parallettes' },
  { id: 'wall', en: 'Wall', de: 'Wand' },
  { id: 'band', en: 'Resistance band', de: 'Widerstandsband' },
]
const exerciseLibrary: Exercise[] = [
  { id: 'pushup', name: 'Push-up progression', goals: ['push', 'basics', 'general'], group: 'push', kind: 'Strength', equipment: ['floor'], sets: 3, target: '6–10 reps', rest: 90, purpose: 'Horizontal pressing strength with a stable trunk.', cues: ['Keep ribs and hips aligned', 'Use a repeatable comfortable depth'], easier: 'Incline push-up', progression: ['Incline push-up', 'Knee push-up', 'Push-up', 'Diamond push-up', 'Archer push-up'], targetCount: 8, targetUnit: 'reps' },
  { id: 'pike-pushup', name: 'Pike push-up progression', goals: ['push', 'handstand', 'general'], group: 'push', kind: 'Strength', equipment: ['floor'], sets: 3, target: '5–8 reps', rest: 120, purpose: 'Build vertical pressing strength for handstand work.', cues: ['Keep hips high', 'Lower under control; stop before form breaks'], easier: 'Shorter range or hands elevated', progression: ['Pike push-up', 'Elevated pike push-up', 'Wall handstand push-up', 'Freestanding HSPU'], targetCount: 6, targetUnit: 'reps' },
  { id: 'dip', name: 'Supported dip', goals: ['push', 'general'], group: 'push', kind: 'Strength', equipment: ['parallettes', 'rings'], sets: 3, target: '5–8 reps', rest: 120, purpose: 'Train elbow extension and support strength.', cues: ['Keep shoulders controlled', 'Use a pain-free depth'], easier: 'Foot-assisted support dips', progression: ['Foot-assisted dip', 'Parallel-bar dip', 'Ring dip'], targetCount: 6, targetUnit: 'reps' },
  { id: 'planche-lean', name: 'Planche lean', goals: ['planche', 'push', 'freestyle'], group: 'skill', kind: 'Skill', equipment: ['floor', 'parallettes'], sets: 4, target: '10–20 sec', rest: 90, purpose: 'Introduce forward shoulder lean and protraction.', cues: ['Lock elbows only if comfortable', 'Keep shoulder blades actively spread'], easier: 'Kneeling planche lean', progression: ['Kneeling lean', 'Planche lean', 'Tuck planche', 'Advanced tuck planche'], targetCount: 12, targetUnit: 'sec' },
  { id: 'wall-handstand', name: 'Wall handstand line drill', goals: ['handstand', 'push', 'freestyle'], group: 'skill', kind: 'Technique', equipment: ['wall'], sets: 4, target: '15–30 sec', rest: 75, purpose: 'Practice shoulder opening and a controlled stacked line.', cues: ['Choose a safe entry and exit', 'Stop before shoulder or wrist fatigue changes form'], easier: 'Incline pike hold', progression: ['Incline pike hold', 'Wall handstand', 'Wall-facing handstand', 'Freestanding handstand'], targetCount: 20, targetUnit: 'sec' },
  { id: 'hollow', name: 'Hollow-body hold', goals: ['front-lever', 'planche', 'handstand', 'basics', 'general', 'freestyle'], group: 'skill', kind: 'Technique', equipment: ['floor'], sets: 3, target: '15–30 sec', rest: 60, purpose: 'Build trunk tension used in static skills.', cues: ['Keep lower back gently connected to floor', 'Shorten the lever if the back arches'], easier: 'Tuck hollow hold', progression: ['Tuck hold', 'Hollow hold', 'Hollow rocks'], targetCount: 20, targetUnit: 'sec' },
  { id: 'pullup', name: 'Pull-up progression', goals: ['pull', 'basics', 'general', 'muscle-up'], group: 'pull', kind: 'Strength', equipment: ['bar', 'rings', 'band'], sets: 3, target: '4–8 reps', rest: 120, purpose: 'Develop vertical pulling strength with controlled range.', cues: ['Begin from an active shoulder', 'Avoid swinging; lower with control'], easier: 'Band-assisted pull-up or row', progression: ['Ring row', 'Band-assisted pull-up', 'Pull-up', 'Chest-to-bar pull-up'], targetCount: 6, targetUnit: 'reps' },
  { id: 'row', name: 'Horizontal body row', goals: ['pull', 'basics', 'general', 'front-lever'], group: 'pull', kind: 'Strength', equipment: ['rings', 'bar'], sets: 3, target: '8–12 reps', rest: 90, purpose: 'Build horizontal pulling capacity and scapular control.', cues: ['Keep body in one line', 'Pull chest toward the anchor'], easier: 'More upright ring row', progression: ['Inclined row', 'Horizontal row', 'Feet-elevated row'], targetCount: 10, targetUnit: 'reps' },
  { id: 'scap-pull', name: 'Scapular pull-up', goals: ['pull', 'front-lever', 'muscle-up'], group: 'skill', kind: 'Technique', equipment: ['bar', 'rings'], sets: 3, target: '6–10 reps', rest: 60, purpose: 'Practice controlled shoulder depression while hanging.', cues: ['Keep elbows straight', 'Use a small deliberate range'], easier: 'Feet-supported scapular pull', progression: ['Supported scapular pull', 'Scapular pull-up', 'Active hang'], targetCount: 8, targetUnit: 'reps' },
  { id: 'tuck-lever', name: 'Tuck front-lever hold', goals: ['front-lever', 'pull', 'freestyle'], group: 'skill', kind: 'Skill', equipment: ['bar', 'rings'], sets: 4, target: '6–12 sec', rest: 120, purpose: 'Practice a compact horizontal lever position with assistance as needed.', cues: ['Keep arms straight only in a pain-free range', 'Avoid swinging into position'], easier: 'Foot-assisted tuck hold', progression: ['Foot-assisted tuck', 'Tuck front lever', 'Advanced tuck', 'One-leg', 'Straddle', 'Full front lever'], targetCount: 8, targetUnit: 'sec' },
  { id: 'muscle-transition', name: 'Low-ring transition drill', goals: ['muscle-up', 'pull', 'freestyle'], group: 'skill', kind: 'Technique', equipment: ['rings'], sets: 3, target: '3–5 reps', rest: 90, purpose: 'Practice the pull-to-support turnover with feet assisting.', cues: ['Keep rings close', 'Use feet to regulate assistance'], easier: 'Ring row to chest', progression: ['Low-ring transition', 'Band-assisted transition', 'Strict ring muscle-up'], targetCount: 4, targetUnit: 'reps' },
  { id: 'bar-transition', name: 'High pull & bar-transition prep', goals: ['muscle-up', 'pull', 'freestyle'], group: 'skill', kind: 'Technique', equipment: ['bar'], sets: 3, target: '3–5 reps', rest: 90, purpose: 'Build a controlled high pull and practice a safe assisted turnover.', cues: ['Use a secure bar and safe landing area', 'Use band or foot assistance; avoid maximal kipping'], easier: 'Band-assisted high pull', progression: ['Band-assisted high pull', 'Assisted bar transition', 'Muscle-up'], targetCount: 4, targetUnit: 'reps' },
  { id: 'scap-push', name: 'Scapular push-up', goals: ['push', 'planche', 'handstand', 'general'], group: 'skill', kind: 'Technique', equipment: ['floor'], sets: 2, target: '8–12 reps', rest: 45, purpose: 'Build awareness of controlled shoulder-blade movement.', cues: ['Keep elbows straight', 'Move only through a comfortable shoulder range'], easier: 'Wall scapular push-up', progression: ['Wall scapular push-up', 'Kneeling scapular push-up', 'Scapular push-up'], targetCount: 10, targetUnit: 'reps' },
  { id: 'wrist-mobility', name: 'Wrist preparation', goals: ['push', 'planche', 'handstand', 'freestyle'], group: 'mobility', kind: 'Mobility', equipment: ['floor'], sets: 2, target: '30 sec each direction', rest: 30, purpose: 'Prepare wrists gradually for weight-bearing positions.', cues: ['Use gentle, pain-free loading', 'Reduce range if discomfort appears'], easier: 'Gentle wrist circles', progression: ['Wrist circles', 'Quadruped wrist rocks'], targetCount: 30, targetUnit: 'sec' },
  { id: 'shoulder-mobility', name: 'Shoulder flexion reach', goals: ['push', 'pull', 'planche', 'handstand', 'general'], group: 'mobility', kind: 'Mobility', equipment: ['floor'], sets: 2, target: '30 sec', rest: 30, purpose: 'Prepare overhead and scapular positions without forcing range.', cues: ['Keep ribs relaxed', 'Stay within comfortable range'], easier: 'Small-range shoulder circles', progression: ['Shoulder circles', 'Wall slides', 'Overhead reach'], targetCount: 30, targetUnit: 'sec' },
  { id: 'arch-hold', name: 'Arch-body hold', goals: ['pull', 'front-lever', 'general'], group: 'skill', kind: 'Technique', equipment: ['floor'], sets: 3, target: '15–25 sec', rest: 60, purpose: 'Train posterior-chain tension and body awareness.', cues: ['Lift only to a comfortable range', 'Keep the neck relaxed'], easier: 'Alternating arm/leg lift', progression: ['Alternating lifts', 'Arch hold', 'Arch rocks'], targetCount: 18, targetUnit: 'sec' },
  { id: 'pike-compression', name: 'Seated pike compression', goals: ['handstand', 'planche', 'freestyle'], group: 'skill', kind: 'Technique', equipment: ['floor', 'parallettes'], sets: 3, target: '6–10 reps', rest: 60, purpose: 'Practice active hip compression for press and shape control.', cues: ['Keep the movement controlled', 'Bend knees slightly if hamstrings limit position'], easier: 'Bent-knee compression lift', progression: ['Bent-knee lift', 'Straight-leg lift', 'Elevated compression'], targetCount: 8, targetUnit: 'reps' },
  { id: 'easy-mobility', name: 'Easy full-body mobility', goals: ['general', 'push', 'pull', 'front-lever', 'planche', 'handstand', 'muscle-up', 'basics', 'freestyle'], group: 'mobility', kind: 'Mobility', equipment: ['floor'], sets: 1, target: '5–8 min', rest: 0, purpose: 'Low-intensity recovery movement; keep effort easy.', cues: ['Move gently and breathe normally', 'Skip any painful position'], easier: 'Comfortable walking', progression: ['Gentle mobility flow'], targetCount: 5, targetUnit: 'sec' },
]
const defaultConfig: Config = { level: 'beginner', days: 3, minutes: 45, equipment: ['floor', 'bar'], goals: ['general'], abilities: '', preferences: [], targetSkills: [] }
const safeRead = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch (error) {
    console.warn(`Could not read ${key} from local storage.`, error)
    return fallback
  }
}
const isPlan = (value: unknown): value is Plan =>
  typeof value === 'object' && value !== null &&
  'config' in value && typeof value.config === 'object' && value.config !== null &&
  'workouts' in value && Array.isArray(value.workouts) &&
  'variants' in value && typeof value.variants === 'object' && value.variants !== null &&
  'adjustments' in value && typeof value.adjustments === 'object' && value.adjustments !== null
const label = (en: string, de: string, language: Language) => language === 'de' ? de : en
const goalName = (goal: Goal, language: Language) => goals.find((item) => item.id === goal)?.[language] ?? goal
const daysOfWeek = (language: Language) => language === 'de'
  ? ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
  : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const exerciseName = (exercise: Exercise, variant: number) => exercise.progression[Math.min(variant, exercise.progression.length - 1)] ?? exercise.name

function makePlan(config: Config, previous?: Plan, language: Language = 'en'): Plan {
  const levelFactor = config.level === 'beginner' ? 1 : config.level === 'intermediate' ? 1.15 : 1.3
  const selectedGoals = config.goals.length ? config.goals : ['general' as Goal]
  const skillCategories = new Set(config.targetSkills.map((id) => skillCatalog.find((skill) => skill.id === id)?.category).filter(Boolean))
  const categoryGoals: Partial<Record<string, Goal[]>> = {
    'push-up': ['push', 'basics'], 'handstand-push-up': ['push', 'handstand'], 'bent-arm-press': ['push', 'handstand'],
    planche: ['planche', 'push'], 'front-lever': ['front-lever', 'pull'], 'back-lever': ['pull'],
    'bar-skills': ['pull', 'muscle-up'], rings: ['pull', 'muscle-up'], 'dynamic-skills': ['freestyle'],
    freestyle: ['freestyle'], floorwork: ['freestyle'],
  }
  const skillGoals = [...skillCategories].flatMap((category) => categoryGoals[category ?? ''] ?? [])
  const available = exerciseLibrary.filter((item) =>
    item.equipment.some((piece) => config.equipment.includes(piece)) &&
    (item.goals.some((goal) => selectedGoals.includes(goal)) || item.id === 'wrist-mobility' || item.id === 'shoulder-mobility' || item.id === 'hollow'),
  ).sort((a, b) => Number(config.preferences.includes(b.id)) - Number(config.preferences.includes(a.id)))
  const strengthFor = (focus: Exercise['group']) => available.filter((item) => item.group === focus && item.kind === 'Strength')
  const skills = available.filter((item) => item.kind === 'Skill' || item.kind === 'Technique')
  const mobility = available.filter((item) => item.kind === 'Mobility')
  const days = Array.from({ length: config.days }, (_, index) => Math.floor(index * 7 / config.days))
  const workouts = days.map((day, index): Workout => {
    let group: 'push' | 'pull' | 'skill'
    let intensity: Workout['intensity']
    if ((config.days === 3 && index === 2) || (config.days >= 5 && index % 3 === 2)) { group = 'skill'; intensity = 'Light' }
    else if (index % 2 === 0) { group = 'push'; intensity = index % 4 === 0 ? 'Heavy' : 'Technical' }
    else { group = 'pull'; intensity = index % 4 === 1 ? 'Heavy' : 'Technical' }
    const relevantGoals = [...selectedGoals, ...skillGoals].filter((goal) =>
      group === 'push' ? ['push', 'handstand', 'planche', 'basics', 'general', 'freestyle'].includes(goal)
        : group === 'pull' ? ['pull', 'front-lever', 'muscle-up', 'basics', 'general', 'freestyle'].includes(goal)
          : true,
    )
    const groupItems = group === 'skill' ? skills : strengthFor(group)
    const selected = groupItems.filter((item) => item.goals.some((goal) => relevantGoals.includes(goal)))
    const base = selected.length ? selected : groupItems
    const choices = base.slice(0, group === 'skill' ? 3 : 3)
    const chosen = [...choices]
    const extraSkill = skills.find((item) => !chosen.some((choice) => choice.id === item.id))
    if (extraSkill) chosen.push(extraSkill)
    for (const item of mobility.slice(0, 1)) if (!chosen.some((choice) => choice.id === item.id)) chosen.push(item)
    const exerciseLimit = config.minutes <= 30 ? 3 : config.minutes <= 45 ? 4 : 5
    const exercises = chosen.slice(0, exerciseLimit).map((item) => ({
      ...item,
      sets: group === 'skill' ? Math.min(item.sets, 3) : Math.max(2, Math.round(item.sets * levelFactor)),
    }))
    const themes = group === 'push'
      ? label('Push strength + overhead / support skills', 'Push-Kraft + Überkopf-/Stütz-Skills', language)
      : group === 'pull'
        ? label('Pull strength + lever / transition practice', 'Pull-Kraft + Lever-/Übergangstechnik', language)
        : label('Low-fatigue skill technique + mobility', 'Techniktraining mit geringer Belastung + Mobilität', language)
    return { id: `workout-${day}`, day, label: group === 'push' ? 'Push' : group === 'pull' ? 'Pull' : 'Skill + light', focus: themes, intensity, exercises }
  })
  return { config, workouts, variants: previous?.variants ?? {}, adjustments: previous?.adjustments ?? {}, updatedAt: new Date().toISOString() }
}

function WorkoutPlanner({ language }: { language: Language }) {
  const [plan, setPlan] = useState<Plan>(() => {
    const saved = safeRead<unknown>(PLAN_KEY, null)
    return isPlan(saved) && saved.workouts.length ? saved : makePlan(defaultConfig, undefined, language)
  })
  const [logs, setLogs] = useState<Log[]>(() => {
    const stored = safeRead<unknown>(LOG_KEY, [])
    return Array.isArray(stored) ? stored.filter((item): item is Log => typeof item === 'object' && item !== null && 'exerciseId' in item && 'count' in item) : []
  })
  const [storageErrors, setStorageErrors] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, LogDraft>>({})
  const [activeWorkout, setActiveWorkout] = useState<string | null>(null)
  const t = useCallback((en: string, de: string) => label(en, de, language), [language])
  const week = daysOfWeek(language)

  useEffect(() => {
    const handleStatus = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const { key, message } = event.detail as { key: string; message: string }
      setStorageErrors((current) => ({ ...current, [key]: message }))
    }
    window.addEventListener(STORAGE_STATUS_EVENT, handleStatus)
    return () => window.removeEventListener(STORAGE_STATUS_EVENT, handleStatus)
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); window.dispatchEvent(new CustomEvent(STORAGE_STATUS_EVENT, { detail: { key: 'plan', message: '' } })) }
    catch (reason) { console.error('Could not save the training plan locally.', reason); window.dispatchEvent(new CustomEvent(STORAGE_STATUS_EVENT, { detail: { key: 'plan', message: t('Could not save the plan on this device. Check available storage.', 'Trainingsplan konnte nicht gespeichert werden. Prüfe den verfügbaren Speicherplatz.') } })) }
  }, [plan, t])
  useEffect(() => {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); window.dispatchEvent(new CustomEvent(STORAGE_STATUS_EVENT, { detail: { key: 'logs', message: '' } })) }
    catch (reason) { console.error('Could not save training logs locally.', reason); window.dispatchEvent(new CustomEvent(STORAGE_STATUS_EVENT, { detail: { key: 'logs', message: t('Could not save training progress on this device.', 'Trainingsfortschritt konnte nicht gespeichert werden.') } })) }
  }, [logs, t])

  const bests = useMemo(() => {
    const values = new Map<string, number>()
    for (const log of logs) if (log.clean) {
      const key = `${log.exerciseId}:${log.name}`
      values.set(key, Math.max(values.get(key) ?? 0, log.count))
    }
    return values
  }, [logs])
  const updateConfig = (key: keyof Config, value: Config[keyof Config]) => {
    const config = { ...plan.config, [key]: value } as Config
    setPlan(makePlan(config, plan, language))
  }
  const toggleArray = (key: 'goals' | 'equipment' | 'preferences' | 'targetSkills', value: string) => {
    const current = plan.config[key] as string[]
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    updateConfig(key, next)
  }
  const logKey = (workoutId: string, exerciseId: string) => `${workoutId}:${exerciseId}`
  const saveLog = (workout: Workout, exercise: Exercise) => {
    const draft = drafts[logKey(workout.id, exercise.id)]
    if (!draft || draft.count < 1 || draft.sets < 1) return
    setLogs((current) => [...current, {
      ...draft, id: crypto.randomUUID(), exerciseId: exercise.id,
      name: exerciseName(exercise, plan.variants[exercise.id] ?? 0),
      date: new Date().toISOString(),
    }])
    if (draft.difficulty === 'easy') adjust(exercise.id, 1)
    if (draft.difficulty === 'hard') adjust(exercise.id, -1)
    setDrafts((current) => ({ ...current, [logKey(workout.id, exercise.id)]: { ...current[logKey(workout.id, exercise.id)], note: '' } }))
  }
  const qualifyingLogs = (exercise: Exercise) => logs.filter((log) =>
    log.exerciseId === exercise.id && log.name === exerciseName(exercise, plan.variants[exercise.id] ?? 0) &&
    log.clean && log.count >= exercise.targetCount && log.sets >= exercise.sets,
  ).length
  const adjust = (exerciseId: string, amount: number) => setPlan((current) => ({
    ...current, adjustments: { ...current.adjustments, [exerciseId]: Math.max(-2, Math.min(2, (current.adjustments[exerciseId] ?? 0) + amount)) },
  }))
  const resetPlan = () => setPlan(makePlan(defaultConfig, undefined, language))
  const replaceExercise = (workoutId: string, exerciseId: string, nextExerciseId: string) => {
    const replacement = exerciseLibrary.find((exercise) => exercise.id === nextExerciseId)
    if (!replacement) return
    setPlan((current) => ({
      ...current,
      workouts: current.workouts.map((workout) => workout.id === workoutId
        ? { ...workout, exercises: workout.exercises.map((exercise) => exercise.id === exerciseId ? { ...replacement, sets: exercise.sets } : exercise) }
        : workout),
    }))
  }
  const estimateMinutes = (workout: Workout) => Math.round(6 + workout.exercises.reduce((total, exercise) =>
    total + (exercise.sets * exercise.rest + exercise.sets * (exercise.targetUnit === 'sec' ? exercise.targetCount : exercise.targetCount * 3)) / 60, 0))
  const targetSkillOptions = skillCatalog.filter((skill) => {
    const categoryGoals: Partial<Record<string, Goal[]>> = {
      'push-up': ['push', 'basics'], 'handstand-push-up': ['push', 'handstand'], 'bent-arm-press': ['push', 'handstand'],
      planche: ['planche', 'push'], 'front-lever': ['front-lever', 'pull'], 'back-lever': ['pull'],
      'bar-skills': ['pull', 'muscle-up'], rings: ['pull', 'muscle-up'], 'dynamic-skills': ['freestyle'],
      freestyle: ['freestyle'], floorwork: ['freestyle'],
    }
    return skill.type !== 'information' && (plan.config.goals.includes('general') || (categoryGoals[skill.category] ?? []).some((goal) => plan.config.goals.includes(goal)))
  }).filter((skill, index, items) => items.slice(0, index).filter((item) => item.category === skill.category).length < 2).slice(0, 16)

  return <section className="page-content workout-planner">
    <div className="workout-heading">
      <div><div className="eyebrow">{t('YOUR PERSONAL PLAN', 'DEIN PERSÖNLICHER PLAN')}</div>
        <h1>{t('Train with', 'Trainiere mit')} <em>{t('a plan.', 'einem Plan.')}</em></h1>
        <p className="lede">{t('A locally saved weekly program built around your goals, equipment, time and current experience.', 'Ein lokal gespeicherter Wochenplan, abgestimmt auf deine Ziele, dein Equipment, deine Zeit und deine Erfahrung.')}</p>
      </div>
      <button className="button-secondary" onClick={() => {
        if (window.confirm(t('Reset your plan settings and generated week? Training history will be kept.', 'Planeinstellungen und Wochenplan zurücksetzen? Deine Trainingshistorie bleibt erhalten.'))) resetPlan()
      }}><RotateCcw size={15} />{t('Reset plan', 'Plan zurücksetzen')}</button>
    </div>
    {Object.values(storageErrors).filter(Boolean).map((message) => <div className="workout-alert" role="alert" key={message}><ShieldAlert size={17} />{message}</div>)}
    <div className="workout-config panel">
      <div className="workout-section-title"><div><div className="eyebrow">{t('PLAN SETUP', 'PLANEINSTELLUNGEN')}</div><h2>{t('Make it fit you', 'An dich anpassen')}</h2></div><button className="button-primary" onClick={() => setPlan(makePlan(plan.config, plan, language))}><RotateCcw size={15} />{t('Regenerate week', 'Woche neu erstellen')}</button></div>
      <div className="workout-fields">
        <label>{t('Training level', 'Trainingslevel')}<select value={plan.config.level} onChange={(event) => updateConfig('level', event.target.value as Level)}><option value="beginner">{t('Beginner', 'Einsteiger')}</option><option value="intermediate">{t('Intermediate', 'Fortgeschritten')}</option><option value="advanced">{t('Advanced', 'Erfahren')}</option></select></label>
        <label>{t('Training days / week', 'Trainingstage / Woche')}<select value={plan.config.days} onChange={(event) => updateConfig('days', Number(event.target.value))}>{[2, 3, 4, 5, 6].map((days) => <option key={days} value={days}>{days}</option>)}</select></label>
        <label>{t('Available time', 'Verfügbare Zeit')}<select value={plan.config.minutes} onChange={(event) => updateConfig('minutes', Number(event.target.value))}>{[30, 45, 60, 75].map((minutes) => <option key={minutes} value={minutes}>{minutes} {t('minutes', 'Minuten')}</option>)}</select></label>
      </div>
      <fieldset><legend>{t('Goals (select any)', 'Ziele (mehrere möglich)')}</legend><div className="workout-check-grid">{goals.map((goal) => <label key={goal.id}><input type="checkbox" checked={plan.config.goals.includes(goal.id)} onChange={() => toggleArray('goals', goal.id)} />{goal[language]}</label>)}</div></fieldset>
      <fieldset><legend>{t('Equipment available', 'Vorhandenes Equipment')}</legend><div className="workout-check-grid">{equipmentOptions.map((item) => <label key={item.id}><input type="checkbox" checked={plan.config.equipment.includes(item.id)} disabled={item.id === 'floor' && plan.config.equipment.length === 1} onChange={() => toggleArray('equipment', item.id)} />{item[language]}</label>)}</div></fieldset>
      <fieldset><legend>{t('Target skills', 'Zielskills')}</legend><div className="workout-check-grid target-skill-grid">{targetSkillOptions.map((skill) => <label key={skill.id}><input type="checkbox" checked={plan.config.targetSkills.includes(skill.id)} onChange={() => toggleArray('targetSkills', skill.id)} />{skill.name}</label>)}</div></fieldset>
      <label className="workout-wide-label">{t('Current abilities / pain-free variations', 'Aktuelle Fähigkeiten / schmerzfreie Varianten')}<textarea value={plan.config.abilities} onChange={(event) => updateConfig('abilities', event.target.value)} maxLength={500} placeholder={t('For example: 3 pull-ups, 20-second wall handstand. Do not enter anything that hurts. Choose your starting variation in each exercise below.', 'Zum Beispiel: 3 Klimmzüge, 20 Sekunden Wandhandstand. Keine schmerzhaften Varianten eintragen. Wähle deine Startvariante bei den Übungen unten.')} /></label>
      <fieldset><legend>{t('Preferred exercises', 'Bevorzugte Übungen')}</legend><div className="workout-check-grid">{exerciseLibrary.filter((exercise) => exercise.kind === 'Strength').map((exercise) => <label key={exercise.id}><input type="checkbox" checked={plan.config.preferences.includes(exercise.id)} onChange={() => toggleArray('preferences', exercise.id)} />{exercise.name}</label>)}</div></fieldset>
      <p className="workout-safety"><ShieldAlert size={16} />{t('Pain rule: stop any painful exercise and choose a pain-free regression or rest. This plan is a general training aid, not medical advice.', 'Bei Schmerzen: Übung abbrechen und eine schmerzfreie leichtere Variante oder Erholung wählen. Dieser Plan ist eine allgemeine Trainingshilfe, keine medizinische Beratung.')}</p>
    </div>

    <div className="workout-week-title"><div><div className="eyebrow">{t('YOUR WEEK', 'DEINE WOCHE')}</div><h2>{t('Weekly overview', 'Wochenübersicht')}</h2></div><span>{plan.workouts.length} {t('sessions', 'Einheiten')} · {7 - plan.workouts.length} {t('recovery days', 'Erholungstage')}</span></div>
    <div className="workout-week-grid">{week.map((day, index) => {
      const workout = plan.workouts.find((item) => item.day === index)
      const isOpen = workout && activeWorkout === workout.id
      return <button key={day} className={`workout-day ${workout ? `workout-${workout.intensity.toLowerCase()}` : 'workout-rest'} ${isOpen ? 'selected' : ''}`} disabled={!workout} onClick={() => setActiveWorkout(isOpen ? null : workout?.id ?? null)}>
        <small>{day}</small><strong>{workout ? workout.label : t('Recovery', 'Erholung')}</strong><span>{workout ? workout.intensity : t('Rest / easy walk', 'Ruhe / lockerer Spaziergang')}</span>
        {workout && <span className="workout-day-count">{workout.exercises.length} {t('exercises', 'Übungen')} <ChevronDown size={13} /></span>}
      </button>
    })}</div>

    {plan.workouts.filter((workout) => activeWorkout ? workout.id === activeWorkout : true).map((workout) => <article className="workout-session panel" key={workout.id}>
      <div className="workout-session-heading"><div><div className="eyebrow">{week[workout.day]} · {workout.intensity.toUpperCase()}</div><h2>{workout.label} {t('session', 'Einheit')}</h2><p>{workout.focus}</p></div>      <span className="workout-duration"><Clock3 size={15} />~{estimateMinutes(workout)} {t('min', 'Min.')}<small>{t('estimated with rest & warm-up', 'Schätzung mit Pausen & Aufwärmen')}</small></span></div>
      <div className="workout-warmup"><strong>{t('Warm-up · 5–8 min', 'Aufwärmen · 5–8 Min.')}</strong><span>{t('Easy pulse-raiser, wrist/shoulder preparation and gentle practice of the first movement. Keep it comfortable.', 'Locker in Bewegung kommen, Handgelenke/Schultern vorbereiten und die erste Bewegung leicht üben. Alles schmerzfrei halten.')}</span></div>
      <div className="workout-exercise-list">{workout.exercises.map((exercise) => {
        const variantIndex = plan.variants[exercise.id] ?? 0
        const adjustment = plan.adjustments[exercise.id] ?? 0
        const key = logKey(workout.id, exercise.id)
        const draft = drafts[key] ?? { exerciseId: exercise.id, sets: exercise.sets, count: exercise.targetCount, unit: exercise.targetUnit, clean: false, note: '', difficulty: 'right' as const }
        const progressionIsReady = qualifyingLogs(exercise) >= 2 && variantIndex < exercise.progression.length - 1
        const nextVariant = progressionIsReady ? variantIndex + 1 : variantIndex
        return <div className="workout-exercise" key={exercise.id}>
          <div className="workout-exercise-top"><span className={`exercise-kind kind-${exercise.kind.toLowerCase()}`}>{exercise.kind}</span><span className="exercise-rest">{t('Rest', 'Pause')} {exercise.rest}s</span></div>
          <h3>{exerciseName(exercise, variantIndex)}</h3><p>{exercise.purpose}</p>
          <div className="exercise-target"><strong>{Math.max(1, exercise.sets + adjustment)} × {exercise.target}</strong><span>{goalName(exercise.goals.find((goal) => plan.config.goals.includes(goal)) ?? exercise.goals[0], language)}</span></div>
          <label className="exercise-replace">{t('Swap exercise', 'Übung tauschen')}<select value={exercise.id} onChange={(event) => replaceExercise(workout.id, exercise.id, event.target.value)}>
            {exerciseLibrary.filter((option) => option.group === exercise.group && option.equipment.some((piece) => plan.config.equipment.includes(piece))).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <details><summary>{t('Technique, regression & progression', 'Technik, leichtere Variante & Progression')}</summary>
            <ul>{exercise.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul><p><b>{t('Easier:', 'Leichter:')}</b> {exercise.easier}</p>
            <label className="exercise-replace">{t('Your current variation', 'Deine aktuelle Variante')}<select value={variantIndex} disabled={logs.some((log) => log.exerciseId === exercise.id)} onChange={(event) => setPlan((current) => ({ ...current, variants: { ...current.variants, [exercise.id]: Number(event.target.value) } }))}>
              {exercise.progression.map((variation, index) => <option key={variation} value={index}>{variation}</option>)}
            </select></label>
            <div className="progression-chain">{exercise.progression.map((step, index) => <span className={index === variantIndex ? 'current' : index < variantIndex ? 'passed' : ''} key={step}>{step}</span>)}</div>
            <p className="progression-rule">{t('Move up only after two logged sessions at the target with clean technique; never by date alone.', 'Steigere erst nach zwei dokumentierten Einheiten mit Zielwert und sauberer Technik – nicht allein nach Zeit.')}</p>
            {progressionIsReady && <button className="button-secondary unlock-progression" onClick={() => setPlan((current) => ({ ...current, variants: { ...current.variants, [exercise.id]: nextVariant } }))}><TrendingUp size={15} />{t('Use next progression', 'Nächste Progression übernehmen')}: {exercise.progression[nextVariant]}</button>}
          </details>
          <div className="workout-log-form">
            <label>{t('Sets done', 'Sätze')}<input type="number" min="1" max="20" value={draft.sets} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, sets: Math.max(1, Number(event.target.value) || 1) } }))} /></label>
            <label>{draft.unit === 'sec' ? t('Best hold (sec)', 'Bester Hold (Sek.)') : t('Reps per set', 'Wdh. pro Satz')}<input type="number" min="1" max="600" value={draft.count} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, count: Math.max(1, Number(event.target.value) || 1) } }))} /></label>
            <label>{t('Effort', 'Schwierigkeit')}<select value={draft.difficulty} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, difficulty: event.target.value as LogDraft['difficulty'] } }))}><option value="easy">{t('Too easy', 'Zu leicht')}</option><option value="right">{t('About right', 'Passend')}</option><option value="hard">{t('Too hard', 'Zu schwer')}</option></select></label>
            <label className="clean-technique"><input type="checkbox" checked={draft.clean} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, clean: event.target.checked } }))} />{t('Clean technique', 'Saubere Technik')}</label>
            <label className="workout-note">{t('Technique notes', 'Techniknotiz')}<input maxLength={240} value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, note: event.target.value } }))} placeholder={t('Optional', 'Optional')} /></label>
            <button className="button-primary log-exercise" onClick={() => saveLog(workout, exercise)}><Save size={14} />{t('Save log', 'Eintrag speichern')}</button>
          </div>
          <div className="workout-exercise-footer"><span><Check size={13} />{logs.filter((log) => log.exerciseId === exercise.id).length} {t('logs', 'Einträge')} · {t('best', 'Bestwert')}: {bests.get(`${exercise.id}:${exerciseName(exercise, variantIndex)}`) ?? '—'} {exercise.targetUnit}</span><div><button onClick={() => adjust(exercise.id, -1)}>{t('Easier', 'Leichter')}</button><button onClick={() => adjust(exercise.id, 1)}>{t('Harder', 'Schwerer')}</button></div></div>
        </div>
      })}</div>
    </article>)}
    <div className="workout-history panel"><div className="workout-section-title"><div><div className="eyebrow">{t('LOCAL TRAINING HISTORY', 'LOKALE TRAININGSHISTORIE')}</div><h2>{t('Progress you recorded', 'Dein dokumentierter Fortschritt')}</h2></div><Dumbbell size={20} /></div>
      {logs.length ? <div className="workout-log-list">{[...logs].reverse().slice(0, 12).map((log) => <div key={log.id}><span>{log.name}</span><strong>{log.sets} × {log.count} {log.unit}</strong><small>{new Date(log.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')} · {log.clean ? t('clean technique', 'saubere Technik') : t('technique not confirmed', 'Technik nicht bestätigt')}</small>{log.note && <p>{log.note}</p>}</div>)}</div>
        : <p className="workout-empty-history">{t('No workouts logged yet. Save an exercise entry to start tracking your own progress and personal bests.', 'Noch keine Trainings eingetragen. Speichere einen Übungseintrag, um deinen Fortschritt und Bestwerte zu verfolgen.')}</p>}
    </div>
  </section>
}

export { WorkoutPlanner }
