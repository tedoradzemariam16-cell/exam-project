import { z } from 'zod'
import type { GeneratedQuestion } from '../../../supabase/functions/_shared/questionSchema.ts'
import type { LoadedQuiz } from './api'
import type { Difficulty, QuestionSource, SourceFileMeta } from '@/types/db'

export interface QuizSettings {
  title: string
  subject: string
  gradeLevel: string
  topic: string
  learningObjective: string
  /** Additional objectives, one per line (optional). */
  extraObjectives: string
  researchQuestion: string
  material: string
  sourceFiles: SourceFileMeta[]
  questionCount: number
  difficulty: Difficulty
  timePerQuestion: number
  speedBonus: boolean
  basePoints: number
  maxSpeedBonus: number
}

export interface DraftQuestion {
  /** Stable key for React lists (not a database id). */
  key: string
  text: string
  options: [string, string, string, string]
  /** Misconception note per option (ignored for the correct one). */
  optionNotes: [string, string, string, string]
  correctIndex: number
  explanation: string
  topic: string
  objectiveIndex: number | null
  timeLimitSeconds: number | null
  source: QuestionSource
}

export const MAX_MATERIAL_STORED = 60000
export const TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120]
/** Speed-bonus choices shown to the teacher; 0 = no extra points for speed. */
export const SPEED_BONUS_OPTIONS = [0, 100, 250, 500, 1000]

/** The single "speed bonus" value the editor shows (0 when the bonus is switched off). */
export function speedBonusValue(s: Pick<QuizSettings, 'speedBonus' | 'maxSpeedBonus'>): number {
  return s.speedBonus ? s.maxSpeedBonus : 0
}

/** Settings patch for a chosen speed-bonus value. */
export function speedBonusPatch(value: number): Pick<QuizSettings, 'speedBonus' | 'maxSpeedBonus'> {
  return value > 0 ? { speedBonus: true, maxSpeedBonus: value } : { speedBonus: false, maxSpeedBonus: 0 }
}

export const DEFAULT_SETTINGS: QuizSettings = {
  title: '',
  subject: '',
  gradeLevel: '',
  topic: '',
  learningObjective: '',
  extraObjectives: '',
  researchQuestion: '',
  material: '',
  sourceFiles: [],
  questionCount: 10,
  difficulty: 'medium',
  timePerQuestion: 20,
  speedBonus: true,
  basePoints: 1000,
  maxSpeedBonus: 500,
}

let keySeq = 0
export const newKey = () => `q${Date.now().toString(36)}${(keySeq++).toString(36)}`

export function emptyQuestion(): DraftQuestion {
  return {
    key: newKey(),
    text: '',
    options: ['', '', '', ''],
    optionNotes: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
    topic: '',
    objectiveIndex: 0,
    timeLimitSeconds: null,
    source: 'manual',
  }
}

/** Objectives as an ordered list: main objective first, then extra lines. */
export function objectivesOf(s: Pick<QuizSettings, 'learningObjective' | 'extraObjectives'>): string[] {
  const list = [s.learningObjective, ...s.extraObjectives.split('\n')].map((x) => x.trim()).filter(Boolean)
  return Array.from(new Set(list)).slice(0, 10)
}

const trimmed = (max: number, msg: string) => z.string().trim().max(max, msg)

/** Validation for saving a draft: only a title is required. */
export const draftSettingsSchema = z.object({
  title: trimmed(200, 'მაქსიმუმ 200 სიმბოლო').min(1, 'მიუთითეთ ქვიზის სახელი'),
  subject: trimmed(100, 'მაქსიმუმ 100 სიმბოლო'),
  gradeLevel: trimmed(50, 'მაქსიმუმ 50 სიმბოლო'),
  topic: trimmed(200, 'მაქსიმუმ 200 სიმბოლო'),
  learningObjective: trimmed(500, 'მაქსიმუმ 500 სიმბოლო'),
  extraObjectives: z
    .string()
    .refine((v) => v.split('\n').every((l) => l.trim().length <= 500), 'თითოეული მიზანი — მაქსიმუმ 500 სიმბოლო')
    .refine((v) => v.split('\n').filter((l) => l.trim()).length <= 9, 'მაქსიმუმ 9 დამატებითი მიზანი'),
  researchQuestion: trimmed(1000, 'მაქსიმუმ 1000 სიმბოლო'),
  material: z.string().max(MAX_MATERIAL_STORED, `მასალა არ უნდა აღემატებოდეს ${MAX_MATERIAL_STORED} სიმბოლოს`),
  questionCount: z.number().int().min(1, 'მინიმუმ 1').max(30, 'მაქსიმუმ 30'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  timePerQuestion: z.number().int().min(5, 'მინიმუმ 5 წამი').max(240, 'მაქსიმუმ 240 წამი'),
  speedBonus: z.boolean(),
  basePoints: z.number().int().min(0).max(10000),
  maxSpeedBonus: z.number().int().min(0).max(5000),
})

/** Extra requirements before asking the AI to generate questions. */
export const generationSettingsSchema = draftSettingsSchema.extend({
  subject: trimmed(100, 'მაქსიმუმ 100 სიმბოლო').min(1, 'მიუთითეთ საგანი'),
  gradeLevel: trimmed(50, 'მაქსიმუმ 50 სიმბოლო').min(1, 'მიუთითეთ კლასი'),
  topic: trimmed(200, 'მაქსიმუმ 200 სიმბოლო').min(1, 'მიუთითეთ თემა'),
  learningObjective: trimmed(500, 'მაქსიმუმ 500 სიმბოლო').min(1, 'მიუთითეთ შუალედური სასწავლო მიზანი'),
})

export type FieldErrors<T> = Partial<Record<keyof T, string>>

export function collectErrors<T>(result: { success: boolean; error?: z.ZodError }): FieldErrors<T> {
  const out: FieldErrors<T> = {}
  if (result.success || !result.error) return out
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof T
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** Validation of one question in the editor. Mirrors the database rules. */
export const draftQuestionSchema = z
  .object({
    text: z.string().trim().min(1, 'კითხვის ტექსტი სავალდებულოა').max(500, 'მაქსიმუმ 500 სიმბოლო'),
    options: z
      .array(z.string().trim().min(1, 'პასუხი არ უნდა იყოს ცარიელი').max(300, 'მაქსიმუმ 300 სიმბოლო'))
      .length(4, 'საჭიროა ზუსტად ოთხი პასუხი'),
    correctIndex: z.number().int().min(0, 'მონიშნეთ სწორი პასუხი').max(3, 'მონიშნეთ სწორი პასუხი'),
    optionNotes: z.array(z.string().max(300, 'შეცდომის ახსნა — მაქსიმუმ 300 სიმბოლო')).length(4),
    explanation: z.string().max(1000, 'მაქსიმუმ 1000 სიმბოლო'),
    topic: z.string().max(200, 'მაქსიმუმ 200 სიმბოლო'),
    timeLimitSeconds: z.number().int().min(5).max(240).nullable(),
  })
  .refine((q) => new Set(q.options.map((o) => o.trim().toLowerCase())).size === 4, {
    message: 'პასუხები ერთმანეთისგან უნდა განსხვავდებოდეს',
    path: ['options'],
  })

export interface QuestionIssues {
  text?: string
  options?: string
  optionIndexes?: number[]
  correctIndex?: string
  other?: string
}

export function validateQuestion(q: DraftQuestion): QuestionIssues | null {
  const r = draftQuestionSchema.safeParse(q)
  if (r.success) return null
  const issues: QuestionIssues = {}
  for (const i of r.error.issues) {
    const [field, idx] = i.path
    if (field === 'text') issues.text ??= i.message
    else if (field === 'options') {
      issues.options ??= i.message
      if (typeof idx === 'number') (issues.optionIndexes ??= []).push(idx)
    } else if (field === 'correctIndex') issues.correctIndex ??= i.message
    else issues.other ??= i.message
  }
  return issues
}

// ---------------------------------------------------------------- give-aways
// Cheap checks for answer sets where the correct option can be guessed
// without knowing the topic. Shown as hints; they never block saving.

export type GiveAway = 'longest' | 'echo'

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
/** Georgian words change endings, so compare the first 5 letters of longer words. */
const stems = (s: string) => new Set(words(s).filter((w) => w.length >= 5).map((w) => w.slice(0, 5)))

export function answerGiveAways(q: Pick<DraftQuestion, 'text' | 'options' | 'correctIndex'>): GiveAway[] {
  const correct = q.options[q.correctIndex]?.trim() ?? ''
  const wrong = q.options.filter((_, i) => i !== q.correctIndex).map((o) => o.trim())
  if (!correct || wrong.some((o) => !o)) return []
  const out: GiveAway[] = []
  const longestWrong = Math.max(...wrong.map((o) => o.length))
  if (correct.length >= longestWrong * 1.4 && correct.length - longestWrong >= 10) out.push('longest')
  const questionStems = stems(q.text)
  const shares = (o: string) => [...stems(o)].some((w) => questionStems.has(w))
  if (shares(correct) && !wrong.some(shares)) out.push('echo')
  return out
}

// ---------------------------------------------------------------- shuffling
// Language models tend to put the correct answer first. We shuffle answer
// options and give every question an independent random correct position.

export type RandomFn = () => number

/** Cryptographically random [0, 1) when available (fallback: Math.random). */
export const secureRandom: RandomFn = () => {
  try {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] / 2 ** 32
  } catch {
    return Math.random()
  }
}

function shuffled<T>(items: T[], rand: RandomFn): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Random target positions for the correct answer: each question independently
 * gets ა/ბ/გ/დ (so 8 questions may give e.g. 1×ა, 3×გ, 2×დ, 2×ბ). The only
 * thing avoided is the give-away case where 3+ questions all share one position.
 */
export function randomCorrectPositions(count: number, rand: RandomFn = secureRandom): number[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const out = Array.from({ length: count }, () => Math.min(3, Math.floor(rand() * 4)))
    if (count < 3 || new Set(out).size > 1) return out
  }
  return Array.from({ length: count }, (_, i) => i % 4)
}

/** Reorder one question's options so the correct answer lands on `target`; notes move with their options. */
export function moveCorrectTo(q: DraftQuestion, target: number, rand: RandomFn = secureRandom): DraftQuestion {
  if (q.correctIndex < 0 || q.correctIndex > 3) return q
  const wrong = shuffled([0, 1, 2, 3].filter((i) => i !== q.correctIndex), rand)
  const order: number[] = []
  for (let pos = 0, w = 0; pos < 4; pos++) order.push(pos === target ? q.correctIndex : wrong[w++])
  return {
    ...q,
    options: order.map((i) => q.options[i]) as DraftQuestion['options'],
    optionNotes: order.map((i) => q.optionNotes[i]) as DraftQuestion['optionNotes'],
    correctIndex: target,
  }
}

/** Shuffle answers of all questions; each correct answer lands on a random position. */
export function shuffleAnswers(questions: DraftQuestion[], rand: RandomFn = secureRandom): DraftQuestion[] {
  const targets = randomCorrectPositions(questions.length, rand)
  return questions.map((q, i) => moveCorrectTo(q, targets[i], rand))
}

export function fromGenerated(g: GeneratedQuestion): DraftQuestion {
  return {
    key: newKey(),
    text: g.question,
    options: [g.options[0], g.options[1], g.options[2], g.options[3]],
    optionNotes: [g.option_notes[0], g.option_notes[1], g.option_notes[2], g.option_notes[3]],
    correctIndex: g.correct_index,
    explanation: g.explanation,
    topic: g.topic,
    objectiveIndex: g.objective_index,
    timeLimitSeconds: null,
    source: 'ai',
  }
}

export function fromLoaded(loaded: LoadedQuiz): { settings: QuizSettings; questions: DraftQuestion[] } {
  const { quiz, objectives, questions } = loaded
  const objTitles = objectives.map((o) => o.title)
  const main = quiz.learning_objective || objTitles[0] || ''
  const extra = objTitles.filter((t) => t !== main)
  const settings: QuizSettings = {
    title: quiz.title,
    subject: quiz.subject,
    gradeLevel: quiz.grade_level,
    topic: quiz.topic,
    learningObjective: main,
    extraObjectives: extra.join('\n'),
    researchQuestion: quiz.research_question,
    material: quiz.source_material,
    sourceFiles: Array.isArray(quiz.source_files) ? quiz.source_files : [],
    questionCount: quiz.question_count,
    difficulty: quiz.difficulty,
    timePerQuestion: quiz.time_per_question,
    speedBonus: quiz.speed_bonus,
    basePoints: quiz.base_points,
    maxSpeedBonus: quiz.max_speed_bonus,
  }
  const finalObjectives = objectivesOf(settings)
  const drafts = questions.map<DraftQuestion>((q) => {
    const opts = q.answer_options.map((o) => o.text)
    while (opts.length < 4) opts.push('')
    const notes = q.answer_options.map((o) => o.misconception ?? '')
    while (notes.length < 4) notes.push('')
    const correct = q.answer_options.findIndex((o) => o.is_correct)
    const objTitle = objectives.find((o) => o.id === q.objective_id)?.title
    const idx = objTitle ? finalObjectives.indexOf(objTitle) : -1
    return {
      key: newKey(),
      text: q.text,
      options: [opts[0], opts[1], opts[2], opts[3]],
      optionNotes: [notes[0], notes[1], notes[2], notes[3]],
      correctIndex: correct,
      explanation: q.explanation,
      topic: q.topic,
      objectiveIndex: idx >= 0 ? idx : null,
      timeLimitSeconds: q.time_limit_seconds,
      source: q.source,
    }
  })
  return { settings, questions: drafts }
}
