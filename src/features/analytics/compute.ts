// Deterministic learning analytics computed from one session's raw data.
// No AI is involved: every number shown to the teacher comes from here.

import type { AnswerRow, Participant, SessionQuestion } from '@/types/db'

/** Below these thresholds we say "not enough evidence" instead of concluding anything. */
export const MIN_RESPONSES_PER_QUESTION = 3
export const MIN_RESPONSES_PER_GROUP = 5
export const WEAK_THRESHOLD = 0.5
export const STRONG_THRESHOLD = 0.75
export const DIFFICULT_THRESHOLD = 0.4
/** A wrong option chosen by at least this share of respondents is a "common mistake". */
export const MISCONCEPTION_SHARE = 0.3

export type Mastery = 'strong' | 'developing' | 'weak' | 'insufficient'

export interface Overview {
  participantCount: number
  questionCount: number
  answerCount: number
  expectedAnswers: number
  correctCount: number
  /** correct / submitted answers */
  correctRate: number | null
  /** submitted / (participants × questions) */
  responseRate: number | null
  /** share of participants who answered every question */
  completionRate: number | null
  averageScore: number | null
  medianScore: number | null
  highestScore: number | null
  lowestScore: number | null
  averageResponseMs: number | null
}

export interface QuestionStat {
  id: string
  position: number
  text: string
  topic: string
  objective: string
  options: string[]
  correctIndex: number
  responses: number
  noAnswer: number
  correct: number
  correctRate: number | null
  /** count per option index 0..3 */
  distribution: [number, number, number, number]
  topWrongIndex: number | null
  topWrongCount: number
  topWrongShare: number | null
  averageResponseMs: number | null
  lowEvidence: boolean
  difficult: boolean
  possiblyAmbiguous: boolean
  misconception: boolean
}

export interface GroupStat {
  name: string
  questionCount: number
  responses: number
  correct: number
  correctRate: number | null
  mastery: Mastery
  /** positions (0-based) of questions in this group, hardest first */
  questionPositions: number[]
}

export interface ParticipantRow {
  id: string
  rank: number
  firstName: string
  lastName: string
  score: number
  correct: number
  answered: number
  accuracy: number | null
  /** selected option index per question position, null = no answer */
  selections: (number | null)[]
}

export interface SessionAnalytics {
  overview: Overview
  questions: QuestionStat[]
  objectives: GroupStat[]
  topics: GroupStat[]
  participants: ParticipantRow[]
  /** score histogram buckets */
  scoreBuckets: { label: string; count: number }[]
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null)

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function masteryOf(rate: number | null, responses: number): Mastery {
  if (rate === null || responses < MIN_RESPONSES_PER_GROUP) return 'insufficient'
  if (rate >= STRONG_THRESHOLD) return 'strong'
  if (rate < WEAK_THRESHOLD) return 'weak'
  return 'developing'
}

export function computeQuestionStat(q: SessionQuestion, answers: AnswerRow[], participantCount: number): QuestionStat {
  const mine = answers.filter((a) => a.session_question_id === q.id)
  const distribution: [number, number, number, number] = [0, 0, 0, 0]
  for (const a of mine) if (a.selected_index >= 0 && a.selected_index <= 3) distribution[a.selected_index]++
  const responses = mine.length
  const correct = mine.filter((a) => a.is_correct).length
  let topWrongIndex: number | null = null
  let topWrongCount = 0
  distribution.forEach((count, i) => {
    if (i !== q.correct_index && count > topWrongCount) {
      topWrongCount = count
      topWrongIndex = i
    }
  })
  const correctRate = ratio(correct, responses)
  const topWrongShare = ratio(topWrongCount, responses)
  const lowEvidence = responses < MIN_RESPONSES_PER_QUESTION
  const misconception = !lowEvidence && topWrongShare !== null && topWrongShare >= MISCONCEPTION_SHARE
  return {
    id: q.id,
    position: q.position,
    text: q.text,
    topic: q.topic,
    objective: q.objective_title,
    options: q.options,
    correctIndex: q.correct_index,
    responses,
    noAnswer: Math.max(0, participantCount - responses),
    correct,
    correctRate,
    distribution,
    topWrongIndex,
    topWrongCount,
    topWrongShare,
    averageResponseMs: responses ? mine.reduce((s, a) => s + a.response_ms, 0) / responses : null,
    lowEvidence,
    difficult: !lowEvidence && correctRate !== null && correctRate < DIFFICULT_THRESHOLD,
    // A wrong option chosen at least as often as the right one suggests ambiguity
    // (or a very common misconception) — the teacher should review the wording.
    possiblyAmbiguous: !lowEvidence && topWrongCount > 0 && topWrongCount >= correct && misconception,
    misconception,
  }
}

function groupBy(questions: QuestionStat[], key: (q: QuestionStat) => string): GroupStat[] {
  const map = new Map<string, QuestionStat[]>()
  for (const q of questions) {
    const k = key(q).trim()
    if (!k) continue
    map.set(k, [...(map.get(k) ?? []), q])
  }
  return [...map.entries()]
    .map(([name, qs]) => {
      const responses = qs.reduce((s, q) => s + q.responses, 0)
      const correct = qs.reduce((s, q) => s + q.correct, 0)
      const correctRate = ratio(correct, responses)
      return {
        name,
        questionCount: qs.length,
        responses,
        correct,
        correctRate,
        mastery: masteryOf(correctRate, responses),
        questionPositions: [...qs]
          .sort((a, b) => (a.correctRate ?? 1) - (b.correctRate ?? 1))
          .map((q) => q.position),
      }
    })
    .sort((a, b) => (a.correctRate ?? 2) - (b.correctRate ?? 2))
}

export function computeAnalytics(
  questions: SessionQuestion[],
  participants: Participant[],
  answers: AnswerRow[],
): SessionAnalytics {
  const sortedQ = [...questions].sort((a, b) => a.position - b.position)
  const participantIds = new Set(participants.map((p) => p.id))
  // Ignore answers of removed participants.
  const valid = answers.filter((a) => participantIds.has(a.participant_id))
  const qStats = sortedQ.map((q) => computeQuestionStat(q, valid, participants.length))

  // Participant rows — computed from answers, not trusted totals.
  const byParticipant = new Map<string, AnswerRow[]>()
  for (const a of valid) byParticipant.set(a.participant_id, [...(byParticipant.get(a.participant_id) ?? []), a])
  const positionOf = new Map(sortedQ.map((q, i) => [q.id, i]))
  const rows = participants.map((p) => {
    const list = byParticipant.get(p.id) ?? []
    const selections: (number | null)[] = sortedQ.map(() => null)
    for (const a of list) {
      const i = positionOf.get(a.session_question_id)
      if (i !== undefined) selections[i] = a.selected_index
    }
    const correct = list.filter((a) => a.is_correct).length
    return {
      id: p.id,
      rank: 0,
      firstName: p.first_name,
      lastName: p.last_name,
      score: list.reduce((s, a) => s + a.points, 0),
      correct,
      answered: list.length,
      accuracy: ratio(correct, list.length),
      selections,
    }
  })
  rows.sort((a, b) => b.score - a.score || b.correct - a.correct || a.lastName.localeCompare(b.lastName, 'ka'))
  // Competition ranking: equal scores share a rank (1, 2, 2, 4).
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1
  })

  const scores = rows.map((r) => r.score)
  const answerCount = valid.length
  const correctCount = valid.filter((a) => a.is_correct).length
  const expected = participants.length * sortedQ.length

  const overview: Overview = {
    participantCount: participants.length,
    questionCount: sortedQ.length,
    answerCount,
    expectedAnswers: expected,
    correctCount,
    correctRate: ratio(correctCount, answerCount),
    responseRate: ratio(answerCount, expected),
    completionRate:
      participants.length > 0 && sortedQ.length > 0
        ? rows.filter((r) => r.answered >= sortedQ.length).length / participants.length
        : null,
    averageScore: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null,
    medianScore: median(scores),
    highestScore: scores.length ? Math.max(...scores) : null,
    lowestScore: scores.length ? Math.min(...scores) : null,
    averageResponseMs: answerCount ? valid.reduce((s, a) => s + a.response_ms, 0) / answerCount : null,
  }

  return {
    overview,
    questions: qStats,
    objectives: groupBy(qStats, (q) => q.objective),
    topics: groupBy(qStats, (q) => q.topic),
    participants: rows,
    scoreBuckets: scoreHistogram(scores),
  }
}

/** Five equal-width buckets between 0 and the max score. */
export function scoreHistogram(scores: number[]): { label: string; count: number }[] {
  if (scores.length === 0) return []
  const max = Math.max(...scores)
  if (max < 5) return [{ label: `0–${max}`, count: scores.length }]
  const step = Math.ceil(max / 5)
  return Array.from({ length: 5 }, (_, i) => {
    const lo = i * step
    const hi = i === 4 ? max : (i + 1) * step - 1
    return { label: `${lo}–${hi}`, count: scores.filter((s) => s >= lo && s <= hi).length }
  })
}
