import { describe, expect, it } from 'vitest'
import { computeAnalytics } from '@/features/analytics/compute'
import { buildRecommendations } from '@/features/analytics/recommendations'
import {
  buildObjectiveGroups,
  buildStudentReport,
  buildStudentReports,
  describeObjectiveGroup,
} from '@/features/analytics/students'
import type { AnswerRow, Participant, SessionQuestion } from '@/types/db'

const q = (position: number, correct: number, objective: string, topic: string, notes?: string[]): SessionQuestion => ({
  id: `q${position}`,
  session_id: 's',
  position,
  text: `კითხვა ${position + 1}`,
  explanation: 'ახსნა',
  topic,
  objective_title: objective,
  time_limit_seconds: 20,
  options: ['ჟანგბადი', 'ნახშირორჟანგი', 'კაროტინი', 'ქლოროფილი'],
  correct_index: correct,
  option_notes: notes,
})
const p = (i: number): Participant => ({
  id: `p${i}`, session_id: 's', first_name: `სახელი${i}`, last_name: `გვარი${i}`,
  total_score: 0, correct_count: 0, answered_count: 0, joined_at: '', last_seen_at: '',
})
let n = 0
const a = (pi: number, qq: SessionQuestion, sel: number): AnswerRow => ({
  id: `a${n++}`, session_id: 's', session_question_id: qq.id, participant_id: `p${pi}`, selected_index: sel,
  is_correct: sel === qq.correct_index, points: sel === qq.correct_index ? 1200 : 0, response_ms: 4000, submitted_at: '',
})

// Objective A: Q1. Objective B: Q2, Q3 (B has 2 questions → not "limited").
const Q = [
  q(0, 0, 'მიზანი A', 'პროდუქტები', ['', 'ერევა, რა შედის და რა გამოდის', '', '']),
  q(1, 3, 'მიზანი B', 'პიგმენტები', ['', '', 'პიგმენტები ერთმანეთში ერევა', '']),
  q(2, 3, 'მიზანი B', 'პიგმენტები', ['', '', 'პიგმენტები ერთმანეთში ერევა', '']),
]
const P = [1, 2, 3, 4].map(p)
const A = [
  // p1: all correct
  a(1, Q[0], 0), a(1, Q[1], 3), a(1, Q[2], 3),
  // p2: wrong on both B questions (same misconception), right on A
  a(2, Q[0], 0), a(2, Q[1], 2), a(2, Q[2], 2),
  // p3: wrong on A (note), right on B
  a(3, Q[0], 1), a(3, Q[1], 3), a(3, Q[2], 3),
  // p4: wrong on B twice, unanswered A
  a(4, Q[1], 2), a(4, Q[2], 0),
]
const analytics = computeAnalytics(Q, P, A)
const byId = (id: string) => buildStudentReport(analytics, analytics.participants.find((x) => x.id === id)!)

describe('per-student report', () => {
  it('praises a student who answered everything correctly', () => {
    const r = byId('p1')
    expect(r.mistakes).toHaveLength(0)
    expect(r.summary).toContain('ყველა კითხვას (3) სწორად')
    expect(r.strengths.map((s) => s.name).sort()).toEqual(['მიზანი A', 'მიზანი B'])
  })

  it('lists each mistake with what was chosen, the correct answer and the misconception', () => {
    const r = byId('p2')
    expect(r.mistakes).toHaveLength(2)
    expect(r.mistakes[0]).toMatchObject({ position: 1, chosenText: 'კაროტინი', correctText: 'ქლოროფილი', note: 'პიგმენტები ერთმანეთში ერევა' })
  })

  it('identifies the objective that needs work and explains why', () => {
    const r = byId('p2')
    expect(r.focus[0]).toMatchObject({ name: 'მიზანი B', correct: 0, total: 2, status: 'needs_work', limited: false })
    expect(r.summary).toContain('ყველაზე მეტად გაუჭირდა შუალედური მიზანი „მიზანი B“ — 0/2 სწორი')
    expect(r.summary).toContain('პიგმენტები ერთმანეთში ერევა')
    expect(r.recommendations.some((x) => x.startsWith('გაიმეორეთ მიზანი „მიზანი B“'))).toBe(true)
    // the same misconception twice → explained once
    expect(r.recommendations.filter((x) => x.includes('პიგმენტები ერთმანეთში ერევა'))).toHaveLength(1)
  })

  it('flags conclusions based on a single question as limited', () => {
    const r = byId('p3')
    expect(r.focus[0]).toMatchObject({ name: 'მიზანი A', status: 'needs_work', limited: true })
    expect(r.summary).toContain('მხოლოდ ერთი კითხვით შეფასებული')
  })

  it('counts unanswered questions as not yet demonstrated', () => {
    const r = byId('p4')
    expect(r.unanswered).toEqual([0])
    expect(r.objectives.find((o) => o.name === 'მიზანი A')).toMatchObject({ answered: 0, correct: 0, status: 'needs_work' })
  })

  it('handles a student who answered nothing', () => {
    const empty = computeAnalytics(Q, [p(9)], [])
    const r = buildStudentReport(empty, empty.participants[0])
    expect(r.summary).toContain('არცერთ კითხვაზე არ უპასუხია')
    expect(r.recommendations).toHaveLength(1)
    expect(r.recommendations[0]).toContain('პასუხები არ არის')
    expect(r.recommendations.some((x) => x.includes('გაიმეორეთ'))).toBe(false)
  })
})

describe('class-level groups', () => {
  const reports = buildStudentReports(analytics)
  const groups = buildObjectiveGroups(reports)

  it('separates class-wide problems from small-group ones', () => {
    const b = groups.find((g) => g.objective === 'მიზანი B')!
    expect(b.needsWork.map((s) => s.id).sort()).toEqual(['p2', 'p4'])
    expect(b.scope).toBe('class') // 2 of 4 = 50%
    const aObj = groups.find((g) => g.objective === 'მიზანი A')!
    expect(aObj.needsWork.map((s) => s.id).sort()).toEqual(['p3', 'p4'])
  })

  it('describes the scope in Georgian with the numbers', () => {
    const b = groups.find((g) => g.objective === 'მიზანი B')!
    expect(describeObjectiveGroup(b, 4)).toContain('კლასის უმეტესობას (2/4, 50%)')
    const small = { ...b, needsWork: b.needsWork.slice(0, 1), share: 0.25, scope: 'group' as const }
    expect(describeObjectiveGroup(small, 4)).toContain('დამატებითი მუშაობა სჭირდება 1 მოსწავლეს')
  })

  it('class recommendations include the misconception note as the likely reason', () => {
    const big = computeAnalytics(Q, [1, 2, 3, 4, 5, 6].map(p), [
      ...[1, 2, 3, 4, 5, 6].map((i) => a(i, Q[1], i <= 4 ? 2 : 3)),
      ...[1, 2, 3, 4, 5, 6].map((i) => a(i, Q[0], 0)),
    ])
    const recs = buildRecommendations(big)
    expect(recs.some((r) => r.detail.includes('სავარაუდო მიზეზი: პიგმენტები ერთმანეთში ერევა'))).toBe(true)
  })
})
