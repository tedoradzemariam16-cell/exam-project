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
  correctIndex: number
  explanation: string
  topic: string
  objectiveIndex: number | null
  timeLimitSeconds: number | null
  source: QuestionSource
}

export const MAX_MATERIAL_STORED = 60000
export const TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120]

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

export function fromGenerated(g: GeneratedQuestion): DraftQuestion {
  return {
    key: newKey(),
    text: g.question,
    options: [g.options[0], g.options[1], g.options[2], g.options[3]],
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
    const correct = q.answer_options.findIndex((o) => o.is_correct)
    const objTitle = objectives.find((o) => o.id === q.objective_id)?.title
    const idx = objTitle ? finalObjectives.indexOf(objTitle) : -1
    return {
      key: newKey(),
      text: q.text,
      options: [opts[0], opts[1], opts[2], opts[3]],
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
