import { describe, expect, it } from 'vitest'
import { askedQuestionCount, computeAnalytics, masteryOf, scoreHistogram } from '@/features/analytics/compute'
import { buildRecommendations } from '@/features/analytics/recommendations'
import { csvCell, resultsCsv, toCsv } from '@/features/analytics/csv'
import type { AnswerRow, Participant, SessionQuestion } from '@/types/db'

const q = (position: number, correct: number, objective: string, topic: string): SessionQuestion => ({
  id: `q${position}`,
  session_id: 's',
  position,
  text: `კითხვა ${position + 1}`,
  explanation: '',
  topic,
  objective_title: objective,
  time_limit_seconds: 20,
  options: ['ა-ვარიანტი', 'ბ-ვარიანტი', 'გ-ვარიანტი', 'დ-ვარიანტი'],
  correct_index: correct,
})

const p = (i: number): Participant => ({
  id: `p${i}`,
  session_id: 's',
  first_name: `სახელი${i}`,
  last_name: `გვარი${i}`,
  total_score: 0,
  correct_count: 0,
  answered_count: 0,
  joined_at: '2026-01-01T00:00:00Z',
  last_seen_at: '2026-01-01T00:00:00Z',
})

let n = 0
const a = (participant: number, question: SessionQuestion, selected: number, points?: number): AnswerRow => ({
  id: `a${n++}`,
  session_id: 's',
  session_question_id: question.id,
  participant_id: `p${participant}`,
  selected_index: selected,
  is_correct: selected === question.correct_index,
  points: points ?? (selected === question.correct_index ? 1200 : 0),
  response_ms: 4000,
  submitted_at: '2026-01-01T00:00:05Z',
})

// 6 students, 3 questions.
//  Q1 (objective A, correct 0): all 6 correct → strong
//  Q2 (objective B, correct 1): 1 correct, 4 chose option 2, 1 no answer → weak, ambiguous
//  Q3 (objective B, correct 3): 3 correct, 3 chose 0
const Q = [q(0, 0, 'მიზანი A', 'თემა 1'), q(1, 1, 'მიზანი B', 'თემა 2'), q(2, 3, 'მიზანი B', 'თემა 2')]
const P = [1, 2, 3, 4, 5, 6].map(p)
const A: AnswerRow[] = [
  ...[1, 2, 3, 4, 5, 6].map((i) => a(i, Q[0], 0)),
  a(1, Q[1], 1),
  ...[2, 3, 4, 5].map((i) => a(i, Q[1], 2)),
  ...[1, 2, 3].map((i) => a(i, Q[2], 3)),
  ...[4, 5, 6].map((i) => a(i, Q[2], 0)),
]

describe('computeAnalytics', () => {
  const r = computeAnalytics(Q, P, A)

  it('computes overall results', () => {
    expect(r.overview.participantCount).toBe(6)
    expect(r.overview.answerCount).toBe(17)
    expect(r.overview.correctCount).toBe(10)
    // an unanswered question counts as wrong: 10 correct of 6 × 3 expected
    expect(r.overview.correctRate).toBeCloseTo(10 / 18)
    expect(r.overview.answeredCorrectRate).toBeCloseTo(10 / 17)
    expect(r.overview.responseRate).toBeCloseTo(17 / 18)
    // p6 skipped Q2 → 5 of 6 completed every question
    expect(r.overview.completionRate).toBeCloseTo(5 / 6)
    expect(r.overview.highestScore).toBe(3600)
    expect(r.overview.lowestScore).toBe(1200)
  })

  it('computes option distribution and the most frequent wrong option', () => {
    const q2 = r.questions[1]
    expect(q2.distribution).toEqual([0, 1, 4, 0])
    expect(q2.noAnswer).toBe(1)
    expect(q2.topWrongIndex).toBe(2)
    expect(q2.topWrongShare).toBeCloseTo(4 / 5)
    expect(q2.correctRate).toBeCloseTo(1 / 6) // the student who ran out of time counts as wrong
  })

  it('flags difficult and possibly ambiguous questions', () => {
    expect(r.questions[0].difficult).toBe(false)
    expect(r.questions[1].difficult).toBe(true)
    expect(r.questions[1].possiblyAmbiguous).toBe(true)
    expect(r.questions[2].misconception).toBe(true) // 50% chose the same wrong option
  })

  it('groups performance by learning objective and topic, weakest first', () => {
    expect(r.objectives.map((o) => o.name)).toEqual(['მიზანი B', 'მიზანი A'])
    const b = r.objectives[0]
    expect(b.attempts).toBe(12)
    expect(b.correct).toBe(4)
    expect(b.mastery).toBe('weak')
    expect(r.objectives[1].mastery).toBe('strong')
    expect(r.topics[0].name).toBe('თემა 2')
  })

  it('ranks participants from their answers, with ties sharing a rank', () => {
    expect(r.participants[0]).toMatchObject({ id: 'p1', rank: 1, score: 3600, correct: 3 })
    const ranks = r.participants.map((x) => x.rank)
    expect(ranks).toEqual([1, 2, 2, 4, 4, 4]) // 3600, 2400, 2400, 1200, 1200, 1200
    expect(r.participants.find((x) => x.id === 'p6')?.selections).toEqual([0, null, 0])
  })

  it('counts a question left without an answer as wrong for the student', () => {
    const p6 = r.participants.find((x) => x.id === 'p6')!
    expect(p6).toMatchObject({ correct: 1, answered: 2, unanswered: 1 })
    expect(p6.accuracy).toBeCloseTo(1 / 3)
    // 9 of 10 right + 1 unanswered is 90%, not 100%
    const ten = Array.from({ length: 10 }, (_, i) => q(i, 0, 'მიზანი', 'თემა'))
    const r10 = computeAnalytics(ten, [p(1)], ten.slice(0, 9).map((qq) => a(1, qq, 0)))
    expect(r10.participants[0].accuracy).toBeCloseTo(0.9)
    expect(r10.overview.correctRate).toBeCloseTo(0.9)
    expect(r10.objectives[0]).toMatchObject({ attempts: 10, correct: 9 })
  })

  it('does not count questions the game never reached', () => {
    const r2 = computeAnalytics(Q, P, A.filter((x) => x.session_question_id !== 'q2'), 2)
    expect(r2.overview.askedCount).toBe(2)
    expect(r2.questions[2]).toMatchObject({ asked: false, noAnswer: 0, correctRate: null })
    expect(r2.overview.correctRate).toBeCloseTo(7 / 12)
    expect(r2.participants.find((x) => x.id === 'p1')).toMatchObject({ unanswered: 0, accuracy: 1 })
    expect(r2.objectives.find((o) => o.name === 'მიზანი B')).toMatchObject({ questionCount: 1, attempts: 6 })
  })

  it('works out how many questions were shown from the session state', () => {
    const now = Date.parse('2026-01-01T10:00:00Z')
    const s = (status: 'lobby' | 'active' | 'finished', current_index: number, ends: string | null, paused: number | null = null) => ({
      status, current_index, question_ends_at: ends, paused_remaining_ms: paused,
    })
    expect(askedQuestionCount(s('lobby', -1, null), now)).toBe(0)
    expect(askedQuestionCount(s('finished', 4, null), now)).toBe(5)
    expect(askedQuestionCount(s('active', 2, '2026-01-01T10:00:10Z'), now)).toBe(2) // Q3 still running
    expect(askedQuestionCount(s('active', 2, '2026-01-01T09:59:50Z'), now)).toBe(3) // Q3 revealed
    expect(askedQuestionCount(s('active', 2, null, 5000), now)).toBe(2) // paused mid-question
  })

  it('ignores answers of participants that were removed', () => {
    const r2 = computeAnalytics(Q, P.slice(0, 5), A)
    expect(r2.overview.answerCount).toBe(15)
  })

  it('handles an empty session without dividing by zero', () => {
    const e = computeAnalytics(Q, [], [])
    expect(e.overview.correctRate).toBeNull()
    expect(e.overview.averageScore).toBeNull()
    expect(e.objectives.every((o) => o.mastery === 'insufficient')).toBe(true)
  })
})

describe('mastery thresholds', () => {
  it('requires enough evidence', () => {
    expect(masteryOf(1, 4)).toBe('insufficient')
    expect(masteryOf(0.8, 5)).toBe('strong')
    expect(masteryOf(0.6, 5)).toBe('developing')
    expect(masteryOf(0.2, 5)).toBe('weak')
  })
})

describe('buildRecommendations', () => {
  it('recommends re-teaching the weak objective and reviewing the ambiguous question, citing numbers', () => {
    const recs = buildRecommendations(computeAnalytics(Q, P, A))
    const reteach = recs.find((x) => x.kind === 'reteach_objective')
    expect(reteach?.title).toContain('მიზანი B')
    expect(reteach?.detail).toContain('33%') // 4/12 — the unanswered one counts as wrong
    expect(recs.some((x) => x.kind === 'review_question' && x.title.includes('კითხვა 2'))).toBe(true)
    expect(recs.some((x) => x.kind === 'objective_mastered' && x.title.includes('მიზანი A'))).toBe(true)
    expect(recs[0].severity).toBe('high')
  })

  it('states insufficient evidence instead of concluding from tiny samples', () => {
    const recs = buildRecommendations(computeAnalytics(Q, P.slice(0, 2), A.filter((x) => ['p1', 'p2'].includes(x.participant_id))))
    expect(recs[0].kind).toBe('insufficient_data')
    expect(recs.some((x) => x.kind === 'reteach_objective')).toBe(false)
    expect(recs.some((x) => x.kind === 'review_question')).toBe(false)
  })
})

describe('score histogram', () => {
  it('buckets scores and covers the maximum', () => {
    const h = scoreHistogram([0, 1000, 1500, 3000, 4500])
    expect(h).toHaveLength(5)
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(5)
    expect(scoreHistogram([0, 0])).toEqual([{ label: '0–0', count: 2 }])
  })
})

describe('CSV export', () => {
  it('quotes special characters and neutralises formula injection', () => {
    expect(csvCell('ა,ბ')).toBe('"ა,ბ"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell(null)).toBe('')
  })

  it('starts with a UTF-8 BOM and includes per-question results', () => {
    const csv = resultsCsv(computeAnalytics(Q, P, A))
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('ადგილი,სახელი,გვარი,ქულა,სწორი,გაცემული პასუხი,სიზუსტე (%),კ1,კ2,კ3')
    expect(lines[1]).toBe('1,სახელი1,გვარი1,3600,3,3,100,ა ✓,ბ ✓,დ ✓')
    expect(lines).toHaveLength(7)
    expect(toCsv([['a']])).toBe('﻿a')
  })
})
