// Shared between the Edge Function (Deno) and the frontend/tests (Vite).
// Keep this file free of runtime-specific APIs. "zod" resolves through
// supabase/functions/deno.json in Deno and through node_modules in Vite.
import { z } from 'zod'

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** Max characters of teacher material sent to the model (keeps token usage low). */
export const MAX_MATERIAL_CHARS = 24000
export const MAX_QUESTIONS = 30

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** One question exactly as the model must return it. */
export const generatedQuestionSchema = z
  .object({
    question: z.string().transform(clean).pipe(z.string().min(5).max(500)),
    options: z
      .array(z.string().transform(clean).pipe(z.string().min(1).max(300)))
      .length(4, 'ზუსტად ოთხი პასუხი უნდა იყოს'),
    correct_index: z.number().int().min(0).max(3),
    explanation: z.string().transform(clean).pipe(z.string().min(1).max(1000)),
    topic: z.string().transform(clean).pipe(z.string().max(200)).default(''),
    objective_index: z.number().int().min(0).default(0),
    /** Per option: what choosing this WRONG option reveals (empty for the correct one). */
    // Lenient: notes are an optional extra, so a malformed list never rejects the question.
    option_notes: z
      .array(z.unknown())
      .optional()
      .transform((v) =>
        [0, 1, 2, 3].map((i) => (typeof v?.[i] === 'string' ? clean(v[i] as string).slice(0, 300) : '')),
      ),
  })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, {
    message: 'პასუხები ერთმანეთისგან უნდა განსხვავდებოდეს',
    path: ['options'],
  })

export type GeneratedQuestion = z.output<typeof generatedQuestionSchema>

/** The request the browser sends to the Edge Function. */
export const generationRequestSchema = z.object({
  mode: z.enum(['full', 'single']).default('full'),
  subject: z.string().trim().min(1).max(100),
  gradeLevel: z.string().trim().min(1).max(50),
  topic: z.string().trim().min(1).max(200),
  learningObjectives: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  researchQuestion: z.string().trim().max(1000).default(''),
  material: z.string().max(60000).default(''),
  questionCount: z.number().int().min(1).max(MAX_QUESTIONS),
  difficulty: z.enum(DIFFICULTIES),
  /** Existing question texts — used to avoid duplicates (esp. for "single"). */
  existingQuestions: z.array(z.string().max(500)).max(MAX_QUESTIONS).default([]),
  language: z.literal('ka').default('ka'),
})

export type GenerationRequest = z.input<typeof generationRequestSchema>
export type ParsedGenerationRequest = z.output<typeof generationRequestSchema>

/** JSON Schema handed to Gemini's structured output (responseJsonSchema). */
export const geminiResponseJsonSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'კითხვის ტექსტი ქართულად' },
          options: {
            type: 'array',
            items: { type: 'string' },
            minItems: 4,
            maxItems: 4,
            description: 'ზუსტად ოთხი სავარაუდო პასუხი',
          },
          correct_index: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
          topic: { type: 'string' },
          objective_index: { type: 'integer', minimum: 0 },
          option_notes: {
            type: 'array',
            items: { type: 'string' },
            minItems: 4,
            maxItems: 4,
            description:
              'თითოეული პასუხისთვის (იგივე რიგით): რა ტიპურ შეცდომას ან მცდარ წარმოდგენას ნიშნავს ამ არასწორი პასუხის არჩევა. სწორი პასუხისთვის — ცარიელი სტრიქონი.',
          },
        },
        required: ['question', 'options', 'correct_index', 'explanation', 'topic', 'objective_index', 'option_notes'],
      },
    },
  },
  required: ['questions'],
} as const

export interface ParseResult {
  questions: GeneratedQuestion[]
  /** Number of items the model returned that failed validation or were duplicates. */
  rejected: number
  issues: string[]
}

export class InvalidAiOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidAiOutputError'
  }
}

/** Strip ```json fences and leading prose that models occasionally add. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) throw new InvalidAiOutputError('EMPTY_RESPONSE')
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : trimmed
  const start = candidate.search(/[[{]/)
  if (start === -1) throw new InvalidAiOutputError('NO_JSON_FOUND')
  try {
    return JSON.parse(candidate.slice(start))
  } catch {
    // Try to cut trailing garbage after the last closing brace.
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
    if (end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    throw new InvalidAiOutputError('MALFORMED_JSON')
  }
}

const normalizeForCompare = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Validate raw model output. Invalid or duplicate questions are dropped (and
 * counted) rather than silently "fixed". Throws if nothing usable remains.
 */
export function parseGeneratedQuestions(
  raw: string | unknown,
  opts: { maxQuestions: number; objectiveCount: number; existingQuestions?: string[] },
): ParseResult {
  const data = typeof raw === 'string' ? extractJson(raw) : raw
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : null
  if (!items) throw new InvalidAiOutputError('MISSING_QUESTIONS_ARRAY')

  const seen = new Set((opts.existingQuestions ?? []).map(normalizeForCompare))
  const questions: GeneratedQuestion[] = []
  const issues: string[] = []
  let rejected = 0

  for (const [i, item] of items.entries()) {
    const result = generatedQuestionSchema.safeParse(item)
    if (!result.success) {
      rejected++
      issues.push(`#${i + 1}: ${result.error.issues.map((x) => x.message).join('; ')}`)
      continue
    }
    const q = result.data
    const key = normalizeForCompare(q.question)
    if (seen.has(key)) {
      rejected++
      issues.push(`#${i + 1}: დუბლირებული კითხვა`)
      continue
    }
    seen.add(key)
    if (q.objective_index >= opts.objectiveCount) q.objective_index = 0
    q.option_notes = q.option_notes.map((n, idx) => (idx === q.correct_index ? '' : n))
    questions.push(q)
    if (questions.length >= opts.maxQuestions) break
  }

  if (questions.length === 0) throw new InvalidAiOutputError('NO_VALID_QUESTIONS')
  return { questions, rejected, issues }
}
