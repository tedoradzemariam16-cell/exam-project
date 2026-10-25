import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Check, Eye, Lightbulb, RotateCcw, ShieldCheck, Trash2, UserRoundCheck, Users, X } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { listSessions } from '@/features/game/api'
import { listQuizzes, loadQuiz } from '@/features/quiz/api'
import { toGeorgianMessage } from '@/lib/errors'
import { DIFFICULTY_LABEL, OPTION_LETTERS, QUIZ_STATUS_LABEL, SESSION_STATUS_LABEL, formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import type { TeacherStatus } from '@/types/db'
import { TEACHER_STATUS_LABEL, deleteTeacher, listTeachers, setTeacherStatus, type AdminTeacher } from './api'

const STATUS_TONE: Record<TeacherStatus, 'amber' | 'green' | 'red'> = { pending: 'amber', approved: 'green', rejected: 'red' }

/** UI guard; the database refuses admin data to everyone else anyway. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile?.is_admin) {
    return <Alert tone="warning" title="წვდომა არ გაქვთ">ეს გვერდი მხოლოდ ადმინისტრატორისთვისაა.</Alert>
  }
  return <>{children}</>
}

// ------------------------------------------------------------ teachers list

export function AdminTeachersPage() {
  return (
    <AdminOnly>
      <TeachersView />
    </AdminOnly>
  )
}

type PendingAction = { kind: 'reject' | 'delete'; teacher: AdminTeacher } | null

function TeachersView() {
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => listTeachers(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<PendingAction>(null)

  const act = async (t: AdminTeacher, fn: () => Promise<void>, msg: string) => {
    setBusy(t.id)
    try {
      await fn()
      toast.success(msg)
      await reload()
    } catch (e) {
      toast.error(toGeorgianMessage(e))
    } finally {
      setBusy(null)
      setConfirm(null)
    }
  }

  if (loading && !data) return <PageLoader />
  if (error || !data) return <Alert tone="error" title="მონაცემების ჩატვირთვა ვერ მოხერხდა">{toGeorgianMessage(error)}</Alert>

  const pending = data.filter((t) => t.status === 'pending')
  const others = data.filter((t) => t.status !== 'pending')

  return (
    <>
      <PageHeader
        title="ადმინისტრირება"
        description="დაადასტურეთ ახალი მასწავლებლები და ნახეთ ყველა მასწავლებლის ქვიზები და შედეგები (მხოლოდ ნახვა)."
      />

      <Card className="mb-6">
        <CardHeader
          icon={<UserRoundCheck className="size-5" />}
          title={`ახალი მოთხოვნები${pending.length ? ` (${pending.length})` : ''}`}
          description="დადასტურებამდე ანგარიშით ვერც ქვიზს შექმნიან და ვერც თამაშს ჩაატარებენ."
        />
        <CardBody>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">ახალი მოთხოვნა არ არის.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{t.full_name || 'სახელი არ არის მითითებული'}</p>
                    <p className="text-sm text-slate-600">{t.email}</p>
                    <p className="text-xs text-slate-500">
                      {t.school && `${t.school} · `}რეგისტრაცია: {formatDateTime(t.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      icon={<Check className="size-4" />}
                      loading={busy === t.id}
                      onClick={() => void act(t, () => setTeacherStatus(t.id, 'approved'), `${t.full_name || t.email} დადასტურდა.`)}
                    >
                      დადასტურება
                    </Button>
                    <Button size="sm" variant="secondary" icon={<X className="size-4" />} disabled={busy === t.id} onClick={() => setConfirm({ kind: 'reject', teacher: t })}>
                      უარყოფა
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Users className="size-5" />} title="მასწავლებლები" description="დააჭირეთ სახელს მათი ქვიზებისა და შედეგების სანახავად." />
        {others.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">ჯერ არცერთი მასწავლებელი არ არის.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">მასწავლებელი</th>
                  <th scope="col" className="px-3 py-3">სტატუსი</th>
                  <th scope="col" className="px-3 py-3 text-right">ქვიზები</th>
                  <th scope="col" className="px-3 py-3 text-right">თამაშები</th>
                  <th scope="col" className="px-3 py-3">ბოლო თამაში</th>
                  <th scope="col" className="px-5 py-3 text-right">მოქმედება</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {others.map((t) => (
                  <tr key={t.id} className="align-middle">
                    <td className="px-5 py-3">
                      <Link to={`/app/admin/teachers/${t.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                        {t.full_name || t.email}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {t.email}
                        {t.school && ` · ${t.school}`}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {t.is_admin ? (
                        <Badge tone="violet">
                          <ShieldCheck className="size-3" aria-hidden /> ადმინისტრატორი
                        </Badge>
                      ) : (
                        <Badge tone={STATUS_TONE[t.status]}>{TEACHER_STATUS_LABEL[t.status]}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(t.quiz_count)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(t.session_count)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{t.last_session_at ? formatDate(t.last_session_at) : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <ButtonLink size="sm" variant="ghost" to={`/app/admin/teachers/${t.id}`} icon={<Eye className="size-4" />}>
                          ნახვა
                        </ButtonLink>
                        {!t.is_admin && t.status === 'approved' && (
                          <Button size="sm" variant="ghost" disabled={busy === t.id} onClick={() => setConfirm({ kind: 'reject', teacher: t })}>
                            შეჩერება
                          </Button>
                        )}
                        {!t.is_admin && t.status === 'rejected' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RotateCcw className="size-4" />}
                              loading={busy === t.id}
                              onClick={() => void act(t, () => setTeacherStatus(t.id, 'approved'), 'წვდომა აღდგა.')}
                            >
                              აღდგენა
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 className="size-4 text-red-600" />}
                              disabled={busy === t.id}
                              onClick={() => setConfirm({ kind: 'delete', teacher: t })}
                              aria-label={`${t.full_name || t.email} — ანგარიშის წაშლა`}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        loading={confirm !== null && busy === confirm.teacher.id}
        onConfirm={() => {
          if (!confirm) return
          const t = confirm.teacher
          if (confirm.kind === 'delete') void act(t, () => deleteTeacher(t.id), 'ანგარიში წაიშალა.')
          else void act(t, () => setTeacherStatus(t.id, 'rejected'), t.status === 'pending' ? 'მოთხოვნა უარყოფილია.' : 'წვდომა შეჩერებულია.')
        }}
        title={
          confirm?.kind === 'delete' ? 'ანგარიშის წაშლა' : confirm?.teacher.status === 'pending' ? 'მოთხოვნის უარყოფა' : 'წვდომის შეჩერება'
        }
        description={
          confirm?.kind === 'delete'
            ? `${confirm.teacher.full_name || confirm.teacher.email} — ანგარიში და მისი ყველა მონაცემი (ქვიზები, შედეგები) სამუდამოდ წაიშლება.`
            : confirm?.teacher.status === 'pending'
              ? `${confirm.teacher.full_name || confirm.teacher.email} ვერ შეძლებს საიტით სარგებლობას. მოგვიანებით შეგიძლიათ აღადგინოთ ან წაშალოთ.`
              : `${confirm?.teacher.full_name || confirm?.teacher.email} ვეღარ შექმნის ქვიზებს და ვერ ჩაატარებს თამაშებს. მისი მონაცემები შენარჩუნდება; წვდომის აღდგენა ნებისმიერ დროს შეიძლება.`
        }
        confirmLabel={confirm?.kind === 'delete' ? 'წაშლა' : confirm?.teacher.status === 'pending' ? 'უარყოფა' : 'შეჩერება'}
        danger
      />
    </>
  )
}

// ------------------------------------------------------------ one teacher

export function AdminTeacherPage() {
  return (
    <AdminOnly>
      <TeacherView />
    </AdminOnly>
  )
}

function TeacherView() {
  const { id = '' } = useParams()
  const { data, error, loading } = useAsync(async () => {
    const [teachers, quizzes, sessions] = await Promise.all([listTeachers(), listQuizzes(id), listSessions(id)])
    return { teacher: teachers.find((t) => t.id === id) ?? null, quizzes, sessions }
  }, [id])

  if (loading && !data) return <PageLoader />
  if (error || !data) return <Alert tone="error" title="მონაცემების ჩატვირთვა ვერ მოხერხდა">{toGeorgianMessage(error)}</Alert>
  if (!data.teacher) return <Alert tone="warning" title="მასწავლებელი ვერ მოიძებნა" />
  const { teacher: t, quizzes, sessions } = data

  return (
    <>
      <Link to="/app/admin" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> ადმინისტრირება
      </Link>
      <PageHeader
        title={t.full_name || t.email}
        description={`${t.email}${t.school ? ` · ${t.school}` : ''} · რეგისტრაცია: ${formatDate(t.created_at)}`}
        actions={t.is_admin ? <Badge tone="violet">ადმინისტრატორი</Badge> : <Badge tone={STATUS_TONE[t.status]}>{TEACHER_STATUS_LABEL[t.status]}</Badge>}
      />
      <Alert tone="info" className="mb-6" title="მხოლოდ ნახვის რეჟიმი">
        ადმინისტრატორს შეუძლია მასწავლებლის ქვიზებისა და შედეგების ნახვა, მაგრამ არა მათი შეცვლა ან წაშლა.
      </Alert>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`ქვიზები (${quizzes.length})`} />
          {quizzes.length === 0 ? (
            <CardBody>
              <EmptyState title="ქვიზები არ არის" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {quizzes.map((z) => (
                <li key={z.id}>
                  <Link to={`/app/admin/quizzes/${z.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{z.title || 'უსათაურო ქვიზი'}</span>
                      <span className="block text-xs text-slate-500">
                        {[z.subject, z.grade_level && `${z.grade_level} კლასი`, `${z.questions[0]?.count ?? 0} კითხვა`, formatDate(z.updated_at)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Badge tone={z.status === 'published' ? 'green' : 'slate'}>{QUIZ_STATUS_LABEL[z.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`ჩატარებული თამაშები (${sessions.length})`} />
          {sessions.length === 0 ? (
            <CardBody>
              <EmptyState title="თამაშები ჯერ არ ჩატარებულა" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link to={`/app/analytics/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{s.title}</span>
                      <span className="block text-xs text-slate-500">
                        {formatDateTime(s.started_at ?? s.created_at)} · {formatNumber(s.participants[0]?.count ?? 0)} მოსწავლე · {SESSION_STATUS_LABEL[s.status]}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700">
                      <BarChart3 className="size-4" aria-hidden /> შედეგები
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

// ------------------------------------------------------------ quiz preview

export function AdminQuizPage() {
  return (
    <AdminOnly>
      <QuizView />
    </AdminOnly>
  )
}

function QuizView() {
  const { id = '' } = useParams()
  const { data, error, loading } = useAsync(() => loadQuiz(id), [id])

  if (loading && !data) return <PageLoader />
  if (error || !data) return <Alert tone="error" title="ქვიზის ჩატვირთვა ვერ მოხერხდა">{toGeorgianMessage(error)}</Alert>
  const { quiz, objectives, questions } = data
  const objectiveName = new Map(objectives.map((o) => [o.id, o.title]))

  return (
    <>
      <Link to={`/app/admin/teachers/${quiz.teacher_id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> მასწავლებლის გვერდი
      </Link>
      <PageHeader
        title={quiz.title || 'უსათაურო ქვიზი'}
        description={[quiz.subject, quiz.grade_level && `${quiz.grade_level} კლასი`, quiz.topic, DIFFICULTY_LABEL[quiz.difficulty], `${quiz.time_per_question} წმ კითხვაზე`]
          .filter(Boolean)
          .join(' · ')}
        actions={<Badge tone={quiz.status === 'published' ? 'green' : 'slate'}>{QUIZ_STATUS_LABEL[quiz.status]}</Badge>}
      />
      {objectives.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="შუალედური მიზნები" />
          <CardBody>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {objectives.map((o) => (
                <li key={o.id}>{o.title}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      {questions.length === 0 ? (
        <EmptyState title="ქვიზს ჯერ კითხვები არ აქვს" />
      ) : (
        <ol className="space-y-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <Card className="p-5">
                <p className="font-semibold text-slate-900">
                  <span className="text-brand-700">{i + 1}.</span> {q.text}
                </p>
                {q.objective_id && objectiveName.get(q.objective_id) && (
                  <p className="mt-1 text-xs text-slate-500">მიზანი: {objectiveName.get(q.objective_id)}</p>
                )}
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {q.answer_options.map((o, j) => (
                    <li
                      key={o.id}
                      className={
                        o.is_correct
                          ? 'rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900'
                          : 'rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700'
                      }
                    >
                      <span className="font-bold">{OPTION_LETTERS[j]}.</span> {o.text}
                      {o.is_correct && <Check className="ml-1 inline size-4 text-green-700" aria-label="სწორი პასუხი" />}
                      {!o.is_correct && o.misconception && (
                        <span className="mt-1 flex gap-1.5 text-xs text-amber-800">
                          <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {o.misconception}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="mt-3 text-sm text-slate-600">ახსნა: {q.explanation}</p>}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
