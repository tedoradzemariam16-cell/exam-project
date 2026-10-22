import { describe, expect, it } from 'vitest'
import {
  InvalidAiOutputError,
  extractJson,
  generatedQuestionSchema,
  generationRequestSchema,
  parseGeneratedQuestions,
} from '../../supabase/functions/_shared/questionSchema.ts'

const valid = {
  question: 'რომელი გაზი გამოიყოფა ფოტოსინთეზის დროს?',
  options: ['ჟანგბადი', 'აზოტი', 'მეთანი', 'ჰელიუმი'],
  correct_index: 0,
  explanation: 'ფოტოსინთეზის დროს მცენარე ჟანგბადს გამოყოფს.',
  topic: 'ფოტოსინთეზის პროდუქტები',
  objective_index: 0,
}

describe('generatedQuestionSchema', () => {
  it('accepts a well-formed question', () => {
    expect(generatedQuestionSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['three options', { ...valid, options: ['a', 'b', 'c'] }],
    ['five options', { ...valid, options: ['a', 'b', 'c', 'd', 'e'] }],
  ])('rejects %s (exactly four required)', (_label, q) => {
    expect(generatedQuestionSchema.safeParse(q).success).toBe(false)
  })

  it.each([-1, 4, 1.5])('rejects correct_index %s (exactly one valid correct answer)', (idx) => {
    expect(generatedQuestionSchema.safeParse({ ...valid, correct_index: idx }).success).toBe(false)
  })

  it('rejects duplicate options, case-insensitively', () => {
    const r = generatedQuestionSchema.safeParse({ ...valid, options: ['ჟანგბადი', 'ჟანგბადი ', 'მეთანი', 'ჰელიუმი'] })
    expect(r.success).toBe(false)
  })

  it('rejects empty option text and empty explanation', () => {
    expect(generatedQuestionSchema.safeParse({ ...valid, options: ['', 'b', 'c', 'd'] }).success).toBe(false)
    expect(generatedQuestionSchema.safeParse({ ...valid, explanation: '  ' }).success).toBe(false)
  })

  it('normalises whitespace', () => {
    const r = generatedQuestionSchema.parse({ ...valid, question: '  რომელი   გაზი\n გამოიყოფა?  ' })
    expect(r.question).toBe('რომელი გაზი გამოიყოფა?')
  })
})

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"questions":[]}')).toEqual({ questions: [] })
  })
  it('strips markdown code fences and leading prose', () => {
    expect(extractJson('აი შედეგი:\n```json\n{"questions":[1]}\n```')).toEqual({ questions: [1] })
  })
  it('tolerates trailing garbage after the JSON', () => {
    expect(extractJson('{"a":1} trailing words')).toEqual({ a: 1 })
  })
  it('throws on empty and malformed responses', () => {
    expect(() => extractJson('   ')).toThrow(InvalidAiOutputError)
    expect(() => extractJson('{"questions": [')).toThrow('MALFORMED_JSON')
    expect(() => extractJson('no json here')).toThrow('NO_JSON_FOUND')
  })
})

describe('parseGeneratedQuestions', () => {
  const opts = { maxQuestions: 10, objectiveCount: 2 }

  it('keeps valid questions and counts rejected ones', () => {
    const raw = JSON.stringify({
      questions: [valid, { ...valid, question: 'სხვა კითხვა ფოტოსინთეზზე?', options: ['a', 'b', 'c'] }],
    })
    const r = parseGeneratedQuestions(raw, opts)
    expect(r.questions).toHaveLength(1)
    expect(r.rejected).toBe(1)
  })

  it('drops duplicate questions, including ones already in the quiz', () => {
    const r = parseGeneratedQuestions(
      { questions: [valid, { ...valid }, { ...valid, question: 'ახალი კითხვა სინათლეზე?' }] },
      { ...opts, existingQuestions: ['რომელი გაზი გამოიყოფა ფოტოსინთეზის დროს'] },
    )
    expect(r.questions.map((q) => q.question)).toEqual(['ახალი კითხვა სინათლეზე?'])
    expect(r.rejected).toBe(2)
  })

  it('resets an out-of-range objective_index to 0', () => {
    const r = parseGeneratedQuestions({ questions: [{ ...valid, objective_index: 7 }] }, opts)
    expect(r.questions[0].objective_index).toBe(0)
  })

  it('never returns more questions than requested', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...valid, question: `კითხვა ნომერი ${i + 1}?` }))
    expect(parseGeneratedQuestions({ questions: many }, { ...opts, maxQuestions: 3 }).questions).toHaveLength(3)
  })

  it('throws when nothing valid remains', () => {
    expect(() => parseGeneratedQuestions({ questions: [{ foo: 1 }] }, opts)).toThrow('NO_VALID_QUESTIONS')
    expect(() => parseGeneratedQuestions({ items: [] }, opts)).toThrow('MISSING_QUESTIONS_ARRAY')
  })
})

describe('generationRequestSchema', () => {
  const base = {
    subject: 'ბიოლოგია',
    gradeLevel: 'VII',
    topic: 'ფოტოსინთეზი',
    learningObjectives: ['ახსნის ფოტოსინთეზს'],
    questionCount: 10,
    difficulty: 'medium',
  }
  it('accepts a minimal valid request and applies defaults', () => {
    const r = generationRequestSchema.parse(base)
    expect(r.mode).toBe('full')
    expect(r.language).toBe('ka')
  })
  it('rejects missing objectives, too many questions and unknown difficulty', () => {
    expect(generationRequestSchema.safeParse({ ...base, learningObjectives: [] }).success).toBe(false)
    expect(generationRequestSchema.safeParse({ ...base, questionCount: 31 }).success).toBe(false)
    expect(generationRequestSchema.safeParse({ ...base, difficulty: 'extreme' }).success).toBe(false)
  })
})
