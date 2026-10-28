import { describe, expect, it } from 'vitest'
import {
  answerGiveAways,
  emptyQuestion,
  fromGenerated,
  fromLoaded,
  generationSettingsSchema,
  objectivesOf,
  validateQuestion,
  DEFAULT_SETTINGS,
  type DraftQuestion,
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

describe('answer shuffling', () => {
  // deterministic pseudo-random for tests
  const seq = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...emptyQuestion(),
      text: `Q${i}`,
      options: [`სწორი${i}`, `ა${i}`, `ბ${i}`, `გ${i}`] as [string, string, string, string],
      optionNotes: ['', `შენიშვნა ა${i}`, `შენიშვნა ბ${i}`, `შენიშვნა გ${i}`] as [string, string, string, string],
      correctIndex: 0,
    }))

  it('places each correct answer at an independent random position (not forced to be equal)', async () => {
    const { randomCorrectPositions } = await import('@/features/quiz/model')
    // Uneven distributions must be possible, e.g. 1×ა, 3×გ, 2×დ, 2×ბ.
    let uneven = false
    for (let seed = 1; seed < 40 && !uneven; seed++) {
      const counts = [0, 0, 0, 0]
      randomCorrectPositions(8, seq(seed)).forEach((p) => counts[p]++)
      if (counts.some((c) => c !== 2)) uneven = true
    }
    expect(uneven).toBe(true)
    // ...and over many draws all four positions are used about equally often.
    const total = [0, 0, 0, 0]
    for (let seed = 1; seed <= 500; seed++) randomCorrectPositions(8, seq(seed)).forEach((p) => total[p]++)
    for (const c of total) expect(c / 4000).toBeGreaterThan(0.2)
  })

  it('never puts every correct answer in the same position when there are 3+ questions', async () => {
    const { randomCorrectPositions } = await import('@/features/quiz/model')
    const alwaysZero = () => 0
    const out = randomCorrectPositions(5, alwaysZero)
    expect(new Set(out).size).toBeGreaterThan(1)
    for (let seed = 1; seed <= 200; seed++) expect(new Set(randomCorrectPositions(3, seq(seed))).size).toBeGreaterThan(1)
  })

  it('keeps the correct answer correct and notes attached to their options', async () => {
    const { shuffleAnswers } = await import('@/features/quiz/model')
    const out = shuffleAnswers(make(10), seq(42))
    out.forEach((q, i) => {
      expect(q.options[q.correctIndex]).toBe(`სწორი${i}`)
      expect(q.optionNotes[q.correctIndex]).toBe('')
      q.options.forEach((opt, k) => {
        if (k !== q.correctIndex) expect(q.optionNotes[k]).toBe(`შენიშვნა ${opt}`)
      })
      expect([...q.options].sort()).toEqual([`სწორი${i}`, `ა${i}`, `ბ${i}`, `გ${i}`].sort())
    })
  })

  it('moveCorrectTo puts the correct answer at the requested position', async () => {
    const { moveCorrectTo } = await import('@/features/quiz/model')
    for (const target of [0, 1, 2, 3]) {
      const q = moveCorrectTo(make(1)[0], target, seq(target + 1))
      expect(q.correctIndex).toBe(target)
      expect(q.options[target]).toBe('სწორი0')
    }
  })

  it('handles zero and one question', async () => {
    const { randomCorrectPositions } = await import('@/features/quiz/model')
    expect(randomCorrectPositions(0)).toEqual([])
    expect(randomCorrectPositions(1, seq(5))).toHaveLength(1)
  })
})

describe('answer give-away hints', () => {
  const base = { text: 'რომელი აირი გამოიყოფა ფოტოსინთეზის დროს?', correctIndex: 0 }
  it('flags a correct answer that is much longer than the others', () => {
    const q = { ...base, options: ['ჟანგბადი, რომელიც მცენარის ფოთლებიდან ჰაერში გამოდის', 'აზოტი', 'მეთანი', 'ჰელიუმი'] as DraftQuestion['options'] }
    expect(answerGiveAways(q)).toContain('longest')
  })
  it('flags a correct answer that alone repeats a word from the question', () => {
    const q = { ...base, options: ['ფოტოსინთეზური ჟანგბადი', 'აზოტი', 'მეთანი', 'ჰელიუმი'] as DraftQuestion['options'] }
    expect(answerGiveAways(q)).toContain('echo')
  })
  it('is quiet for a balanced answer set', () => {
    const q = { ...base, options: ['ჟანგბადი', 'ნახშირორჟანგი', 'აზოტი', 'წყალბადი'] as DraftQuestion['options'] }
    expect(answerGiveAways(q)).toEqual([])
  })
})
