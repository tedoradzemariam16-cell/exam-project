import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MonitorPlay, PlayCircle, Radio } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { toGeorgianMessage } from '@/lib/errors'
import { SESSION_STATUS_LABEL, formatDateTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { listQuizzes } from '@/features/quiz/api'
import { createGameSession, listSessions } from '@/features/game/api'

export function LaunchPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preselected = params.get('quiz')
  const quizzes = useAsync(listQuizzes, [])
  const sessions = useAsync(listSessions, [])
  const [starting, setStarting] = useState<string | null>(null)

  const published = (quizzes.data ?? []).filter((q) => q.status === 'published')
  const open = (sessions.data ?? []).filter((s) => s.status !== 'finished')

  const launch = async (quizId: string) => {
    setStarting(quizId)
    try {
      const { id } = await createGameSession(quizId)
      navigate(`/host/${id}`)
    } catch (e) {
      toast.error(toGeorgianMessage(e, 'თამაშის შექმნა ვერ მოხერხდა.'))
      setStarting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="თამაშის დაწყება"
        description="აირჩიეთ გამოქვეყნებული ქვიზი. სისტემა შექმნის 6-ნიშნა კოდს, რომლითაც მოსწავლეები შემოუერთდებიან."
      />

      {open.length > 0 && (
        <Card className="mb-6 border-accent-400">
          <CardHeader icon={<Radio className="size-5 text-accent-600" />} title="ღია თამაშები" description="დაბრუნდით მიმდინარე ან მოსაცდელ თამაშში." />
          <CardBody className="space-y-2">
            {open.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="font-mono text-lg font-bold tracking-widest text-brand-800">{s.code}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{s.title}</span>
                <Badge tone={s.status === 'active' ? 'green' : 'amber'}>{SESSION_STATUS_LABEL[s.status]}</Badge>
                <ButtonLink size="sm" to={`/host/${s.id}`} icon={<MonitorPlay className="size-4" />}>
                  გაგრძელება
                </ButtonLink>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {quizzes.loading && !quizzes.data ? (
        <PageLoader />
      ) : quizzes.error ? (
        <Alert tone="error">{toGeorgianMessage(quizzes.error)}</Alert>
      ) : published.length === 0 ? (
        <EmptyState
          icon={<PlayCircle className="size-8" />}
          title="გამოქვეყნებული ქვიზი არ გაქვთ"
          description="თამაშის დასაწყებად ჯერ შექმენით ქვიზი, გადახედეთ კითხვებს და გამოაქვეყნეთ."
          action={<ButtonLink to="/app/quizzes">ჩემი ქვიზები</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {published.map((q) => (
            <Card key={q.id} className={cn('flex flex-col p-5', preselected === q.id && 'ring-2 ring-brand-500')}>
              <Link to={`/app/quizzes/${q.id}`} className="text-lg font-bold text-slate-900 hover:text-brand-700">
                {q.title}
              </Link>
              <p className="mt-1 text-sm text-slate-600">
                {[q.subject, q.grade_level, `${q.questions?.[0]?.count ?? 0} კითხვა`].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-xs text-slate-500">განახლდა: {formatDateTime(q.updated_at)}</p>
              <div className="mt-4">
                <Button
                  variant={preselected === q.id ? 'accent' : 'primary'}
                  icon={<PlayCircle className="size-4" />}
                  loading={starting === q.id}
                  disabled={starting !== null && starting !== q.id}
                  onClick={() => void launch(q.id)}
                >
                  თამაშის შექმნა
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
