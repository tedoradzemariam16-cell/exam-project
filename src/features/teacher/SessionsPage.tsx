import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, History, MonitorPlay, Trash2 } from 'lucide-react'
import { Badge, Card, PageHeader } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { toGeorgianMessage } from '@/lib/errors'
import { SESSION_STATUS_LABEL, formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { deleteFinishedSessions, deleteSession, listSessionSummaries, listSessions, type SessionListItem } from '@/features/game/api'

export function SessionsPage() {
  const toast = useToast()
  const data = useAsync(async () => {
    const [sessions, summaries] = await Promise.all([listSessions(), listSessionSummaries(200)])
    return { sessions, summaries: new Map(summaries.map((s) => [s.session_id, s])) }
  }, [])
  const [toDelete, setToDelete] = useState<SessionListItem | null>(null)
  const [deleteAll, setDeleteAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const finishedCount = useMemo(() => (data.data?.sessions ?? []).filter((s) => s.status === 'finished').length, [data.data])

  const doDelete = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(msg)
      await data.reload()
    } catch (e) {
      toast.error(toGeorgianMessage(e))
    } finally {
      setBusy(false)
      setToDelete(null)
      setDeleteAll(false)
    }
  }

  return (
    <>
      <PageHeader
        title="წარსული სესიები"
        description="ყველა ჩატარებული და მიმდინარე თამაში. სესიის წაშლა შლის მონაწილეთა სახელებსა და პასუხებსაც."
        actions={
          finishedCount > 0 && (
            <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={() => setDeleteAll(true)}>
              დასრულებულების წაშლა
            </Button>
          )
        }
      />

      {data.loading && !data.data ? (
        <PageLoader />
      ) : data.error ? (
        <Alert tone="error">{toGeorgianMessage(data.error)}</Alert>
      ) : !data.data || data.data.sessions.length === 0 ? (
        <EmptyState
          icon={<History className="size-8" />}
          title="სესიები ჯერ არ არის"
          description="თამაშის ჩატარების შემდეგ აქ გამოჩნდება შედეგები."
          action={<ButtonLink to="/app/launch">თამაშის დაწყება</ButtonLink>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">ქვიზი</th>
                  <th scope="col" className="px-3 py-3">თარიღი</th>
                  <th scope="col" className="px-3 py-3">კოდი</th>
                  <th scope="col" className="px-3 py-3">სტატუსი</th>
                  <th scope="col" className="px-3 py-3 text-right">მონაწილე</th>
                  <th scope="col" className="px-3 py-3 text-right">სწორი</th>
                  <th scope="col" className="px-5 py-3 text-right"><span className="sr-only">მოქმედებები</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.sessions.map((s) => {
                  const sum = data.data!.summaries.get(s.id)
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {s.status === 'finished' ? (
                          <Link to={`/app/analytics/${s.id}`} className="hover:text-brand-700">{s.title}</Link>
                        ) : (
                          s.title
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600">{formatDateTime(s.created_at)}</td>
                      <td className="px-3 py-3 font-mono text-slate-600">{s.code}</td>
                      <td className="px-3 py-3">
                        <Badge tone={s.status === 'active' ? 'green' : s.status === 'lobby' ? 'amber' : 'slate'}>
                          {SESSION_STATUS_LABEL[s.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(sum?.participant_count ?? 0)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {sum && sum.answer_count > 0 ? formatPercent(sum.correct_count / sum.answer_count) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          {s.status === 'finished' ? (
                            <ButtonLink size="sm" variant="ghost" to={`/app/analytics/${s.id}`} icon={<BarChart3 className="size-4" />}>
                              შედეგები
                            </ButtonLink>
                          ) : (
                            <ButtonLink size="sm" variant="ghost" to={`/host/${s.id}`} icon={<MonitorPlay className="size-4" />}>
                              გაგრძელება
                            </ButtonLink>
                          )}
                          <button
                            type="button"
                            onClick={() => setToDelete(s)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            aria-label={`სესიის წაშლა: ${s.title}, ${formatDateTime(s.created_at)}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && void doDelete(() => deleteSession(toDelete.id), 'სესია და მისი მონაცემები წაიშალა.')}
        title="სესიის წაშლა"
        description="სამუდამოდ წაიშლება ამ სესიის მონაწილეები, პასუხები და ანალიტიკა. ქვიზი უცვლელი დარჩება."
        confirmLabel="წაშლა"
        danger
        loading={busy}
      />
      <ConfirmDialog
        open={deleteAll}
        onCancel={() => setDeleteAll(false)}
        onConfirm={() =>
          void doDelete(async () => {
            const n = await deleteFinishedSessions()
            return n
          }, 'დასრულებული სესიები წაიშალა.')
        }
        title="ყველა დასრულებული სესიის წაშლა"
        description={`სამუდამოდ წაიშლება ${finishedCount} დასრულებული სესია, მათი მონაწილეები და პასუხები. მოქმედება შეუქცევადია.`}
        confirmLabel="ყველას წაშლა"
        danger
        loading={busy}
      />
    </>
  )
}
