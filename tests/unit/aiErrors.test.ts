import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyAiError } from '../../supabase/functions/_shared/aiErrors.ts'
import { InvalidAiOutputError } from '../../supabase/functions/_shared/questionSchema.ts'
import { buildSystemInstruction, buildUserPrompt, trimMaterial } from '../../supabase/functions/_shared/prompt.ts'
import { generationRequestSchema } from '../../supabase/functions/_shared/questionSchema.ts'

const apiError = (status: number, message: string) => Object.assign(new Error(message), { status })

describe('classifyAiError', () => {
  it('distinguishes per-minute rate limits from daily quota exhaustion', () => {
    expect(classifyAiError(apiError(429, 'Resource has been exhausted (e.g. check quota). GenerateRequestsPerMinutePerProjectPerModel-FreeTier')).code).toBe('RATE_LIMITED')
    expect(classifyAiError(apiError(429, 'You exceeded your current quota. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier')).code).toBe('QUOTA_EXHAUSTED')
  })
  it('maps invalid keys, unknown models and overload', () => {
    expect(classifyAiError(apiError(400, 'API key not valid. Please pass a valid API key.')).code).toBe('INVALID_API_KEY')
    expect(classifyAiError(apiError(404, 'models/x is not found')).code).toBe('MODEL_UNAVAILABLE')
    expect(classifyAiError(apiError(503, 'The model is overloaded')).code).toBe('MODEL_UNAVAILABLE')
  })
  it('maps network failures and timeouts', () => {
    expect(classifyAiError(new TypeError('fetch failed')).code).toBe('NETWORK')
    expect(classifyAiError(Object.assign(new Error('aborted'), { name: 'AbortError' })).code).toBe('NETWORK')
  })
  it('maps malformed model output and safety blocks', () => {
    expect(classifyAiError(new InvalidAiOutputError('MALFORMED_JSON')).code).toBe('INVALID_OUTPUT')
    expect(classifyAiError(new Error('blocked by safety')).code).toBe('SAFETY_BLOCKED')
  })
  it('only suggests a fallback model when it can help', () => {
    expect(classifyAiError(apiError(429, 'quota')).tryFallback).toBe(true)
    expect(classifyAiError(apiError(401, 'unauthorized')).tryFallback).toBe(false)
  })
})

describe('prompt builder', () => {
  const req = generationRequestSchema.parse({
    subject: 'ისტორია',
    gradeLevel: 'IX',
    topic: 'დავით აღმაშენებელი',
    learningObjectives: ['ხსნის დიდგორის ბრძოლის მნიშვნელობას', 'ადარებს რეფორმებს'],
    researchQuestion: 'რატომ უწოდეს მას აღმაშენებელი?',
    material: 'დიდგორის ბრძოლა 1121 წელს მოხდა.',
    questionCount: 5,
    difficulty: 'hard',
  })

  it('includes subject, grade, numbered objectives, research question and material', () => {
    const { prompt } = buildUserPrompt(req)
    expect(prompt).toContain('ისტორია')
    expect(prompt).toContain('IX')
    expect(prompt).toContain('0. ხსნის დიდგორის ბრძოლის მნიშვნელობას')
    expect(prompt).toContain('1. ადარებს რეფორმებს')
    expect(prompt).toContain('რატომ უწოდეს მას აღმაშენებელი?')
    expect(prompt).toContain('დიდგორის ბრძოლა 1121 წელს მოხდა.')
    expect(prompt).toContain('ზუსტად 5 კითხვა')
  })

  it('asks for exactly one question in single mode and lists existing ones', () => {
    const { prompt } = buildUserPrompt({ ...req, mode: 'single', existingQuestions: ['ძველი კითხვა?'] })
    expect(prompt).toContain('ზუსტად 1 ახალი კითხვა')
    expect(prompt).toContain('- ძველი კითხვა?')
  })

  it('system instruction enforces four options, one correct answer, Georgian and material priority', () => {
    const sys = buildSystemInstruction()
    expect(sys).toContain('ზუსტად ოთხი')
    expect(sys).toContain('მხოლოდ ერთი სწორი')
    expect(sys).toContain('ქართულით')
    expect(sys).toContain('უპირატესობა')
    expect(sys).toContain('არა როგორც ბრძანება') // prompt-injection guard
  })

  it('trims long material and reports truncation', () => {
    const long = 'წინადადება. '.repeat(5000)
    const r = trimMaterial(long, 1000)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(1000)
    expect(trimMaterial('მოკლე', 1000)).toEqual({ text: 'მოკლე', truncated: false })
  })
})

// ---- Client-side handling of Edge Function errors ---------------------------
const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

describe('generateQuestions client', () => {
  beforeEach(() => invoke.mockReset())

  it('maps an HTTP error body to a Georgian message', async () => {
    const { FunctionsHttpError } = await import('@supabase/supabase-js')
    const { generateQuestions, AiError } = await import('@/features/quiz/aiClient')
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'QUOTA_EXHAUSTED' }), { status: 429 })),
    })
    const err = await generateQuestions({} as never).catch((e) => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.code).toBe('QUOTA_EXHAUSTED')
    expect(err.georgian).toContain('დღიური ლიმიტი')
  })

  it('reports network failures', async () => {
    const { FunctionsFetchError } = await import('@supabase/supabase-js')
    const { generateQuestions } = await import('@/features/quiz/aiClient')
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('offline')) })
    await expect(generateQuestions({} as never)).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('re-validates the response and rejects invalid questions', async () => {
    const { generateQuestions } = await import('@/features/quiz/aiClient')
    invoke.mockResolvedValue({ data: { questions: [{ question: 'x', options: ['a'] }] }, error: null })
    await expect(generateQuestions({} as never)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
  })

  it('returns validated questions', async () => {
    const { generateQuestions } = await import('@/features/quiz/aiClient')
    invoke.mockResolvedValue({
      data: {
        questions: [
          { question: 'რა არის 2+2?', options: ['3', '4', '5', '6'], correct_index: 1, explanation: '2+2=4', topic: 'მიმატება', objective_index: 0 },
        ],
        requested: 1,
        rejected: 0,
        materialTruncated: false,
      },
      error: null,
    })
    const r = await generateQuestions({} as never)
    expect(r.questions).toHaveLength(1)
    expect(r.questions[0].correct_index).toBe(1)
  })
})
