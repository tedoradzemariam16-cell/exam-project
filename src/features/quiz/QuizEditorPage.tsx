import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardList,
  FilePlus2,
  Gauge,
  Info,
  PlayCircle,
  Save,
  Send,
  Sparkles,
  Target,
  Undo2,
} from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { toGeorgianMessage } from '@/lib/errors'
import { QUIZ_STATUS_LABEL, formatNumber } from '@/lib/format'
import { calculatePoints } from '@/features/game/scoring'
import type { QuizStatus } from '@/types/db'
import { loadQuiz, saveQuiz, setQuizStatus } from './api'
import { AiError, generateQuestions } from './aiClient'
import { MaterialInput } from './MaterialInput'
import { QuestionCard } from './QuestionCard'
import {
  DEFAULT_SETTINGS,
  SPEED_BONUS_OPTIONS,
  TIME_OPTIONS,
  collectErrors,
  draftSettingsSchema,
  emptyQuestion,
  fromGenerated,
  fromLoaded,
  generationSettingsSchema,
  objectivesOf,
  speedBonusPatch,
  speedBonusValue,
  validateQuestion,
  type DraftQuestion,
  type FieldErrors,
  type QuizSettings,
} from './model'

type Tab = 'settings' | 'questions' | 'publish'

export function QuizEditorPage() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [quizId, setQuizId] = useState<string | null>(routeId ?? null)
  const [loading, setLoading] = useState(Boolean(routeId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS)
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [status, setStatus] = useState<QuizStatus>('draft')
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<Tab>('settings')
  const [errors, setErrors] = useState<FieldErrors<QuizSettings>>({})
  const [showQuestionIssues, setShowQuestionIssues] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiError | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  const [askMode, setAskMode] = useState(false)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const dirtyRef = useRef(false)
  const createdHereRef = useRef<string | null>(null)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  // ---- Load existing quiz ----------------------------------------------------
  useEffect(() => {
    if (!routeId || createdHereRef.current === routeId) return
    let cancelled = false
    loadQuiz(routeId)
      .then((loaded) => {
        if (cancelled) return
        const { settings: s, questions: q } = fromLoaded(loaded)
        setSettings(s)
        setQuestions(q)
        setStatus(loaded.quiz.status)
        setQuizId(loaded.quiz.id)
        if (q.length > 0) setTab('questions')
      })
      .catch((e) => !cancelled && setLoadError(toGeorgianMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [routeId])

  // ---- Unsaved-changes protection -------------------------------------------
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const objectives = useMemo(() => objectivesOf(settings), [settings])
  const issues = useMemo(() => new Map(questions.map((q) => [q.key, validateQuestion(q)])), [questions])
  const invalidCount = [...issues.values()].filter(Boolean).length
  const unreviewedAi = questions.filter((q) => q.source === 'ai').length

  const patch = (p: Partial<QuizSettings>) => {
    setSettings((s) => ({ ...s, ...p }))
    setDirty(true)
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(p)) delete next[k as keyof QuizSettings]
      return next
    })
  }

  const setQuestionsDirty = (updater: (qs: DraftQuestion[]) => DraftQuestion[]) => {
    setQuestions(updater)
    setDirty(true)
  }

  // ---- Save -----------------------------------------------------------------
  const save = useCallback(
    async (opts: { silent?: boolean } = {}): Promise<string | null> => {
      const result = draftSettingsSchema.safeParse(settings)
      if (!result.success) {
        setErrors(collectErrors<QuizSettings>(result))
        setTab('settings')
        toast.error('შეასწორეთ მონიშნული ველები.')
        return null
      }
      if (invalidCount > 0) {
        setShowQuestionIssues(true)
        setTab('questions')
        toast.error(`${invalidCount} კითხვა საჭიროებს შესწორებას შენახვამდე.`)
        return null
      }
      setSaving(true)
      try {
        const id = await saveQuiz(quizId, settings, objectives, questions, (newId) => {
          createdHereRef.current = newId
          setQuizId(newId)
        })
        setQuizId(id)
        setDirty(false)
        dirtyRef.current = false
        if (questions.length === 0 && status === 'published') setStatus('draft')
        if (!routeId) navigate(`/app/quizzes/${id}`, { replace: true })
        if (!opts.silent) toast.success('ქვიზი შენახულია.')
        return id
      } catch (e) {
        toast.error(toGeorgianMessage(e, 'შენახვა ვერ მოხერხდა.'))
        return null
      } finally {
        setSaving(false)
      }
    },
    [settings, invalidCount, quizId, objectives, questions, status, routeId, navigate, toast],
  )

  // ---- AI generation --------------------------------------------------------
  const requestGeneration = () => {
    const result = generationSettingsSchema.safeParse(settings)
    if (!result.success) {
      setErrors(collectErrors<QuizSettings>(result))
      setTab('settings')
      toast.error('AI გენერაციისთვის შეავსეთ საგანი, კლასი, თემა და სასწავლო მიზანი.')
      return
    }
    if (questions.length > 0) setAskMode(true)
    else void runGeneration('replace')
  }

  const runGeneration = async (mode: 'replace' | 'append') => {
    setAskMode(false)
    setGenerating(true)
    setAiError(null)
    setAiNotice(null)
    try {
      const count = mode === 'append' ? Math.min(settings.questionCount, 30 - questions.length) : settings.questionCount
      if (count < 1) {
        toast.error('ქვიზში მაქსიმუმ 30 კითხვაა დასაშვები.')
        return
      }
      const res = await generateQuestions({
        mode: 'full',
        subject: settings.subject,
        gradeLevel: settings.gradeLevel,
        topic: settings.topic,
        learningObjectives: objectives,
        researchQuestion: settings.researchQuestion,
        material: settings.material,
        questionCount: count,
        difficulty: settings.difficulty,
        existingQuestions: mode === 'append' ? questions.map((q) => q.text).slice(0, 30) : [],
      })
      const generated = res.questions.map(fromGenerated)
      setQuestionsDirty((qs) => (mode === 'append' ? [...qs, ...generated] : generated))
      setReviewed(false)
      setTab('questions')
      const notes: string[] = []
      if (res.questions.length < count) {
        notes.push(`მოთხოვნილი იყო ${count}, მიღებულია ${res.questions.length} ვალიდური კითხვა.`)
      }
      if (res.rejected > 0) notes.push(`${res.rejected} არავალიდური ან დუბლირებული კითხვა გამოტოვებულია.`)
      if (res.materialTruncated) notes.push('სასწავლო მასალა ძალიან გრძელი იყო — AI-ს გადაეცა მხოლოდ მისი პირველი ნაწილი.')
      setAiNotice(notes.join(' ') || null)
      toast.success(`შეიქმნა ${generated.length} კითხვა. გადახედეთ და საჭიროებისამებრ შეასწორეთ.`)
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('UNKNOWN')
      setAiError(err)
      setTab('questions')
    } finally {
      setGenerating(false)
    }
  }

  const regenerateOne = async (key: string) => {
    const result = generationSettingsSchema.safeParse(settings)
    if (!result.success) {
      setErrors(collectErrors<QuizSettings>(result))
      setTab('settings')
      toast.error('AI გენერაციისთვის შეავსეთ საგანი, კლასი, თემა და სასწავლო მიზანი.')
      return
    }
    setRegeneratingKey(key)
    try {
      const target = questions.find((q) => q.key === key)
      const res = await generateQuestions({
        mode: 'single',
        subject: settings.subject,
        gradeLevel: settings.gradeLevel,
        topic: settings.topic,
        learningObjectives: objectives,
        researchQuestion: settings.researchQuestion,
        material: settings.material,
        questionCount: 1,
        difficulty: settings.difficulty,
        existingQuestions: questions.map((q) => q.text).filter(Boolean).slice(0, 30),
      })
      const fresh = fromGenerated(res.questions[0])
      setQuestionsDirty((qs) =>
        qs.map((q) => (q.key === key ? { ...fresh, key, timeLimitSeconds: target?.timeLimitSeconds ?? null } : q)),
      )
      setReviewed(false)
      toast.success('კითხვა განახლდა. გადახედეთ ახალ ვერსიას.')
    } catch (e) {
      toast.error(e instanceof AiError ? e.georgian : 'გენერაცია ვერ მოხერხდა.')
    } finally {
      setRegeneratingKey(null)
    }
  }

  // ---- Publish ----------------------------------------------------------------
  const publish = async () => {
    setPublishing(true)
    try {
      const id = dirty || !quizId ? await save({ silent: true }) : quizId
      if (!id) return
      await setQuizStatus(id, 'published')
      setStatus('published')
      toast.success('ქვიზი გამოქვეყნდა. ახლა შეგიძლიათ თამაშის დაწყება.')
    } catch (e) {
      toast.error(toGeorgianMessage(e, 'გამოქვეყნება ვერ მოხერხდა.'))
    } finally {
      setPublishing(false)
    }
  }

  const unpublish = async () => {
    if (!quizId) return
    try {
      await setQuizStatus(quizId, 'draft')
      setStatus('draft')
      toast.info('ქვიზი დაბრუნდა მონახაზში.')
    } catch (e) {
      toast.error(toGeorgianMessage(e))
    }
  }

  if (loading) return <PageLoader />
  if (loadError) {
    return (
      <Alert tone="error" title="ქვიზის ჩატვირთვა ვერ მოხერხდა">
        {loadError}
      </Alert>
    )
  }

  const tabs: { id: Tab; label: string; done: boolean }[] = [
    { id: 'settings', label: 'პარამეტრები', done: Boolean(settings.title.trim()) },
    { id: 'questions', label: `კითხვები (${questions.length})`, done: questions.length > 0 && invalidCount === 0 },
    { id: 'publish', label: 'გამოქვეყნება', done: status === 'published' && !dirty },
  ]

  const canPublish =
    Boolean(settings.title.trim()) && questions.length > 0 && invalidCount === 0 && (unreviewedAi === 0 || reviewed)
  const examplePoints = calculatePoints(true, settings.timePerQuestion * 500, settings.timePerQuestion * 1000, {
    speedBonus: settings.speedBonus,
    basePoints: settings.basePoints,
    maxSpeedBonus: settings.maxSpeedBonus,
  })

  return (
    <div className="pb-24">
      <PageHeader
        title={settings.title.trim() || (quizId ? 'უსახელო ქვიზი' : 'ახალი ქვიზი')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={status === 'published' ? 'green' : status === 'archived' ? 'slate' : 'amber'}>
              {QUIZ_STATUS_LABEL[status]}
            </Badge>
            {dirty && <span className="text-sm text-amber-800">შეუნახავი ცვლილებებია</span>}
          </span>
        }
        actions={
          <>
            {status === 'published' && quizId && !dirty && (
              <Button variant="accent" icon={<PlayCircle className="size-4" />} onClick={() => navigate(`/app/launch?quiz=${quizId}`)}>
                თამაშის დაწყება
              </Button>
            )}
            <Button variant="secondary" icon={<Save className="size-4" />} onClick={() => void save()} loading={saving}>
              {status === 'published' ? 'ცვლილებების შენახვა' : 'მონახაზის შენახვა'}
            </Button>
          </>
        }
      />

      <div role="tablist" aria-label="ქვიზის შექმნის ეტაპები" className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors',
              tab === t.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-hidden />
            ) : (
              <span className="hidden size-5 items-center justify-center rounded-full bg-slate-200 text-xs sm:flex">{i + 1}</span>
            )}
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------ SETTINGS */}
      {tab === 'settings' && (
        <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" className="space-y-6">
          <Card>
            <CardHeader icon={<BookOpen className="size-5" />} title="ძირითადი ინფორმაცია" />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field label="ქვიზის სახელი" error={errors.title} required className="md:col-span-2">
                <Input value={settings.title} onChange={(e) => patch({ title: e.target.value })} placeholder="მაგ.: ფოტოსინთეზი — შემაჯამებელი" />
              </Field>
              <Field label="საგანი" error={errors.subject}>
                <Input value={settings.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder="მაგ.: ბიოლოგია" />
              </Field>
              <Field label="კლასი" error={errors.gradeLevel} hint="მაგ.: VII კლასი ან 12-13 წელი">
                <Input value={settings.gradeLevel} onChange={(e) => patch({ gradeLevel: e.target.value })} placeholder="მაგ.: VII" />
              </Field>
              <Field label="თემა" error={errors.topic} className="md:col-span-2">
                <Input value={settings.topic} onChange={(e) => patch({ topic: e.target.value })} placeholder="მაგ.: მცენარის კვება და ფოტოსინთეზი" />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={<Target className="size-5" />}
              title="სასწავლო მიზნები"
              description="კითხვები და ანალიტიკა მიზნებთან იქნება დაკავშირებული."
            />
            <CardBody className="space-y-4">
              <Field
                label="შუალედური სასწავლო მიზანი"
                error={errors.learningObjective}
                hint="რა უნდა შეეძლოს მოსწავლეს? მაგ.: „ხსნის, როგორ გარდაქმნის მცენარე სინათლის ენერგიას ქიმიურ ენერგიად“"
              >
                <Textarea rows={2} value={settings.learningObjective} onChange={(e) => patch({ learningObjective: e.target.value })} />
              </Field>
              <Field
                label="დამატებითი მიზნები (არასავალდებულო)"
                error={errors.extraObjectives}
                hint="თითო მიზანი ცალკე ხაზზე. თითოეული კითხვა ერთ-ერთ მიზანს მიება."
              >
                <Textarea rows={3} value={settings.extraObjectives} onChange={(e) => patch({ extraObjectives: e.target.value })} />
              </Field>
              <Field label="საკვლევი კითხვა" error={errors.researchQuestion} hint="მაგ.: „რატომ არის ფოთლები მწვანე?“">
                <Input value={settings.researchQuestion} onChange={(e) => patch({ researchQuestion: e.target.value })} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={<FilePlus2 className="size-5" />}
              title="სასწავლო მასალა"
              description="AI კითხვებს უპირველესად ამ მასალაზე დააფუძნებს. ფაილები სერვერზე არ იტვირთება — ინახება მხოლოდ ამოღებული ტექსტი."
            />
            <CardBody>
              <MaterialInput
                material={settings.material}
                files={settings.sourceFiles}
                error={errors.material}
                onChange={(material, sourceFiles) => patch({ material, sourceFiles })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<Gauge className="size-5" />} title="თამაშისა და ქულების პარამეტრები" />
            <CardBody className="grid gap-4 md:grid-cols-3">
              <Field label="კითხვების რაოდენობა (AI)" error={errors.questionCount} hint="1–30">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.questionCount}
                  onChange={(e) => patch({ questionCount: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="სირთულე" error={errors.difficulty}>
                <Select value={settings.difficulty} onChange={(e) => patch({ difficulty: e.target.value as QuizSettings['difficulty'] })}>
                  <option value="easy">მარტივი</option>
                  <option value="medium">საშუალო</option>
                  <option value="hard">რთული</option>
                </Select>
              </Field>
              <Field label="დრო თითო კითხვაზე" error={errors.timePerQuestion}>
                <Select value={settings.timePerQuestion} onChange={(e) => patch({ timePerQuestion: Number(e.target.value) })}>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t} წამი
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ქულა სწორ პასუხზე" error={errors.basePoints}>
                <Select value={settings.basePoints} onChange={(e) => patch({ basePoints: Number(e.target.value) })}>
                  <option value={500}>500</option>
                  <option value={1000}>1000 (სტანდარტული)</option>
                  <option value={2000}>2000 (ორმაგი)</option>
                </Select>
              </Field>
              <Field
                label="ბონუსი სისწრაფისთვის"
                error={errors.maxSpeedBonus}
                hint="სწრაფად გაცემული სწორი პასუხი დამატებით ქულას იღებს"
              >
                <Select
                  value={speedBonusValue(settings)}
                  onChange={(e) => patch(speedBonusPatch(Number(e.target.value)))}
                >
                  {[...new Set([...SPEED_BONUS_OPTIONS, speedBonusValue(settings)])]
                    .sort((a, b) => a - b)
                    .map((v) => (
                      <option key={v} value={v}>
                        {v === 0 ? 'არ ემატება' : v === 500 ? 'მაქსიმუმ 500 (სტანდარტული)' : `მაქსიმუმ ${v}`}
                      </option>
                    ))}
                </Select>
              </Field>
              <p className="flex gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 md:col-span-3">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                <span>
                  არასწორი პასუხი — 0 ქულა.{' '}
                  {settings.speedBonus ? (
                    <>
                      მაგალითად, სწორი პასუხი, გაცემული დროის ნახევარზე: <strong>{formatNumber(examplePoints)}</strong> ქულა.
                    </>
                  ) : (
                    <>
                      ყველა სწორი პასუხი იღებს ზუსტად <strong>{formatNumber(settings.basePoints)}</strong> ქულას, სისწრაფის
                      მიუხედავად.
                    </>
                  )}{' '}
                  ქულებს სერვერი ითვლის.
                </span>
              </p>
            </CardBody>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setTab('questions')}>
              შემდეგი: კითხვები
            </Button>
            <Button icon={<Sparkles className="size-4" />} onClick={requestGeneration} loading={generating}>
              კითხვების გენერირება AI-ით
            </Button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- QUESTIONS */}
      {tab === 'questions' && (
        <div role="tabpanel" id="panel-questions" aria-labelledby="tab-questions" className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 bg-gradient-to-r from-brand-800 to-brand-600 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Sparkles className="size-5 text-accent-400" aria-hidden /> AI კითხვების გენერატორი
                </h2>
                <p className="mt-1 text-sm text-brand-100">
                  {settings.questionCount} კითხვა · {objectives.length} მიზანი ·{' '}
                  {settings.material ? `${formatNumber(settings.material.length)} სიმბოლო მასალა` : 'მასალის გარეშე'}
                </p>
              </div>
              <Button variant="accent" onClick={requestGeneration} loading={generating} icon={<Sparkles className="size-4" />}>
                {generating ? 'მიმდინარეობს გენერაცია…' : 'გენერირება'}
              </Button>
            </div>
            {(aiError || aiNotice || generating) && (
              <div className="space-y-3 p-4">
                {generating && (
                  <Alert tone="info">AI ამზადებს კითხვებს. ეს შეიძლება 10–40 წამს გაგრძელდეს.</Alert>
                )}
                {aiError && (
                  <Alert
                    tone={aiError.code === 'NOT_CONFIGURED' ? 'warning' : 'error'}
                    title="AI გენერაცია ვერ მოხერხდა"
                    action={
                      <Button variant="secondary" size="sm" onClick={() => setQuestionsDirty((qs) => [...qs, emptyQuestion()])}>
                        კითხვის ხელით დამატება
                      </Button>
                    }
                  >
                    {aiError.georgian}
                  </Alert>
                )}
                {aiNotice && <Alert tone="warning">{aiNotice}</Alert>}
              </div>
            )}
          </Card>

          {questions.length > 0 && unreviewedAi > 0 && (
            <Alert tone="info" title="გადახედეთ AI-ის მიერ შექმნილ კითხვებს">
              AI შეიძლება შეცდეს. გამოქვეყნებამდე შეამოწმეთ ფაქტები, სწორი პასუხი და ფორმულირება. ნებისმიერი ველი
              რედაქტირებადია.
            </Alert>
          )}

          {questions.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-8" />}
              title="კითხვები ჯერ არ არის"
              description="დააგენერირეთ კითხვები AI-ით ან დაამატეთ ხელით. თითოეულ კითხვას ოთხი პასუხი და ერთი სწორი პასუხი აქვს."
              action={
                <Button variant="secondary" onClick={() => setQuestionsDirty((qs) => [...qs, emptyQuestion()])}>
                  კითხვის ხელით დამატება
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.key}
                  index={i}
                  total={questions.length}
                  question={q}
                  objectives={objectives}
                  defaultTime={settings.timePerQuestion}
                  issues={issues.get(q.key) ?? null}
                  showIssues={showQuestionIssues}
                  aiAvailable={!aiError || aiError.code !== 'NOT_CONFIGURED'}
                  regenerating={regeneratingKey === q.key}
                  onChange={(nq) => setQuestionsDirty((qs) => qs.map((x) => (x.key === q.key ? nq : x)))}
                  onMove={(dir) =>
                    setQuestionsDirty((qs) => {
                      const next = [...qs]
                      const j = i + dir
                      if (j < 0 || j >= next.length) return qs
                      ;[next[i], next[j]] = [next[j], next[i]]
                      return next
                    })
                  }
                  onDelete={() => setDeleteKey(q.key)}
                  onRegenerate={() => void regenerateOne(q.key)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="secondary"
              disabled={questions.length >= 30}
              onClick={() => setQuestionsDirty((qs) => [...qs, emptyQuestion()])}
            >
              + კითხვის დამატება
            </Button>
            <Button
              onClick={() => {
                setShowQuestionIssues(true)
                setTab('publish')
              }}
              disabled={questions.length === 0}
            >
              შემდეგი: გამოქვეყნება
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- PUBLISH */}
      {tab === 'publish' && (
        <div role="tabpanel" id="panel-publish" aria-labelledby="tab-publish" className="space-y-5">
          <Card>
            <CardHeader icon={<Send className="size-5" />} title="გამოქვეყნებამდე შემოწმება" />
            <CardBody>
              <ul className="space-y-3">
                <CheckItem ok={Boolean(settings.title.trim())} text="ქვიზს აქვს სახელი" />
                <CheckItem ok={questions.length > 0} text={`ქვიზს აქვს კითხვები (${questions.length})`} />
                <CheckItem
                  ok={questions.length > 0 && invalidCount === 0}
                  text={
                    invalidCount === 0
                      ? 'ყველა კითხვას აქვს ოთხი პასუხი და ერთი სწორი პასუხი'
                      : `${invalidCount} კითხვა საჭიროებს შესწორებას`
                  }
                />
                <CheckItem ok={objectives.length > 0} text="მითითებულია სასწავლო მიზანი (ანალიტიკისთვის)" optional />
              </ul>
              {unreviewedAi > 0 && (
                <label className="mt-5 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand-700"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  <span>
                    გადავხედე AI-ის მიერ შექმნილ {unreviewedAi} კითხვას და ვადასტურებ, რომ ისინი სწორი და კლასისთვის
                    შესაფერისია.
                  </span>
                </label>
              )}
            </CardBody>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            {status === 'published' && (
              <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => void unpublish()}>
                მონახაზში დაბრუნება
              </Button>
            )}
            {status === 'published' && !dirty ? (
              <Button variant="accent" icon={<PlayCircle className="size-4" />} onClick={() => navigate(`/app/launch?quiz=${quizId}`)}>
                თამაშის დაწყება
              </Button>
            ) : (
              <Button icon={<Send className="size-4" />} onClick={() => void publish()} loading={publishing} disabled={!canPublish}>
                {status === 'published' ? 'შენახვა და გამოქვეყნება' : 'გამოქვეყნება'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- DIALOGS */}
      <Modal
        open={askMode}
        onClose={() => setAskMode(false)}
        title="ქვიზში უკვე არის კითხვები"
        description="როგორ დავამატოთ ახალი AI კითხვები?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskMode(false)}>
              გაუქმება
            </Button>
            <Button variant="secondary" onClick={() => void runGeneration('append')}>
              არსებულს დაემატოს
            </Button>
            <Button variant="danger" onClick={() => void runGeneration('replace')}>
              ჩანაცვლება
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={deleteKey !== null}
        onCancel={() => setDeleteKey(null)}
        onConfirm={() => {
          setQuestionsDirty((qs) => qs.filter((q) => q.key !== deleteKey))
          setDeleteKey(null)
        }}
        title="კითხვის წაშლა"
        description="წაიშალოს ეს კითხვა? ცვლილება ძალაში შევა შენახვის შემდეგ."
        confirmLabel="წაშლა"
        danger
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="შეუნახავი ცვლილებები"
        description="გაქვთ შეუნახავი ცვლილებები. გსურთ გვერდის დატოვება? ცვლილებები დაიკარგება."
        confirmLabel="დატოვება შენახვის გარეშე"
        cancelLabel="დარჩენა"
        danger
      />
    </div>
  )
}

function CheckItem({ ok, text, optional }: { ok: boolean; text: string; optional?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      {ok ? (
        <CheckCircle2 className="size-5 shrink-0 text-green-600" aria-hidden />
      ) : (
        <Circle className={cn('size-5 shrink-0', optional ? 'text-slate-300' : 'text-red-500')} aria-hidden />
      )}
      <span className={ok ? 'text-slate-800' : optional ? 'text-slate-500' : 'font-medium text-red-800'}>
        {text}
        {optional && !ok && ' (რეკომენდებული)'}
      </span>
      <span className="sr-only">{ok ? '— შესრულებულია' : '— არ არის შესრულებული'}</span>
    </li>
  )
}
