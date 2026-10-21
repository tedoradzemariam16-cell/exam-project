// Rule-based, data-backed teaching recommendations (in Georgian).
// Each recommendation cites the numbers it is based on. When the data is too
// thin, we say so instead of drawing conclusions.

import { optionLabel } from '@/features/game/answerStyles'
import {
  MIN_RESPONSES_PER_GROUP,
  type GroupStat,
  type QuestionStat,
  type SessionAnalytics,
} from './compute'

export type RecommendationKind =
  | 'insufficient_data'
  | 'reteach_objective'
  | 'practice_objective'
  | 'objective_mastered'
  | 'weak_topic'
  | 'misconception'
  | 'review_question'
  | 'time_pressure'

export interface Recommendation {
  kind: RecommendationKind
  severity: 'high' | 'medium' | 'low' | 'info'
  title: string
  detail: string
}

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)
const quote = (s: string, max = 90) => `„${s.length > max ? `${s.slice(0, max)}…` : s}“`
const qLabel = (q: QuestionStat) => `კითხვა ${q.position + 1}`

export function buildRecommendations(a: SessionAnalytics, maxItems = 8): Recommendation[] {
  const out: Recommendation[] = []
  const { overview } = a

  if (overview.participantCount < 3 || overview.answerCount < 10) {
    out.push({
      kind: 'insufficient_data',
      severity: 'info',
      title: 'მონაცემები არასაკმარისია სანდო დასკვნისთვის',
      detail: `თამაშში მონაწილეობდა ${overview.participantCount} მოსწავლე და გაცემულია ${overview.answerCount} პასუხი. ქვემოთ მოცემული მაჩვენებლები მხოლოდ საორიენტაციოა.`,
    })
  }

  const weak = a.objectives.filter((o) => o.mastery === 'weak')
  const developing = a.objectives.filter((o) => o.mastery === 'developing')
  const strong = a.objectives.filter((o) => o.mastery === 'strong')

  for (const o of weak) {
    out.push({
      kind: 'reteach_objective',
      severity: 'high',
      title: `ხელახლა ახსენით: ${quote(o.name, 70)}`,
      detail: `ამ მიზანთან დაკავშირებულ ${o.questionCount} კითხვაზე სწორი პასუხების წილი მხოლოდ ${pct(o.correctRate)} იყო (${o.correct}/${o.responses}). განსაკუთრებით გადახედეთ ${questionList(o)}.`,
    })
  }
  for (const o of developing) {
    out.push({
      kind: 'practice_objective',
      severity: 'medium',
      title: `დამატებითი სავარჯიშოები: ${quote(o.name, 70)}`,
      detail: `სწორი პასუხები — ${pct(o.correctRate)} (${o.correct}/${o.responses}). მიზანი ნაწილობრივ ათვისებულია; სასარგებლო იქნება მოკლე პრაქტიკული დავალებები.`,
    })
  }

  // Topics that are not already covered by a weak objective.
  const weakObjectiveQuestions = new Set(weak.flatMap((o) => o.questionPositions))
  for (const t of a.topics.filter((t) => t.mastery === 'weak')) {
    if (t.questionPositions.every((p) => weakObjectiveQuestions.has(p))) continue
    out.push({
      kind: 'weak_topic',
      severity: 'medium',
      title: `სუსტი ქვეთემა: ${quote(t.name, 70)}`,
      detail: `მოსწავლეები ამ ქვეთემაზე ხშირად ცდებოდნენ: სწორი პასუხები — ${pct(t.correctRate)} (${t.correct}/${t.responses}).`,
    })
  }

  for (const q of a.questions) {
    if (q.lowEvidence || q.topWrongIndex === null) continue
    const wrong = q.options[q.topWrongIndex]
    const right = q.options[q.correctIndex]
    if (q.possiblyAmbiguous) {
      out.push({
        kind: 'review_question',
        severity: 'medium',
        title: `გადახედეთ ფორმულირებას: ${qLabel(q)}`,
        detail: `არასწორი პასუხი „${optionLabel(q.topWrongIndex)}“ (${quote(wrong, 50)}) აირჩია ${pct(q.topWrongShare)}-მა, სწორი კი — ${pct(q.correctRate)}-მა. ეს შეიძლება მიუთითებდეს ორაზროვან კითხვაზე ან ძალიან გავრცელებულ მცდარ წარმოდგენაზე.`,
      })
    } else if (q.misconception) {
      out.push({
        kind: 'misconception',
        severity: 'medium',
        title: `განმარტეთ განსხვავება: ${quote(right, 40)} და ${quote(wrong, 40)}`,
        detail: `${qLabel(q)}-ში მოსწავლეთა ${pct(q.topWrongShare)} ირჩევდა ერთსა და იმავე არასწორ პასუხს. ეს ტიპური შეცდომაა, რომელიც ცალკე განხილვას საჭიროებს.`,
      })
    }
  }

  if (overview.responseRate !== null && overview.responseRate < 0.7 && overview.expectedAnswers >= 10) {
    out.push({
      kind: 'time_pressure',
      severity: 'low',
      title: 'ბევრმა მოსწავლემ ვერ მოასწრო პასუხი',
      detail: `მოსალოდნელი პასუხების მხოლოდ ${pct(overview.responseRate)} იქნა გაცემული. განიხილეთ კითხვის დროის გაზრდა ან ტექსტის შემოკლება.`,
    })
  }

  for (const o of strong) {
    out.push({
      kind: 'objective_mastered',
      severity: 'low',
      title: `კარგად ათვისებულია: ${quote(o.name, 70)}`,
      detail: `სწორი პასუხები — ${pct(o.correctRate)} (${o.correct}/${o.responses}). შეგიძლიათ გადახვიდეთ შემდეგ მიზანზე ან შესთავაზოთ უფრო რთული დავალებები.`,
    })
  }

  const insufficientObjectives = a.objectives.filter((o) => o.mastery === 'insufficient')
  if (insufficientObjectives.length > 0 && out[0]?.kind !== 'insufficient_data') {
    out.push({
      kind: 'insufficient_data',
      severity: 'info',
      title: 'ზოგიერთი მიზნისთვის მონაცემები არასაკმარისია',
      detail: `${insufficientObjectives.map((o) => quote(o.name, 50)).join(', ')} — ${MIN_RESPONSES_PER_GROUP}-ზე ნაკლები პასუხი. დასკვნისთვის საჭიროა მეტი კითხვა ან მონაწილე.`,
    })
  }

  if (out.length === 0) {
    out.push({
      kind: 'insufficient_data',
      severity: 'info',
      title: 'განსაკუთრებული პრობლემა არ გამოვლინდა',
      detail: 'კითხვებს არ აქვთ მიბმული სასწავლო მიზნები ან შედეგები თანაბრად კარგია. მიზნების მითითება ქვიზში უფრო დეტალურ ანალიზს მოგცემთ.',
    })
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 }
  const sorted = out.sort((x, y) => order[x.severity] - order[y.severity])
  // Keep the "insufficient data" warning at the top when present.
  const warn = sorted.findIndex((r) => r.kind === 'insufficient_data' && r.title.startsWith('მონაცემები'))
  if (warn > 0) sorted.unshift(...sorted.splice(warn, 1))
  return sorted.slice(0, maxItems)
}

function questionList(o: GroupStat): string {
  const ids = o.questionPositions.slice(0, 3).map((p) => p + 1)
  return ids.length === 1 ? `კითხვა ${ids[0]}` : `კითხვები ${ids.join(', ')}`
}
