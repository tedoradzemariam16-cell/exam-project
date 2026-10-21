import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CheckCircle2, History, LibraryBig, PlayCircle, Plus, Sparkles, Users } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageHeader, StatCard } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { listQuizzes } from '@/features/quiz/api'
import { listSessionSummaries, listSessions } from '@/features/game/api'
import { toGeorgianMessage } from '@/lib/errors'
import { QUIZ_STATUS_LABEL, SESSION_STATUS_LABEL, formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

export function DashboardPage() {
  const { profile } = useAuth()
  const data = useAsync(async () => {
    const [quizzes, sessions, summaries] = await Promise.all([listQuizzes(), listSessions(), listSessionSummaries(100)])
    return { quizzes, sessions, summaries }
  }, [])

  const stats = useMemo(() => {
    if (!data.data) return null
    const { quizzes, sessions, summaries } = data.data
    const finished = sessions.filter((s) => s.status === 'finished')
    const finishedIds = new Set(finished.map((s) => s.id))
    const fin = summaries.filter((s) => finishedIds.has(s.session_id))
    const answers = fin.reduce((a, s) => a + s.answer_count, 0)
    const correct = fin.reduce((a, s) => a + s.correct_count, 0)
    return {
      quizzes: quizzes.filter((q) => q.status !== 'archived').length,
      published: quizzes.filter((q) => q.status === 'published').length,
      finishedSessions: finished.length,
      participants: fin.reduce((a, s) => a + s.participant_count, 0),
      correctRate: answers > 0 ? correct / answers : null,
      answers,
    }
  }, [data.data])

  const summaryById = useMemo(() => new Map((data.data?.summaries ?? []).map((s) => [s.session_id, s])), [data.data])

  const firstName = profile?.full_name?.split(' ')[0]

  if (data.loading && !data.data) return <PageLoader />
  if (data.error) return <Alert tone="error" title="მონაცემების ჩატვირთვა ვერ მოხერხდა">{toGeorgianMessage(data.error)}</Alert>
  if (!data.data || !stats) return null
  const { quizzes, sessions } = data.data
  const isNew = quizzes.length === 0

  return (
    <>
      <PageHeader
        title={firstName ? `გამარჯობა, ${firstName}!` : 'გამარჯობა!'}
        description="აქ ხედავთ თქვენი ქვიზებისა და გაკვეთილების მოკლე მიმოხილვას."
        actions={
          <>
            <ButtonLink to="/app/launch" variant="secondary" icon={<PlayCircle className="size-4" />}>
              თამაშის დაწყება
            </ButtonLink>
            <ButtonLink to="/app/quizzes/new" icon={<Plus className="size-4" />}>
              ქვიზის შექმნა
            </ButtonLink>
          </>
        }
      />

      {isNew && (
        <Card className="mb-6 overflow-hidden">
          <div className="grid gap-6 bg-gradient-to-br from-brand-800 to-brand-600 p-6 text-white md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Sparkles className="size-5 text-accent-400" aria-hidden /> დავიწყოთ!
              </h2>
              <ol className="mt-3 list-inside list-decimal space-y-1 text-brand-50">
                <li>შექმენით ქვიზი: მიუთითეთ თემა, სასწავლო მიზანი და მასალა.</li>
                <li>დააგენერირეთ კითხვები AI-ით ან დაწერეთ ხელით, შემდეგ გადახედეთ.</li>
                <li>გამოაქვეყნეთ და დაიწყეთ თამაში — მოსწავლეები შემოვლენ კოდით.</li>
              </ol>
            </div>
            <ButtonLink to="/app/quizzes/new" variant="accent" size="lg">
              პირველი ქვიზის შექმნა
            </ButtonLink>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="ქვიზები" value={formatNumber(stats.quizzes)} hint={`${stats.published} გამოქვეყნებული`} icon={<LibraryBig className="size-5" />} />
        <StatCard label="ჩატარებული თამაშები" value={formatNumber(stats.finishedSessions)} icon={<History className="size-5" />} />
        <StatCard label="მონაწილეები" value={formatNumber(stats.participants)} hint="ყველა დასრულებულ თამაშში" icon={<Users className="size-5" />} />
        <StatCard
          label="სწორი პასუხები"
          value={formatPercent(stats.correctRate)}
          hint={stats.answers ? `${formatNumber(stats.answers)} პასუხიდან` : 'მონაცემები ჯერ არ არის'}
          icon={<CheckCircle2 className="size-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<History className="size-5" />}
            title="ბოლო თამაშები"
            action={<Link to="/app/sessions" className="text-sm font-semibold text-brand-700 hover:underline">ყველა</Link>}
          />
          <CardBody className="p-0">
            {sessions.length === 0 ? (
              <div className="p-5">
                <EmptyState title="თამაშები ჯერ არ ჩატარებულა" description="დაწყების შემდეგ შედეგები აქ გამოჩნდება." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {sessions.slice(0, 6).map((s) => {
                  const sum = summaryById.get(s.id)
                  return (
                    <li key={s.id}>
                      <Link
                        to={s.status === 'finished' ? `/app/analytics/${s.id}` : `/host/${s.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{s.title}</p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(s.created_at)} · {sum?.participant_count ?? 0} მონაწილე
                          </p>
                        </div>
                        {s.status === 'finished' && sum && sum.answer_count > 0 ? (
                          <span className="text-sm font-bold text-slate-800 tabular-nums">
                            {formatPercent(sum.correct_count / sum.answer_count)}
                          </span>
                        ) : (
                          <Badge tone={s.status === 'active' ? 'green' : s.status === 'lobby' ? 'amber' : 'slate'}>
                            {SESSION_STATUS_LABEL[s.status]}
                          </Badge>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<LibraryBig className="size-5" />}
            title="ბოლოს შეცვლილი ქვიზები"
            action={<Link to="/app/quizzes" className="text-sm font-semibold text-brand-700 hover:underline">ყველა</Link>}
          />
          <CardBody className="p-0">
            {quizzes.length === 0 ? (
              <div className="p-5">
                <EmptyState title="ქვიზები ჯერ არ გაქვთ" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {quizzes.slice(0, 6).map((q) => (
                  <li key={q.id}>
                    <Link to={`/app/quizzes/${q.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{q.title}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(q.updated_at)} · {q.questions?.[0]?.count ?? 0} კითხვა
                        </p>
                      </div>
                      <Badge tone={q.status === 'published' ? 'green' : q.status === 'draft' ? 'amber' : 'slate'}>
                        {QUIZ_STATUS_LABEL[q.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {stats.finishedSessions > 0 && (
        <div className="mt-6">
          <ButtonLink to="/app/analytics" variant="secondary" icon={<BarChart3 className="size-4" />}>
            დეტალური ანალიტიკის ნახვა
          </ButtonLink>
        </div>
      )}
    </>
  )
}
