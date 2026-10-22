import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ChevronRight } from 'lucide-react'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { PageLoader } from '@/components/ui/Spinner'
import { toGeorgianMessage } from '@/lib/errors'
import { formatDate, formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { listSessionSummaries, listSessions } from '@/features/game/api'
import { TrendChart } from './charts'

export function AnalyticsIndexPage() {
  const data = useAsync(async () => {
    const [sessions, summaries] = await Promise.all([listSessions(), listSessionSummaries(200)])
    const byId = new Map(summaries.map((s) => [s.session_id, s]))
    return sessions
      .filter((s) => s.status === 'finished')
      .map((s) => ({ session: s, summary: byId.get(s.id) }))
  }, [])

  const trend = useMemo(
    () =>
      (data.data ?? [])
        .filter((r) => r.summary && r.summary.answer_count > 0)
        .slice(0, 20)
        .reverse()
        .map((r) => ({
          label: formatDate(r.session.started_at ?? r.session.created_at).split(' ').slice(0, 2).join(' '),
          value: Math.round((r.summary!.correct_count / r.summary!.answer_count) * 100),
          title: r.session.title,
          tooltipTitle: `${r.session.title} — ${formatDate(r.session.created_at)}`,
        })),
    [data.data],
  )

  return (
    <>
      <PageHeader title="შედეგები და ანალიტიკა" description="აირჩიეთ დასრულებული თამაში დეტალური ანალიზისთვის: შეცდომები, სუსტი თემები და სასწავლო მიზნები." />
      {data.loading && !data.data ? (
        <PageLoader />
      ) : data.error ? (
        <Alert tone="error">{toGeorgianMessage(data.error)}</Alert>
      ) : !data.data || data.data.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="დასრულებული თამაშები ჯერ არ არის"
          description="როგორც კი თამაშს ჩაატარებთ, აქ გამოჩნდება შედეგები და რეკომენდაციები."
          action={<ButtonLink to="/app/launch">თამაშის დაწყება</ButtonLink>}
        />
      ) : (
        <div className="space-y-6">
          {trend.length >= 2 && (
            <Card>
              <CardHeader title="სწორი პასუხების დინამიკა" description="ბოლო დასრულებული თამაშები, ქრონოლოგიურად" />
              <CardBody>
                <TrendChart points={trend} />
              </CardBody>
            </Card>
          )}
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {data.data.map(({ session: s, summary }) => (
                <li key={s.id}>
                  <Link to={`/app/analytics/${s.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{s.title}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(s.started_at ?? s.created_at)} · {formatNumber(summary?.participant_count ?? 0)} მონაწილე ·{' '}
                        {s.question_count} კითხვა
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {summary && summary.answer_count > 0 ? formatPercent(summary.correct_count / summary.answer_count) : '—'}
                      </p>
                      <p className="text-xs text-slate-500">სწორი პასუხები</p>
                    </div>
                    <ChevronRight className="size-5 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  )
}
