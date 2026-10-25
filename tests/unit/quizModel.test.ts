import { describe, expect, it } from 'vitest'
import {
  emptyQuestion,
  fromGenerated,
  fromLoaded,
  generationSettingsSchema,
  objectivesOf,
  validateQuestion,
  DEFAULT_SETTINGS,
} from '@/features/quiz/model'
import { removeFileBlock, validateFile, extractText, ExtractError, normalizeText } from '@/features/quiz/extractText'
import { toGeorgianMessage } from '@/lib/errors'
import type { LoadedQuiz } from '@/features/quiz/api'

const filled = () => ({
  ...emptyQuestion(),
  text: 'რა არის 2+2?',
  options: ['3', '4', '5', '6'] as [string, string, string, string],
  correctIndex: 1,
})

describe('validateQuestion', () => {
  it('accepts a complete question', () => {
    expect(validateQuestion(filled())).toBeNull()
  })
  it('requires question text', () => {
    expect(validateQuestion({ ...filled(), text: ' ' })?.text).toBeTruthy()
  })
  it('requires all four options to be filled and different', () => {
    const empty = validateQuestion({ ...filled(), options: ['3', '', '5', '6'] })
    expect(empty?.optionIndexes).toEqual([1])
    expect(validateQuestion({ ...filled(), options: ['3', '3', '5', '6'] })?.options).toContain('განსხვავდებოდეს')
  })
  it('requires exactly one correct answer selected', () => {
    expect(validateQuestion({ ...filled(), correctIndex: -1 })?.correctIndex).toBeTruthy()
  })
})

describe('quiz settings', () => {
  it('lists the main objective first and removes blanks/duplicates', () => {
    expect(objectivesOf({ learningObjective: 'მთავარი', extraObjectives: '\nმეორე\nმთავარი\n  \nმესამე' })).toEqual([
      'მთავარი',
      'მეორე',
      'მესამე',
    ])
  })
  it('requires subject, grade, topic and objective before AI generation', () => {
    const r = generationSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, title: 'ქვიზი' })
    expect(r.success).toBe(false)
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0])
    expect(fields).toEqual(expect.arrayContaining(['subject', 'gradeLevel', 'topic', 'learningObjective']))
  })
  it('converts AI output into an editable draft marked as AI', () => {
    const d = fromGenerated({
      question: 'კითხვა?',
      options: ['ა', 'ბ', 'გ', 'დ'],
      correct_index: 2,
      explanation: 'ახსნა',
      topic: 'თემა',
      objective_index: 1,
      option_notes: ['', '', '', 'ერევა ცნებები'],
    })
    expect(d).toMatchObject({ text: 'კითხვა?', correctIndex: 2, objectiveIndex: 1, source: 'ai' })
  })
  it('maps loaded questions back to objectives by title', () => {
    const loaded = {
      quiz: { ...({} as LoadedQuiz['quiz']), title: 't', learning_objective: 'A', source_files: [], difficulty: 'easy' },
      objectives: [
        { id: 'o1', quiz_id: 'z', position: 0, title: 'A' },
        { id: 'o2', quiz_id: 'z', position: 1, title: 'B' },
      ],
      questions: [
        {
          id: 'q', quiz_id: 'z', objective_id: 'o2', position: 0, text: 'Q', explanation: '', topic: '', time_limit_seconds: null, source: 'manual',
          answer_options: [0, 1, 2, 3].map((i) => ({ id: `${i}`, question_id: 'q', position: i, text: `o${i}`, is_correct: i === 3 })),
        },
      ],
    } as unknown as LoadedQuiz
    const { settings, questions } = fromLoaded(loaded)
    expect(settings.extraObjectives).toBe('B')
    expect(questions[0]).toMatchObject({ objectiveIndex: 1, correctIndex: 3 })
  })
})

describe('file handling', () => {
  it('validates file type and size', () => {
    expect(validateFile({ name: 'a.pdf', size: 100 })).toBeNull()
    expect(validateFile({ name: 'a.DOCX', size: 100 })).toBeNull()
    expect(validateFile({ name: 'a.doc', size: 100 })).toBe('LEGACY_DOC')
    expect(validateFile({ name: 'a.exe', size: 100 })).toBe('UNSUPPORTED_TYPE')
    expect(validateFile({ name: 'a.txt', size: 0 })).toBe('EMPTY_FILE')
    expect(validateFile({ name: 'a.txt', size: 11 * 1024 * 1024 })).toBe('FILE_TOO_LARGE')
  })

  it('extracts text from TXT files', async () => {
    const file = new File(['ფოტოსინთეზი არის პროცესი, რომლის დროსაც მცენარე სინათლეს იყენებს.'], 'lesson.txt', { type: 'text/plain' })
    const r = await extractText(file)
    expect(r.text).toContain('ფოტოსინთეზი')
    expect(r.chars).toBe(r.text.length)
  })

  it('reports files without usable text instead of pretending they were processed', async () => {
    const file = new File(['12 34 ...'], 'scan.txt', { type: 'text/plain' })
    await expect(extractText(file)).rejects.toBeInstanceOf(ExtractError)
    await expect(extractText(file)).rejects.toMatchObject({ code: 'NO_TEXT_FOUND' })
  })

  it('removes a file block from the material', () => {
    const m = 'ჩემი ტექსტი\n\n=== ფაილი: a.txt ===\nშიგთავსი\n=== ფაილის დასასრული ===\n\nდანარჩენი'
    expect(removeFileBlock(m, 'a.txt')).toBe('ჩემი ტექსტი\n\nდანარჩენი')
  })

  it('normalises whitespace', () => {
    expect(normalizeText('a\r\n\r\n\r\n\r\nb  c')).toBe('a\n\nb c')
  })
})

describe('Georgian error messages', () => {
  it('translates database error codes', () => {
    expect(toGeorgianMessage({ message: 'TOO_LATE' })).toContain('დრო ამოიწურა')
    expect(toGeorgianMessage(new Error('ALREADY_ANSWERED'))).toContain('უკვე უპასუხეთ')
    expect(toGeorgianMessage({ message: 'QUESTION_STILL_ACTIVE' })).toContain('ტაიმერის')
  })
  it('never shows raw internal messages', () => {
    expect(toGeorgianMessage(new Error('relation "x" does not exist'))).toBe('დაფიქსირდა შეცდომა. სცადეთ თავიდან.')
    expect(toGeorgianMessage(new TypeError('Failed to fetch'))).toContain('ქსელთან')
  })
})
