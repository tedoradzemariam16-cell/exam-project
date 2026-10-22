import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  HelpCircle,
  Lightbulb,
  ListChecks,
  MonitorPlay,
  Target,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageHeader, StatCard } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { PageLoader } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { toGeorgianMessage } from '@/lib/errors'
import { formatDateTime, formatNumber, formatPercent, formatSeconds } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { loadSessionBundle } from '@/features/game/api'
import { optionLabel } from '@/features/game/answerStyles'
import { computeAnalytics } from './compute'
import { buildRecommendations, type Recommendation } from './recommendations'
import { MasteryList, OptionDistribution, QuestionCorrectChart, ScoreHistogram } from './charts'
import { downloadText, questionsCsv, resultsCsv, safeFilename } from './csv'

const SEVERITY: Record<Recommendation['severity'], { label: string; cls: string; Icon: typeof AlertTriangle }> = {
  high: { label: 'მაღალი პრიორიტეტი', cls: 'border-red-200 bg-red-50', Icon: AlertTriangle },
  medium: { label: 'საშუალო პრიორიტეტი', cls: 'border-amber-200 bg-amber-50', Icon: Lightbulb },
  low: { label: 'ინფორმაცია', cls: 'border-green-200 bg-green-50', Icon: CheckCircle2 },
  info: { label: 'შენიშვნა', cls: 'border-slate-200 bg-slate-50', Icon: HelpCircle },
}

export function SessionResultsPage() {
  const { id = '' } = useParams()
  const { data, error, loading } = useAsync(() => loadSessionBundle(id), [id])
  const [showAllRows, setShowAllRows] = useState(false)

  const analytics = useMemo(
    () => (data ? computeAnalytics(data.questions, data.participants, data.answers) : null),
    [data],
  )
  const recommendations = useMemo(() => (analytics ? buildRecommendations(analytics) : []), [analytics])

  if (loading && !data) return <PageLoader />
  if (error || !data || !analytics) {
    return <Alert tone="error" title="შედეგების ჩატვირთვა ვერ მოხერხდა">{toGeorgianMessage(error)}</Alert>
  }

  const { session } = data
  const o = analytics.overview
  const file = safeFilename(`${session.title}_${session.created_at.slice(0, 10)}`)
  const rows = showAllRows ? analytics.participants : analytics.participants.slice(0, 25)

  return (
    <>
      <PageHeader
        title={session.title}
        description={`${formatDateTime(session.started_at ?? session.created_at)} · კოდი ${session.code}${session.subject ? ` · ${session.subject}` : ''}${session.grade_level ? ` · ${session.grade_level}` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadText(`${file}_შედეგები.csv`, resultsCsv(analytics))} disabled={o.participantCount === 0}>
              შედეგები (CSV)
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadText(`${file}_კითხვები.csv`, questionsCsv(analytics))}>
              კითხვები (CSV)
            </Button>
          </>
        }
      />

      {session.status !== 'finished' && (
        <Alert
          tone="warning"
          className="mb-6"
          title="თამაში ჯერ არ დასრულებულა"
          action={<ButtonLink size="sm" to={`/host/${session.id}`} icon={<MonitorPlay className="size-4" />}>თამაშის მართვა</ButtonLink>}
        >
          ნაჩვენებია დროებითი შედეგები.
        </Alert>
      )}

      {o.participantCount === 0 ? (
        <EmptyState icon={<Users className="size-8" />} title="ამ სესიაში მონაწილე არ ყოფილა" description="ანალიტიკისთვის მონაცემები არ არის." />
      ) : (
        <div className="space-y-6">
          <section aria-label="საერთო შედეგები" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="მონაწილეები" value={formatNumber(o.participantCount)} hint={`დაასრულა ყველა კითხვა: ${formatPercent(o.completionRate)}`} icon={<Users className="size-5" />} />
            <StatCard label="სწორი პასუხები" value={formatPercent(o.correctRate)} hint={`${formatNumber(o.correctCount)} / ${formatNumber(o.answerCount)} პასუხი`} icon={<CheckCircle2 className="size-5" />} />
            <StatCard
              label="საშუალო ქულა"
              value={o.averageScore === null ? '—' : formatNumber(o.averageScore)}
              hint={`მედიანა: ${o.medianScore === null ? '—' : formatNumber(o.medianScore)}`}
              icon={<BarChart3 className="size-5" />}
            />
            <StatCard
              label="უმაღლესი / უმდაბლესი"
              value={`${formatNumber(o.highestScore ?? 0)}`}
              hint={`უმდაბლესი: ${formatNumber(o.lowestScore ?? 0)} · პასუხის საშ. დრო: ${o.averageResponseMs === null ? '—' : formatSeconds(o.averageResponseMs)}`}
              icon={<Trophy className="size-5" />}
            />
          </section>

          <Card>
            <CardHeader icon={<Lightbulb className="size-5" />} title="რეკომენდაციები მასწავლებლისთვის" description="ავტომატურად გამოთვლილი, მხოლოდ ამ სესიის რეალურ მონაცემებზე დაყრდნობით." />
            <CardBody>
              <ul className="space-y-3">
                {recommendations.map((r, i) => {
                  const s = SEVERITY[r.severity]
                  return (
                    <li key={i} className={cn('flex gap-3 rounded-xl border p-4', s.cls)}>
                      <s.Icon className="mt-0.5 size-5 shrink-0 text-slate-700" aria-hidden />
                      <div>
                        <p className="font-semibold text-slate-900">
                          <span className="sr-only">{s.label}: </span>
                          {r.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-700">{r.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader icon={<Target className="size-5" />} title="სასწავლო მიზნები" description="სწორი პასუხების წილი თითოეული მიზნის კითხვებზე" />
              <CardBody>
                <MasteryList groups={analytics.objectives} emptyText="კითხვებს სასწავლო მიზნები არ აქვს მიბმული." />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<ListChecks className="size-5" />} title="ქვეთემები" description="სადაც მოსწავლეები ყველაზე ხშირად ცდებოდნენ — ზემოთ" />
              <CardBody>
                <MasteryList groups={analytics.topics} emptyText="კითხვებს ქვეთემები არ აქვს მითითებული." />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader title="სწორი პასუხები კითხვების მიხედვით" />
              <CardBody>
                <QuestionCorrectChart questions={analytics.questions} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="ქულების განაწილება" />
              <CardBody>
                <ScoreHistogram buckets={analytics.scoreBuckets} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="კითხვების ანალიზი" description="პასუხების განაწილება ოთხ ვარიანტს შორის" />
            <CardBody className="space-y-6">
              {analytics.questions.map((q) => (
                <article key={q.id} className="rounded-xl border border-slate-200 p-4" aria-labelledby={`q-${q.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 id={`q-${q.id}`} className="min-w-0 flex-1 font-semibold text-slate-900">
                      <span className="text-brand-700">{q.position + 1}.</span> {q.text}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={q.correctRate === null ? 'slate' : q.correctRate >= 0.75 ? 'green' : q.correctRate >= 0.5 ? 'amber' : 'red'}>
                        სწორი: {formatPercent(q.correctRate)}
                      </Badge>
                      {q.difficult && <Badge tone="red"><XCircle className="size-3" aria-hidden /> რთული კითხვა</Badge>}
                      {q.possiblyAmbiguous && <Badge tone="amber"><AlertTriangle className="size-3" aria-hidden /> შესაძლოა ორაზროვანი</Badge>}
                      {!q.possiblyAmbiguous && q.misconception && <Badge tone="violet">გავრცელებული შეცდომა</Badge>}
                      {q.lowEvidence && <Badge>ცოტა პასუხი</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[q.topic && `ქვეთემა: ${q.topic}`, q.objective && `მიზანი: ${q.objective}`].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-4">
                    <OptionDistribution q={q} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {q.responses} პასუხი · უპასუხოდ: {q.noAnswer}
                    {q.averageResponseMs !== null && ` · საშ. დრო: ${formatSeconds(q.averageResponseMs)}`}
                    {q.topWrongIndex !== null && q.topWrongCount > 0 &&
                      ` · ყველაზე ხშირი არასწორი: „${optionLabel(q.topWrongIndex)}“ (${formatPercent(q.topWrongShare)})`}
                  </p>
                </article>
              ))}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader icon={<Trophy className="size-5" />} title="შედეგების ცხრილი" description="✓ — სწორი, ✗ — არასწორი, — — პასუხი არ გაუცია" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">მოსწავლეების შედეგები</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">#</th>
                    <th scope="col" className="px-3 py-3">მოსწავლე</th>
                    <th scope="col" className="px-3 py-3 text-right">ქულა</th>
                    <th scope="col" className="px-3 py-3 text-right">სწორი</th>
                    <th scope="col" className="px-3 py-3 text-right">სიზუსტე</th>
                    {analytics.questions.map((q) => (
                      <th key={q.id} scope="col" className="px-2 py-3 text-center" title={q.text}>
                        კ{q.position + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 font-semibold text-slate-600 tabular-nums">{p.rank}</td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap text-slate-900">{p.firstName} {p.lastName}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatNumber(p.score)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{p.correct}/{analytics.questions.length}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(p.accuracy)}</td>
                      {p.selections.map((sel, i) => {
                        const ok = sel !== null && sel === analytics.questions[i].correctIndex
                        return (
                          <td key={i} className="px-2 py-2.5 text-center">
                            {sel === null ? (
                              <span className="text-slate-400" aria-label="პასუხი არ არის">—</span>
                            ) : (
                              <span
                                className={cn('inline-flex min-w-9 items-center justify-center rounded-md px-1 text-xs font-bold', ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}
                                aria-label={`${optionLabel(sel)} — ${ok ? 'სწორი' : 'არასწორი'}`}
                              >
                                {optionLabel(sel)} {ok ? '✓' : '✗'}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analytics.participants.length > 25 && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAllRows((v) => !v)}>
                  {showAllRows ? 'ნაკლების ჩვენება' : `ყველას ჩვენება (${analytics.participants.length})`}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
