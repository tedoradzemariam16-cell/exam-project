// Per-student and class-level learning analysis, computed deterministically
// from one session's answers. Every statement cites the data it rests on;
// with too little evidence we say so instead of drawing conclusions.
// Nothing here is shown to students — it is teacher feedback only.

import { optionLabel } from '@/features/game/answerStyles'
import type { ParticipantRow, QuestionStat, SessionAnalytics } from './compute'

export type ObjectiveStatus = 'mastered' | 'partial' | 'needs_work'

export interface StudentObjective {
  name: string
  /** questions in the session that test this objective */
  total: number
  correct: number
  answered: number
  /** correct / total (unanswered counts as not yet demonstrated) */
  rate: number
  status: ObjectiveStatus
  /** fewer than 2 questions → treat the status as a hint, not a conclusion */
  limited: boolean
}

export interface StudentMistake {
  position: number
  question: string
  topic: string
  objective: string
  chosenIndex: number
  chosenText: string
  correctIndex: number
  correctText: string
  /** what choosing this wrong option reveals (from the question's notes) */
  note: string
  explanation: string
}

/** A question the student saw but left without an answer (time ran out). */
export interface StudentMissed {
  position: number
  question: string
  topic: string
  objective: string
  correctIndex: number
  correctText: string
}

export interface StudentReport {
  id: string
  name: string
  rank: number
  score: number
  correct: number
  answered: number
  total: number
  mistakes: StudentMistake[]
  /** positions of questions the student did not answer (counted as wrong) */
  unanswered: number[]
  missed: StudentMissed[]
  objectives: StudentObjective[]
  /** objectives that need work, weakest first */
  focus: StudentObjective[]
  strengths: StudentObjective[]
  /** topics (sub-themes) with at least one mistake, most mistakes first */
  weakTopics: { name: string; mistakes: number; total: number }[]
  summary: string
  recommendations: string[]
}

export const NEEDS_WORK_BELOW = 0.5
export const MASTERED_FROM = 0.75

const pct = (r: number) => `${Math.round(r * 100)}%`
const quote = (s: string, max = 80) => `„${s.length > max ? `${s.slice(0, max)}…` : s}“`

/** "კითხვა 5-ზე" / "2 კითხვაზე (№ 3, 7)" */
function questionRefs(positions: number[]): string {
  const nums = positions.map((x) => x + 1)
  return nums.length === 1 ? `კითხვა ${nums[0]}-ზე` : `${nums.length} კითხვაზე (№ ${nums.join(', ')})`
}

function statusOf(rate: number): ObjectiveStatus {
  if (rate >= MASTERED_FROM) return 'mastered'
  if (rate < NEEDS_WORK_BELOW) return 'needs_work'
  return 'partial'
}

export function buildStudentReport(a: SessionAnalytics, p: ParticipantRow): StudentReport {
  const questions = a.questions
  const mistakes: StudentMistake[] = []
  const unanswered: number[] = []
  const missed: StudentMissed[] = []
  const byObjective = new Map<string, { total: number; correct: number; answered: number }>()
  const byTopic = new Map<string, { mistakes: number; total: number }>()

  questions.forEach((q: QuestionStat, i) => {
    // Questions never shown (game ended early) say nothing about the student.
    if (!q.asked) return
    const sel = p.selections[i]
    const ok = sel !== null && sel === q.correctIndex
    if (q.objective.trim()) {
      const o = byObjective.get(q.objective) ?? { total: 0, correct: 0, answered: 0 }
      o.total++
      if (sel !== null) o.answered++
      if (ok) o.correct++
      byObjective.set(q.objective, o)
    }
    if (q.topic.trim()) {
      const t = byTopic.get(q.topic) ?? { mistakes: 0, total: 0 }
      t.total++
      if (!ok) t.mistakes++
      byTopic.set(q.topic, t)
    }
    if (sel === null) {
      unanswered.push(q.position)
      missed.push({
        position: q.position,
        question: q.text,
        topic: q.topic,
        objective: q.objective,
        correctIndex: q.correctIndex,
        correctText: q.options[q.correctIndex] ?? '',
      })
    } else if (!ok) {
      mistakes.push({
        position: q.position,
        question: q.text,
        topic: q.topic,
        objective: q.objective,
        chosenIndex: sel,
        chosenText: q.options[sel] ?? '',
        correctIndex: q.correctIndex,
        correctText: q.options[q.correctIndex] ?? '',
        note: q.optionNotes?.[sel] ?? '',
        explanation: q.explanation ?? '',
      })
    }
  })

  const objectives: StudentObjective[] = [...byObjective.entries()]
    .map(([name, o]) => {
      const rate = o.total ? o.correct / o.total : 0
      return { name, ...o, rate, status: statusOf(rate), limited: o.total < 2 }
    })
    .sort((x, y) => x.rate - y.rate)
  const focus = objectives.filter((o) => o.status !== 'mastered')
  const strengths = objectives.filter((o) => o.status === 'mastered')
  const weakTopics = [...byTopic.entries()]
    .filter(([, t]) => t.mistakes > 0)
    .map(([name, t]) => ({ name, ...t }))
    .sort((x, y) => y.mistakes / y.total - x.mistakes / x.total || y.mistakes - x.mistakes)

  const total = questions.filter((q) => q.asked).length
  const name = `${p.firstName} ${p.lastName}`.trim()

  // ---- summary (teacher-facing) --------------------------------------------
  const parts: string[] = []
  if (total === 0) {
    parts.push('ამ სესიაში კითხვები არ იყო.')
  } else if (p.answered === 0) {
    parts.push('მოსწავლეს არცერთ კითხვაზე არ უპასუხია, ამიტომ ცოდნის შეფასება შეუძლებელია.')
  } else if (mistakes.length === 0 && unanswered.length === 0) {
    parts.push(`ყველა კითხვას (${total}) სწორად უპასუხა — ამ სესიის მიზნები ათვისებულია.`)
  } else {
    parts.push(`სწორად უპასუხა ${p.correct} კითხვას ${total}-დან.`)
    const worst = focus[0]
    if (worst) {
      parts.push(
        `ყველაზე მეტად გაუჭირდა შუალედური მიზანი ${quote(worst.name)} — ${worst.correct}/${worst.total} სწორი${worst.limited ? ' (მხოლოდ ერთი კითხვით შეფასებული)' : ''}.`,
      )
    } else if (weakTopics[0] && mistakes.length) {
      parts.push(`შეცდომები ძირითადად ქვეთემაში ${quote(weakTopics[0].name)} იყო.`)
    }
    const notes = [...new Set(mistakes.map((m) => m.note).filter(Boolean))]
    if (notes.length) parts.push(`შეცდომები მიუთითებს: ${notes.slice(0, 2).map((n) => quote(n, 120)).join('; ')}.`)
    if (unanswered.length) {
      parts.push(
        `${questionRefs(unanswered)} პასუხი არ გაუცია — დრო ამოიწურა (ვერ მოასწრო ან არ იცოდა). შეფასებაში ${unanswered.length === 1 ? 'ეს კითხვა' : 'ეს კითხვები'} შეცდომად ითვლება.`,
      )
    }
    if (strengths.length) parts.push(`კარგად აქვს ათვისებული: ${strengths.map((s) => quote(s.name, 50)).join(', ')}.`)
  }
  if (p.answered > 0 && total > 0 && objectives.length > 0 && objectives.every((o) => o.limited)) {
    parts.push('დასკვნა ეფუძნება ცოტა კითხვას (თითო მიზანზე 1) — გადაამოწმეთ დამატებითი დავალებით.')
  }

  // ---- recommendations -----------------------------------------------------
  const recs: string[] = []
  if (p.answered === 0) {
    // No evidence about knowledge — only a practical note, no teaching advice.
    recs.push('პასუხები არ არის. გადაამოწმეთ, შემოუერთდა თუ არა მოსწავლე თამაშს სწორად, ან შეაფასეთ სხვა გზით.')
  }
  if (p.answered > 0 && unanswered.length) {
    const many = unanswered.length >= Math.max(2, Math.ceil(total / 3))
    recs.push(
      `${questionRefs(unanswered)} პასუხი არ გაუცია — დრო ამოიწურა. ეს შეიძლება ნიშნავდეს, რომ ვერ მოასწრო ან არ იცოდა პასუხი; ` +
        `ზეპირად ჰკითხეთ ${unanswered.length === 1 ? 'ეს კითხვა' : 'ეს კითხვები'}, რომ გაარკვიოთ.` +
        (many ? ' უპასუხო კითხვები ბევრია — შესაძლოა დრო არ ჰყოფნის (სცადეთ მეტი დრო კითხვაზე) ან თამაშს გვიან შემოუერთდა.' : ''),
    )
  }
  for (const o of p.answered === 0 ? [] : focus.filter((o) => o.status === 'needs_work')) {
    const topics = [
      ...new Set([...mistakes, ...missed].filter((m) => m.objective === o.name).map((m) => m.topic).filter(Boolean)),
    ]
    recs.push(
      `გაიმეორეთ მიზანი ${quote(o.name, 70)}${topics.length ? ` (ქვეთემა: ${topics.map((t) => quote(t, 40)).join(', ')})` : ''} და მიეცით 2–3 დამატებითი სავარჯიშო.`,
    )
  }
  for (const o of p.answered === 0 ? [] : focus.filter((o) => o.status === 'partial')) {
    recs.push(`მიზანი ${quote(o.name, 70)} ნაწილობრივ ათვისებულია — ერთი მოკლე სავარჯიშო საკმარისი იქნება განსამტკიცებლად.`)
  }
  const seenNotes = new Set<string>()
  for (const m of mistakes) {
    if (m.note && !seenNotes.has(m.note)) {
      seenNotes.add(m.note)
      recs.push(`განუმარტეთ: ${m.note.replace(/[.。]+$/, '')} (კითხვა ${m.position + 1}: აირჩია ${quote(m.chosenText, 40)}, სწორია ${quote(m.correctText, 40)}).`)
    } else if (!m.note && !objectives.length) {
      recs.push(`გადახედეთ კითხვას ${m.position + 1}: აირჩია ${quote(m.chosenText, 40)}, სწორია ${quote(m.correctText, 40)}.`)
    }
  }
  if (recs.length === 0 && p.answered > 0) {
    recs.push(strengths.length ? 'შესთავაზეთ უფრო რთული დავალებები ან შემდეგი თემა.' : 'განსაკუთრებული ჩარევა არ არის საჭირო.')
  }

  return {
    id: p.id,
    name,
    rank: p.rank,
    score: p.score,
    correct: p.correct,
    answered: p.answered,
    total,
    mistakes,
    unanswered,
    missed,
    objectives,
    focus,
    strengths,
    weakTopics,
    summary: parts.join(' '),
    recommendations: recs.slice(0, 6),
  }
}

export function buildStudentReports(a: SessionAnalytics): StudentReport[] {
  return a.participants.map((p) => buildStudentReport(a, p))
}

// ---------------------------------------------------------------- class view

export interface ObjectiveGroup {
  objective: string
  /** students for whom this objective needs work (rate < 50%) */
  needsWork: { id: string; name: string; correct: number; total: number }[]
  partial: { id: string; name: string }[]
  mastered: number
  /** share of the class that needs work on this objective */
  share: number
  scope: 'class' | 'group' | 'none'
}

/**
 * Who needs what: for each objective, the students who need work on it,
 * and whether it is a class-wide issue (≥ 50% of students) or a small group.
 */
export function buildObjectiveGroups(reports: StudentReport[]): ObjectiveGroup[] {
  const active = reports.filter((r) => r.answered > 0)
  const names = new Set(active.flatMap((r) => r.objectives.map((o) => o.name)))
  return [...names]
    .map((objective) => {
      const needsWork: ObjectiveGroup['needsWork'] = []
      const partial: ObjectiveGroup['partial'] = []
      let mastered = 0
      for (const r of active) {
        const o = r.objectives.find((x) => x.name === objective)
        if (!o) continue
        if (o.status === 'needs_work') needsWork.push({ id: r.id, name: r.name, correct: o.correct, total: o.total })
        else if (o.status === 'partial') partial.push({ id: r.id, name: r.name })
        else mastered++
      }
      const share = active.length ? needsWork.length / active.length : 0
      const scope: ObjectiveGroup['scope'] = needsWork.length === 0 ? 'none' : share >= 0.5 ? 'class' : 'group'
      return { objective, needsWork, partial, mastered, share, scope }
    })
    .sort((x, y) => y.share - x.share)
}

/** One-line class-level conclusion per objective (Georgian, data-backed). */
export function describeObjectiveGroup(g: ObjectiveGroup, classSize: number): string {
  if (g.scope === 'none') return `${quote(g.objective, 70)} — დამატებითი მუშაობა არავის სჭირდება.`
  if (g.scope === 'class') {
    return `${quote(g.objective, 70)} — სირთულე აქვს კლასის უმეტესობას (${g.needsWork.length}/${classSize}, ${pct(g.share)}). რეკომენდებულია ხელახალი ახსნა მთელი კლასისთვის.`
  }
  return `${quote(g.objective, 70)} — დამატებითი მუშაობა სჭირდება ${g.needsWork.length} მოსწავლეს (${g.needsWork.map((s) => s.name).join(', ')}). საკმარისია მცირე ჯგუფთან მუშაობა.`
}

export function mistakeLine(m: StudentMistake): string {
  return `კითხვა ${m.position + 1}: აირჩია ${optionLabel(m.chosenIndex)} ${quote(m.chosenText, 50)}, სწორია ${optionLabel(m.correctIndex)} ${quote(m.correctText, 50)}`
}
