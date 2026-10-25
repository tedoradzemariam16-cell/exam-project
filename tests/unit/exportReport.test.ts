import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { computeAnalytics } from '@/features/analytics/compute'
import { buildRecommendations } from '@/features/analytics/recommendations'
import { buildObjectiveGroups, buildStudentReports } from '@/features/analytics/students'
import { buildReportDocx, reportFilename, type ReportInput } from '@/features/analytics/exportReport'
import type { AnswerRow, GameSession, Participant, SessionQuestion } from '@/types/db'

const session: GameSession = {
  id: 's', quiz_id: null, teacher_id: 't', code: '123456', status: 'finished', current_index: 1,
  question_started_at: null, question_ends_at: null, paused_remaining_ms: null,
  title: 'ფოტოსინთეზი: ტესტი', subject: 'ბიოლოგია', grade_level: '8', topic: 'ფოტოსინთეზი',
  learning_objective: '', question_count: 2, speed_bonus: true, base_points: 1000, max_speed_bonus: 500,
  created_at: '2026-10-20T09:00:00Z', started_at: '2026-10-21T09:00:00Z', ended_at: null,
}
const q = (position: number, correct: number): SessionQuestion => ({
  id: `q${position}`, session_id: 's', position, text: `კითხვა ${position + 1}`, explanation: '',
  topic: 'პიგმენტები', objective_title: 'მიზანი A', time_limit_seconds: 20,
  options: ['ჟანგბადი', 'ნახშირორჟანგი', 'კაროტინი', 'ქლოროფილი'], correct_index: correct,
  option_notes: ['', 'ერევა, რა შედის და რა გამოდის', '', ''],
})
const p = (i: number, first: string, last: string): Participant => ({
  id: `p${i}`, session_id: 's', first_name: first, last_name: last,
  total_score: 0, correct_count: 0, answered_count: 0, joined_at: '', last_seen_at: '',
})
const a = (pi: number, qq: SessionQuestion, sel: number): AnswerRow => ({
  id: `a${pi}${qq.id}`, session_id: 's', session_question_id: qq.id, participant_id: `p${pi}`, selected_index: sel,
  is_correct: sel === qq.correct_index, points: sel === qq.correct_index ? 1200 : 0, response_ms: 4000, submitted_at: '',
})

function input(scope: 'all' | 'class' | 'p1'): ReportInput {
  const Q = [q(0, 0), q(1, 3)]
  const analytics = computeAnalytics(Q, [p(1, 'ნინო', 'ბერიძე'), p(2, 'გიორგი', 'კაპანაძე')], [a(1, Q[0], 1), a(1, Q[1], 3), a(2, Q[0], 0), a(2, Q[1], 3)])
  const reports = buildStudentReports(analytics)
  return {
    session, teacherName: 'მასწავლებელი', analytics, groups: buildObjectiveGroups(reports),
    recommendations: buildRecommendations(analytics), allStudents: reports,
    students: scope === 'all' ? reports : scope === 'class' ? [] : reports.filter((r) => r.id === scope),
    includeClass: scope !== 'p1',
  }
}

describe('reportFilename', () => {
  it('names the file after the quiz, scope and date without unsafe characters', () => {
    expect(reportFilename(input('all'), 'pdf')).toBe('ფოტოსინთეზი_ტესტი_ანგარიში_2026-10-21.pdf')
    expect(reportFilename(input('class'), 'docx')).toBe('ფოტოსინთეზი_ტესტი_ანგარიში_კლასი_2026-10-21.docx')
    expect(reportFilename(input('p1'), 'docx')).toBe('ფოტოსინთეზი_ტესტი_ანგარიში_ნინო_ბერიძე_2026-10-21.docx')
  })
})

describe('buildReportDocx', () => {
  async function text(i: ReportInput) {
    const blob = await buildReportDocx(i)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    return zip.file('word/document.xml')!.async('string')
  }

  it('builds a Word document with the class summary, students and mistake notes', async () => {
    const xml = await text(input('all'))
    expect(xml).toContain('კლასის შეჯამება')
    expect(xml).toContain('ნინო ბერიძე')
    expect(xml).toContain('გიორგი კაპანაძე')
    expect(xml).toContain('ერევა, რა შედის და რა გამოდის')
    expect(xml).toContain('რეკომენდაციები მასწავლებლისთვის')
  })

  it('respects the chosen scope', async () => {
    const one = await text(input('p1'))
    expect(one).not.toContain('კლასის შეჯამება')
    expect(one).toContain('ნინო ბერიძე')
    expect(one).not.toContain('გიორგი კაპანაძე')
    const cls = await text(input('class'))
    expect(cls).toContain('კლასის შეჯამება')
    expect(cls).not.toContain('რეკომენდაციები მასწავლებლისთვის')
  })
})
