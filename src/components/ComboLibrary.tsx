import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowRight, ArrowUp, Check, Copy, GripVertical, Plus, Save, Search, Trash2, Undo2, X } from 'lucide-react'
import { comboTemplates, type ComboItem } from '../data/combos'
import { skills } from '../data/skills'
import { LUSCHIES_SKILL_ID } from '../types'
import type { CategoryId, ComboStep, ComboStepKind, Skill, SkillType } from '../types'
import { translate, type Language } from '../lib/language'

interface UserCombo {
  id: string
  name: string
  difficulty: number
  steps: ComboItem[]
}

type CustomComboSkill = Pick<Skill, 'id' | 'name' | 'category' | 'categoryName' | 'type' | 'description'>
type BuilderTab = 'skills' | 'steps'

const storageKey = 'skillanalyse-user-combos'
const customSkillsStorageKey = 'skillanalyse-custom-combo-skills'
const newStep = (skillId: string): ComboItem => ({
  id: crypto.randomUUID(),
  skillId,
  repetitions: 1,
  holdSeconds: 5,
  restSeconds: 0,
  transition: '',
  note: '',
  transitionMode: 'direct',
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function loadCombos(): UserCombo[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Saved combo data must be a list.')
    return parsed.filter((combo): combo is Record<string, unknown> =>
      isRecord(combo) && typeof combo.id === 'string' && typeof combo.name === 'string' &&
      Array.isArray(combo.steps) && combo.steps.every((step) =>
        isRecord(step) && typeof step.id === 'string' && typeof step.skillId === 'string'),
    ).map((combo) => ({
      id: String(combo.id),
      name: String(combo.name),
      difficulty: typeof combo.difficulty === 'number' ? combo.difficulty : 3,
      steps: (combo.steps as Record<string, unknown>[]).map((step) => ({
        id: String(step.id),
        skillId: String(step.skillId),
        repetitions: typeof step.repetitions === 'number' ? step.repetitions : 1,
        holdSeconds: typeof step.holdSeconds === 'number' ? step.holdSeconds : 0,
        restSeconds: typeof step.restSeconds === 'number' ? step.restSeconds : 0,
        transition: typeof step.transition === 'string' ? step.transition : '',
        note: typeof step.note === 'string' ? step.note : '',
        transitionMode: step.transitionMode === 'rest' || (step.transitionMode === undefined && Number(step.restSeconds) > 0) ? 'rest' : 'direct',
      })),
    }))
  } catch (reason) {
    console.warn('Could not load saved combos.', reason)
    return []
  }
}

function loadCustomSkills(): CustomComboSkill[] {
  try {
    const stored = window.localStorage.getItem(customSkillsStorageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed) || !parsed.every((skill) =>
      isRecord(skill) && typeof skill.id === 'string' && typeof skill.name === 'string' &&
      typeof skill.category === 'string' && typeof skill.categoryName === 'string' &&
      typeof skill.type === 'string' && typeof skill.description === 'string',
    )) throw new Error('Saved custom skills are not in the expected format.')
    return parsed as CustomComboSkill[]
  } catch (reason) {
    console.warn('Could not load custom combo skills.', reason)
    return []
  }
}

const categories: Array<{ id: CategoryId | 'all'; label: string }> = [
  { id: 'all', label: 'All categories' },
  { id: 'front-lever', label: 'Front lever' },
  { id: 'handstand', label: 'Handstand' },
  { id: 'handstand-push-up', label: 'Handstand push-ups' },
  { id: 'push-up', label: 'Push-ups' },
  { id: 'bent-arm-press', label: 'Bent-arm press' },
  { id: 'back-lever', label: 'Back lever' },
  { id: 'bar-skills', label: 'Bar skills' },
  { id: 'planche', label: 'Planche' },
  { id: 'core', label: 'Core' },
  { id: 'dips-bars', label: 'Dips & parallel bars' },
  { id: 'human-flag', label: 'Human flag' },
  { id: 'rings', label: 'Rings' },
  { id: 'floorwork', label: 'Floorwork' },
  { id: 'dynamic-skills', label: 'Other skills' },
]

export function ComboLibrary({ language, onFreestyle, onAnalyzeCombo }: {
  language: Language
  onFreestyle: (name: string) => void
  onAnalyzeCombo: (name: string, steps: ComboStep[]) => void
}) {
  const t = useCallback((value: string) => translate(value, language), [language])
  const [saved, setSaved] = useState<UserCombo[]>(loadCombos)
  const [customSkills, setCustomSkills] = useState<CustomComboSkill[]>(loadCustomSkills)
  const [name, setName] = useState('')
  const [draftDifficulty, setDraftDifficulty] = useState(3)
  const [steps, setSteps] = useState<ComboItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [baseDraft, setBaseDraft] = useState(JSON.stringify({ name: '', difficulty: 3, steps: [] as ComboItem[] }))
  const [undoStack, setUndoStack] = useState<ComboItem[][]>([])
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('all')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillCategory, setSkillCategory] = useState<CategoryId | 'all'>('all')
  const [builderTab, setBuilderTab] = useState<BuilderTab>('skills')
  const [createSkillOpen, setCreateSkillOpen] = useState(false)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [customSkillName, setCustomSkillName] = useState('')
  const [customSkillCategory, setCustomSkillCategory] = useState<CategoryId>('handstand')
  const [customSkillType, setCustomSkillType] = useState<SkillType>('dynamic')
  const [customSkillDescription, setCustomSkillDescription] = useState('')
  const [skillError, setSkillError] = useState('')
  const [previewStep, setPreviewStep] = useState<number | null>(null)
  const [previewSource, setPreviewSource] = useState<UserCombo | null>(null)
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null)
  const [comparisonId, setComparisonId] = useState('')
  const [error, setError] = useState('')
  const allSkills = useMemo<CustomComboSkill[]>(() => [...skills, ...customSkills], [customSkills])
  const isDirty = baseDraft !== JSON.stringify({ name, difficulty: draftDifficulty, steps })
  const hasRestTransition = (step: ComboItem) =>
    step.transitionMode === 'rest' || (step.transitionMode === undefined && step.restSeconds > 0)
  const toCameraSteps = (comboName: string, comboItems: ComboItem[]) => {
    const cameraSteps: ComboStep[] = []
    for (const item of comboItems) {
      const skill = allSkills.find((candidate) => candidate.id === item.skillId)
      if (!skill) {
        setError(t('A skill in this combo is no longer available.'))
        return
      }
      const kind: ComboStepKind = skill.name === 'Elbow Lever to Handstand'
        ? 'elbow-lever-to-handstand'
        : skill.id === LUSCHIES_SKILL_ID || skill.category === 'bent-arm-press'
          ? 'press'
        : skill.category === 'handstand-push-up'
          ? 'hspu'
          : skill.category === 'handstand' && skill.type !== 'dynamic'
            ? 'hold'
            : 'manual'
      cameraSteps.push({
        id: item.id,
        kind,
        name: skill.name,
        repetitions: item.repetitions,
        holdSeconds: item.holdSeconds,
        description: [
          item.transition,
          item.note,
          item.transitionMode === 'rest' && item.restSeconds > 0 ? `${item.restSeconds}s rest` : '',
        ].filter(Boolean).join(' · '),
      })
    }
    onAnalyzeCombo(comboName, cameraSteps)
  }

  const visibleTemplates = useMemo(() => comboTemplates.filter((combo) =>
    (difficulty === 'all' || combo.difficulty === Number(difficulty)) &&
    (`${combo.name} ${combo.category} ${combo.description}`.toLowerCase().includes(search.toLowerCase()) ||
    `${t(combo.name)} ${t(combo.category)} ${t(combo.description)}`.toLowerCase().includes(search.toLowerCase())),
  ), [difficulty, search, t])
  const visibleSaved = saved.filter((combo) => `${combo.name} ${t(combo.name)} ${combo.steps.map((step) => allSkills.find((skill) => skill.id === step.skillId)?.name ?? '').join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  const visibleSkills = useMemo(() => allSkills.filter((skill) =>
    (skillCategory === 'all' || skill.category === skillCategory) &&
    `${skill.name} ${skill.categoryName} ${skill.description} ${t(skill.name)} ${t(skill.categoryName)}`.toLowerCase().includes(skillSearch.toLowerCase()),
  ).sort((left, right) => t(left.name).localeCompare(t(right.name), language)), [allSkills, language, skillCategory, skillSearch, t])
  const estimatedSeconds = steps.reduce((total, step, index) => {
    const skill = allSkills.find((candidate) => candidate.id === step.skillId)
    const time = skill?.type === 'static'
      ? step.holdSeconds
      : (skill?.type === 'combined' ? step.holdSeconds + step.repetitions * 3 : step.repetitions * 3)
    return total + time + (index < steps.length - 1 && hasRestTransition(step) ? step.restSeconds : 0)
  }, 0)
  const formattedEstimate = `${Math.floor(estimatedSeconds / 60)}:${String(estimatedSeconds % 60).padStart(2, '0')}`

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [isDirty])

  const persist = (combos: UserCombo[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(combos))
      setSaved(combos)
      setError('')
      return true
    } catch (reason) {
      console.error('Could not save custom combos locally.', reason)
      setError(t('Could not save your combo in this browser. Check available local storage.'))
      return false
    }
  }

  const setDraftSteps = (update: (previous: ComboItem[]) => ComboItem[]) => {
    const next = update(steps)
    if (next === steps) return
    setUndoStack((history) => [...history.slice(-19), steps])
    setSteps(next)
    setError('')
  }

  const updateStep = (stepId: string, changes: Partial<ComboItem>) =>
    setDraftSteps((previous) => previous.map((step) => step.id === stepId ? { ...step, ...changes } : step))

  const confirmDiscard = () => !isDirty || window.confirm(t('Discard unsaved changes?'))

  const loadDraft = (nextName: string, nextDifficulty: number, nextSteps: ComboItem[], nextEditingId: string | null) => {
    if (!confirmDiscard()) return
    setName(nextName)
    setDraftDifficulty(nextDifficulty)
    setSteps(nextSteps)
    setEditingId(nextEditingId)
    setUndoStack([])
    setError('')
    setBaseDraft(JSON.stringify({ name: nextName, difficulty: nextDifficulty, steps: nextSteps }))
    setBuilderTab('steps')
  }

  const edit = (combo: UserCombo) => {
    loadDraft(combo.name, combo.difficulty ?? 3, combo.steps.map((step) => ({ ...step })), combo.id)
  }

  const loadTemplate = (templateId: string) => {
    const template = comboTemplates.find((candidate) => candidate.id === templateId)
    if (!template) return
    loadDraft(template.name, template.difficulty, template.steps.map((step) => ({ ...step, id: crypto.randomUUID() })), null)
  }

  const save = (): UserCombo | null => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('Give the combo a name.'))
      return null
    }
    if (steps.length === 0) {
      setError(t('Add at least one skill to your combo.'))
      return null
    }
    if (steps.some((step) =>
      !allSkills.some((skill) => skill.id === step.skillId) ||
      !Number.isInteger(step.repetitions) || step.repetitions < 1 ||
      !Number.isInteger(step.holdSeconds) || step.holdSeconds < 0 ||
      !Number.isInteger(step.restSeconds) || step.restSeconds < 0,
    )) {
      setError(t('Check the combo step settings and try again.'))
      return null
    }
    const id = editingId ?? crypto.randomUUID()
    const next = { id, name: trimmedName, difficulty: draftDifficulty, steps: steps.map((step) => ({ ...step })) }
    const updated = editingId
      ? saved.map((combo) => combo.id === editingId ? next : combo)
      : [...saved, next]
    if (persist(updated)) {
      setEditingId(id)
      setBaseDraft(JSON.stringify({ name: trimmedName, difficulty: draftDifficulty, steps }))
      setError('')
      return next
    }
    return null
  }

  const saveAndAnalyze = () => {
    const combo = save()
    if (combo) toCameraSteps(combo.name, combo.steps)
  }

  const duplicate = (combo: UserCombo) => {
    persist([...saved, { ...combo, id: crypto.randomUUID(), name: `${combo.name} (${t('copy')})`, steps: combo.steps.map((step) => ({ ...step, id: crypto.randomUUID() })) }])
  }

  const remove = (combo: UserCombo) => {
    if (!window.confirm(t(`Delete combo “${combo.name}”?`))) return
    persist(saved.filter((candidate) => candidate.id !== combo.id))
    if (editingId === combo.id) {
      setEditingId(null)
      setName('')
      setDraftDifficulty(3)
      setSteps([])
      setBaseDraft(JSON.stringify({ name: '', difficulty: 3, steps: [] }))
    }
  }

  const createCustomSkill = () => {
    const trimmedName = customSkillName.trim()
    if (!trimmedName) {
      setSkillError(t('Enter a skill name.'))
      return
    }
    if (allSkills.some((skill) => skill.id !== editingSkillId && skill.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase())) {
      setSkillError(t('A skill with this name already exists.'))
      return
    }
    const custom: CustomComboSkill = {
      id: editingSkillId ?? `custom-${crypto.randomUUID()}`,
      name: trimmedName,
      category: customSkillCategory,
      categoryName: categories.find((category) => category.id === customSkillCategory)?.label ?? 'Other skills',
      type: customSkillType,
      description: customSkillDescription.trim(),
    }
    try {
      const next = editingSkillId
        ? customSkills.map((skill) => skill.id === editingSkillId ? custom : skill)
        : [...customSkills, custom]
      window.localStorage.setItem(customSkillsStorageKey, JSON.stringify(next))
      setCustomSkills(next)
      setCustomSkillName('')
      setCustomSkillDescription('')
      setSkillError('')
      setCreateSkillOpen(false)
      setEditingSkillId(null)
      if (!editingSkillId) {
        setDraftSteps((previous) => [...previous, newStep(custom.id)])
        setBuilderTab('steps')
      }
    } catch (reason) {
      console.error('Could not save custom combo skill.', reason)
      setSkillError(t('Could not save your skill in this browser. Check available local storage.'))
    }
  }

  const duplicateStep = (step: ComboItem) => setDraftSteps((previous) => {
    const index = previous.findIndex((candidate) => candidate.id === step.id)
    const next = [...previous]
    next.splice(index + 1, 0, { ...step, id: crypto.randomUUID() })
    return next
  })

  const moveStep = (stepId: string, destination: number) => setDraftSteps((previous) => {
    const source = previous.findIndex((step) => step.id === stepId)
    if (source < 0 || destination < 0 || destination >= previous.length) return previous
    const next = [...previous]
    const [step] = next.splice(source, 1)
    next.splice(destination, 0, step)
    return next
  })

  const addSkill = (skill: CustomComboSkill) => {
    setDraftSteps((previous) => [...previous, newStep(skill.id)])
    setBuilderTab('steps')
  }

  const newCombo = () => loadDraft('', 3, [], null)
  const clearSteps = () => {
    if (steps.length && window.confirm(t('Remove all steps from this combo?'))) setDraftSteps(() => [])
  }

  const formatStepTime = (step: ComboItem, index = steps.indexOf(step), stepCount = steps.length) => {
    const skill = allSkills.find((candidate) => candidate.id === step.skillId)
    const time = (skill?.type === 'static' ? step.holdSeconds : step.repetitions * 3) +
      (skill?.type === 'combined' ? step.holdSeconds : 0) +
      (index < stepCount - 1 && hasRestTransition(step) ? step.restSeconds : 0)
    return `${time}s${skill?.type === 'static' || skill?.type === 'combined' ? '' : ' est.'}`
  }

  const openSkillEditor = (skill: CustomComboSkill) => {
    setEditingSkillId(skill.id)
    setCustomSkillName(skill.name)
    setCustomSkillCategory(skill.category)
    setCustomSkillType(skill.type)
    setCustomSkillDescription(skill.description)
    setSkillError('')
    setCreateSkillOpen(true)
  }

  const testSavedCombo = (combo: Pick<UserCombo, 'id' | 'name' | 'difficulty' | 'steps'>) => {
    if (!combo.steps.length) return
    setPreviewSource(combo)
    setPreviewStep(0)
  }

  const comparison = comboTemplates.find((template) => template.id === comparisonId)
  const previewedCombo = previewStep === null ? null : previewSource ?? {
    id: 'draft-preview', name: name || t('Untitled combo'), difficulty: draftDifficulty, steps,
  }

  return <section className="combo-library panel">
    <div className="panel-heading"><div><div className="eyebrow">{t('COMBO LIBRARY')}</div><h2>{t('Combo library & builder')}</h2></div><button className="button-secondary" onClick={newCombo}><Plus size={15} /> {t('New combo')}</button></div>
    <p className="combo-intro">{t('Build in order: name your combo, add skills, arrange the steps, configure targets, then save. Example combos remain available below.')}</p>
    <div className="combo-builder-summary">
      <span><strong>{steps.length}</strong> {t('steps')}</span><span>{t('Estimated total')}: <strong>~{formattedEstimate}</strong></span>
      <span>{t('Estimated repetitions use 3 seconds each; actual duration varies.')}</span>
    </div>

    <div className="combo-builder-tabs" role="tablist" aria-label={t('Combo builder sections')}>
      <button role="tab" aria-selected={builderTab === 'skills'} className={builderTab === 'skills' ? 'active' : ''} onClick={() => setBuilderTab('skills')}>{t('Skill library')}</button>
      <button role="tab" aria-selected={builderTab === 'steps'} className={builderTab === 'steps' ? 'active' : ''} onClick={() => setBuilderTab('steps')}>{t('Your combo')} · {steps.length}</button>
    </div>

    <div className="combo-builder-workspace">
      <section className={`combo-skill-browser ${builderTab === 'skills' ? 'mobile-active' : ''}`}>
        <div className="combo-builder-section-heading"><div><span className="eyebrow">{t('STEP 1 · ADD SKILLS')}</span><h3>{t('Skill library')}</h3></div><button className="button-secondary" onClick={() => { setEditingSkillId(null); setCustomSkillName(''); setCustomSkillDescription(''); setSkillError(''); setCreateSkillOpen((open) => !open) }}><Plus size={15} /> {t('Create skill')}</button></div>
        <label className="search-field combo-search"><Search size={16} /><input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder={t('Search skills…')} aria-label={t('Search skills')} /></label>
        <label className="combo-filter-label">{t('Category')}<select value={skillCategory} onChange={(event) => setSkillCategory(event.target.value as CategoryId | 'all')}>{categories.map((category) => <option key={category.id} value={category.id}>{t(category.label)}</option>)}</select></label>
        {createSkillOpen && <div className="combo-custom-skill panel">
          <div className="combo-inline-heading"><strong>{editingSkillId ? t('Edit custom skill') : t('Create custom skill')}</strong><button className="icon-button" aria-label={t('Close')} onClick={() => setCreateSkillOpen(false)}><X size={15} /></button></div>
          <label>{t('Skill name')}<input value={customSkillName} maxLength={60} onChange={(event) => setCustomSkillName(event.target.value)} placeholder={t('Skill name')} /></label>
          <label>{t('Category')}<select value={customSkillCategory} onChange={(event) => setCustomSkillCategory(event.target.value as CategoryId)}>{categories.filter((category) => category.id !== 'all').map((category) => <option key={category.id} value={category.id}>{t(category.label)}</option>)}</select></label>
          <label>{t('Skill type')}<select value={customSkillType} onChange={(event) => setCustomSkillType(event.target.value as SkillType)}><option value="static">{t('static')}</option><option value="dynamic">{t('dynamic')}</option><option value="combined">{t('combined')}</option><option value="transition">{t('transition')}</option></select></label>
          <label>{t('Description')}<input value={customSkillDescription} maxLength={140} onChange={(event) => setCustomSkillDescription(event.target.value)} placeholder={t('Optional description')} /></label>
          {skillError && <p className="combo-save-error" role="alert">{skillError}</p>}
          <button className="button-primary" onClick={createCustomSkill}><Save size={15} /> {t(editingSkillId ? 'Save skill changes' : 'Create and add')}</button>
        </div>}
        <div className="combo-skill-results">
          {visibleSkills.map((skill) => <article className="combo-skill-option" key={skill.id}>
            <div><strong>{t(skill.name)}</strong><small>{t(skill.categoryName)} · {t(skill.type)}{skill.description ? ` · ${skill.description}` : ''}</small></div>
            <div className="combo-skill-actions">{customSkills.some((custom) => custom.id === skill.id) && <button className="icon-button" aria-label={`${t('Edit')} ${t(skill.name)}`} onClick={() => openSkillEditor(skill)}><span aria-hidden="true">✎</span></button>}<button className="button-primary combo-add-skill" onClick={() => addSkill(skill)}><Plus size={15} /> {t('Add')}</button></div>
          </article>)}
          {visibleSkills.length === 0 && <p className="muted-text">{t('No skills match this search.')}</p>}
        </div>
      </section>

      <section className={`combo-draft combo-draft-editor ${builderTab === 'steps' ? 'mobile-active' : ''}`}>
        <div className="combo-builder-section-heading"><div><span className="eyebrow">{t('STEP 2 · ARRANGE & CONFIGURE')}</span><h3>{editingId ? t('Edit saved combo') : t('Your combo')}</h3></div></div>
        <div className="combo-draft-meta"><label className="combo-name-field">{t('Combo name')}<input value={name} maxLength={70} required aria-required="true" onChange={(event) => { setName(event.target.value); setError('') }} placeholder={t('Name your sequence')} /></label><label>{t('Difficulty')}<select value={draftDifficulty} onChange={(event) => setDraftDifficulty(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((level) => <option value={level} key={level}>{t('Level')} {level}</option>)}</select></label></div>
        <div className="combo-draft-tools"><span>{steps.length} {t('steps')} · ~{formattedEstimate}</span><button className="button-secondary" disabled={!undoStack.length} onClick={() => { const previous = undoStack[undoStack.length - 1]; setSteps(previous); setUndoStack((history) => history.slice(0, -1)) }}><Undo2 size={15} /> {t('Undo')}</button><button className="button-secondary destructive-text" disabled={!steps.length} onClick={clearSteps}><Trash2 size={14} /> {t('Remove all steps')}</button></div>
        <div className="combo-step-list">
          {steps.map((step, index) => {
            const skill = allSkills.find((candidate) => candidate.id === step.skillId)
            const repsAllowed = skill?.type !== 'static'
            const holdAllowed = skill?.type === 'static' || skill?.type === 'combined'
            return <article className={`combo-step-editor panel ${draggedStepId === step.id ? 'dragging' : ''}`} key={step.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); if (draggedStepId) moveStep(draggedStepId, index); setDraggedStepId(null) }}>
              <div className="combo-step-heading"><span className="combo-step-number">{String(index + 1).padStart(2, '0')}</span><button className="combo-drag-handle" draggable aria-label={t(`Drag step ${index + 1} to reorder`)} onDragStart={(event) => { setDraggedStepId(step.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', step.id) }} onDragEnd={() => setDraggedStepId(null)}><GripVertical size={16} /></button><strong>{t(skill?.name ?? 'Unknown skill')}</strong><span className="combo-step-estimate">{formatStepTime(step, index, steps.length)}</span></div>
              <div className="combo-step-fields">
                <label>{t('Skill')}<select value={step.skillId} onChange={(event) => updateStep(step.id, { skillId: event.target.value })}>{allSkills.map((option) => <option value={option.id} key={option.id}>{t(option.name)} · {t(option.categoryName)}</option>)}</select></label>
                {repsAllowed && <label>{t('Target repetitions')}<input type="number" min="1" max="99" value={step.repetitions} onChange={(event) => updateStep(step.id, { repetitions: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} /></label>}
                {holdAllowed && <label>{t('Target hold (sec)')}<input type="number" min="1" max="600" value={Math.max(1, step.holdSeconds)} onChange={(event) => updateStep(step.id, { holdSeconds: Math.max(1, Math.min(600, Number(event.target.value) || 1)) })} /></label>}
                <label>{t('Transition')}<select value={step.transitionMode ?? (step.restSeconds > 0 ? 'rest' : 'direct')} onChange={(event) => updateStep(step.id, { transitionMode: event.target.value as 'direct' | 'rest' })}><option value="direct">{t('Direct')}</option><option value="rest">{t('Pause between steps')}</option></select></label>
                {step.transitionMode === 'rest' && <label>{t('Rest (sec)')}<input type="number" min="0" max="600" value={step.restSeconds} onChange={(event) => updateStep(step.id, { restSeconds: Math.max(0, Math.min(600, Number(event.target.value) || 0)) })} /></label>}
                <label>{t('Transition cue')}<input value={step.transition} maxLength={100} placeholder={t('Optional transition cue')} onChange={(event) => updateStep(step.id, { transition: event.target.value })} /></label>
                <label>{t('Note')}<input value={step.note} maxLength={100} placeholder={t('Optional note')} onChange={(event) => updateStep(step.id, { note: event.target.value })} /></label>
              </div>
              <div className="combo-step-actions"><button className="icon-button" aria-label={t(`Move step ${index + 1} up`)} disabled={index === 0} onClick={() => moveStep(step.id, index - 1)}><ArrowUp size={15} /></button><button className="icon-button" aria-label={t(`Move step ${index + 1} down`)} disabled={index === steps.length - 1} onClick={() => moveStep(step.id, index + 1)}><ArrowDown size={15} /></button><button className="icon-button" aria-label={t(`Duplicate step ${index + 1}`)} onClick={() => duplicateStep(step)}><Copy size={14} /></button><button className="icon-button destructive" aria-label={t(`Remove step ${index + 1}`)} onClick={() => setDraftSteps((previous) => previous.filter((candidate) => candidate.id !== step.id))}><Trash2 size={14} /></button></div>
            </article>
          })}
          {steps.length === 0 && <div className="combo-empty-steps"><strong>{t('Your combo is empty')}</strong><span>{t('Search the skill library and tap Add to begin.')}</span><button className="button-secondary" onClick={() => setBuilderTab('skills')}><Search size={15} /> {t('Browse skills')}</button></div>}
        </div>
        <div className="combo-editor-footer"><button className="button-secondary" disabled={!steps.length} onClick={() => { setPreviewSource(null); setPreviewStep(0) }}><Check size={15} /> {t('Test combo')}</button><button className="button-secondary" onClick={save}><Save size={15} /> {t('Save combo')}</button><button className="button-primary" onClick={saveAndAnalyze}><Activity size={15} /> {t('Save & analyze with camera')}</button></div>
        {error && <p className="combo-save-error" role="alert">{error}</p>}
        <div className="combo-preview combo-builder-preview"><strong>{t('Full combo preview')}</strong>{steps.length ? <ol>{steps.map((step, index) => <li key={step.id}><span>{index + 1}.</span><strong>{t(allSkills.find((skill) => skill.id === step.skillId)?.name ?? 'Unknown skill')}</strong><small>{formatStepTime(step, index, steps.length)}{step.note ? ` · ${step.note}` : ''}</small></li>)}</ol> : <p>{t('Add a skill to preview the sequence.')}</p>}</div>
      </section>
    </div>

    {previewedCombo && previewStep !== null && <div className="combo-test-backdrop" role="presentation" onClick={() => { setPreviewStep(null); setPreviewSource(null) }}>
      <section className="combo-test-modal panel" role="dialog" aria-modal="true" aria-label={t('Test combo preview')} onClick={(event) => event.stopPropagation()}>
        <div className="combo-inline-heading"><div><span className="eyebrow">{t('COMBO TEST · PREVIEW')}</span><h3>{t(previewedCombo.name)}</h3></div><button className="icon-button" aria-label={t('Close')} onClick={() => { setPreviewStep(null); setPreviewSource(null) }}><X size={16} /></button></div>
        <p className="combo-intro">{t('Preview mode only: this guides your sequence and does not start pose analysis.')}</p>
        <div className="combo-test-progress">{previewStep + 1} / {previewedCombo.steps.length}</div>
        {(() => {
          const step = previewedCombo.steps[previewStep]
          const skill = allSkills.find((candidate) => candidate.id === step?.skillId)
          return step ? <article className="combo-test-current"><span>{t(skill?.categoryName ?? '')} · {t(skill?.type ?? '')}</span><h4>{t(skill?.name ?? 'Unknown skill')}</h4><p>{t(skill?.description ?? '')}</p><strong>{formatStepTime(step, previewStep, previewedCombo.steps.length)}</strong>{step.transition && <small>{t(step.transition)}</small>}{step.note && <small>{t(step.note)}</small>}</article> : null
        })()}
        <div className="combo-editor-footer"><button className="button-secondary" disabled={previewStep === 0} onClick={() => setPreviewStep((current) => Math.max(0, (current ?? 0) - 1))}><ArrowUp size={15} /> {t('Previous')}</button><button className="button-primary" onClick={() => previewStep >= previewedCombo.steps.length - 1 ? (setPreviewStep(null), setPreviewSource(null)) : setPreviewStep(previewStep + 1)}>{previewStep >= previewedCombo.steps.length - 1 ? t('Finish preview') : t('Next step')} <ArrowRight size={15} /></button></div>
      </section>
    </div>}

    <section className="combo-examples">
      <div className="combo-builder-section-heading"><div><span className="eyebrow">{t('EXAMPLES')}</span><h3>{t('Example combos')}</h3></div><label className="combo-filter-label">{t('Difficulty')}<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">{t('All levels')}</option>{[1, 2, 3, 4, 5].map((level) => <option value={level} key={level}>{t('Level')} {level}</option>)}</select></label></div>
      <label className="search-field combo-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search combos…')} aria-label={t('Search combos')} /></label>
      <div className="combo-template-grid">{visibleTemplates.map((template) => <article className="combo-template-card panel" key={template.id}>
        <div className="combo-template-head"><span className="combo-difficulty">{t('Level')} {template.difficulty}</span><span>{t(template.category)}</span></div><h3>{t(template.name)}</h3><p>{t(template.description)}</p>
        <ol>{template.steps.map((step) => <li key={step.id}>{t(allSkills.find((skill) => skill.id === step.skillId)?.name ?? '')}{step.repetitions > 1 ? ` · ${step.repetitions} ${t('reps')}` : ''}{step.holdSeconds > 0 ? ` · ${step.holdSeconds}s` : ''}</li>)}</ol>
        <small><strong>{t('Prerequisites')}:</strong> {template.prerequisites.map(t).join(' · ')}</small>
        <div className="combo-template-actions"><button className="button-primary" onClick={() => toCameraSteps(template.name, template.steps)}><Activity size={14} /> {t('Analyze with camera')}</button><button className="button-secondary" onClick={() => loadTemplate(template.id)}><ArrowDown size={14} /> {t('Copy to builder')}</button><button className="text-button" onClick={() => setComparisonId(comparisonId === template.id ? '' : template.id)}>{comparisonId === template.id ? t('Hide comparison') : t('Compare')}</button><button className="text-button" onClick={() => onFreestyle(template.name)}>{t('Use as freestyle reference')} <ArrowRight size={14} /></button></div>
      </article>)}</div>
      {comparison && <div className="combo-comparison panel"><strong>{t('Reference sequence')}: {t(comparison.name)}</strong><ol>{comparison.steps.map((step) => <li key={step.id}>{t(allSkills.find((skill) => skill.id === step.skillId)?.name ?? '')}</li>)}</ol><p>{t('Compare the reference with your current draft below; this is a planning aid, not a movement assessment.')}</p></div>}
    </section>

    <div className="saved-combo-list"><div className="combo-builder-section-heading"><div><span className="eyebrow">{t('SAVED LOCALLY')}</span><h3>{t('Saved combos')} · {saved.length}</h3></div></div>
      {visibleSaved.map((combo) => <div className="saved-combo-row panel" key={combo.id}><div><strong>{t(combo.name)} · {t('Level')} {combo.difficulty}</strong><small>· {combo.steps.length} {t('steps')} · {combo.steps.map((step) => t(allSkills.find((skill) => skill.id === step.skillId)?.name ?? 'Unknown skill')).join(' → ')}</small></div><div><button className="text-button" onClick={() => edit(combo)}>{t('Open / rename')}</button><button className="text-button" onClick={() => duplicate(combo)}><Copy size={13} /> {t('Duplicate')}</button><button className="text-button destructive-text" onClick={() => remove(combo)}><Trash2 size={13} /> {t('Delete')}</button><button className="text-button" onClick={() => testSavedCombo(combo)}>{t('Test combo')}</button><button className="text-button" onClick={() => toCameraSteps(combo.name, combo.steps)}>{t('Analyze with camera')}</button><button className="text-button" onClick={() => onFreestyle(combo.name)}>{t('Freestyle')}</button></div></div>)}
      {visibleSaved.length === 0 && saved.length > 0 && <p className="muted-text">{t('No saved combos match this search.')}</p>}
    </div>
  </section>
}
