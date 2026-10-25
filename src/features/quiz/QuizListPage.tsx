import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Copy, LibraryBig, Pencil, PlayCircle, Plus, Search, Trash2 } from 'lucide-react'
import { Badge, Card, PageHeader } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { toGeorgianMessage } from '@/lib/errors'
import { DIFFICULTY_LABEL, QUIZ_STATUS_LABEL, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import type { QuizStatus } from '@/types/db'
import { deleteQuiz, duplicateQuiz, listQuizzes, setQuizStatus, type QuizListItem } from './api'

type Filter = 'all' | QuizStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ყველა' },
  { id: 'draft', label: 'მონახაზები' },
  { id: 'published', label: 'გამოქვეყნებული' },
  { id: 'archived', label: 'არქივი' },
]

const statusTone = (s: QuizStatus) => (s === 'published' ? 'green' : s === 'draft' ? 'amber' : 'slate')

export function QuizListPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(() => listQuizzes(), [])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<QuizListItem | null>(null)

  const quizzes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (z) =>
        (filter === 'all' ? z.status !== 'archived' : z.status === filter) &&
        (!q || `${z.title} ${z.subject} ${z.topic}`.toLowerCase().includes(q)),
    )
  }, [data, filter, search])

  const act = async (id: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(id)
    try {
      await fn()
      toast.success(success)
      await reload()
    } catch (e) {
      toast.error(toGeorgianMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="ჩემი ქვიზები"
        description="შექმენით, დაარედაქტირეთ და მართეთ თქვენი ქვიზები."
        actions={
          <ButtonLink to="/app/quizzes/new" icon={<Plus className="size-4" />}>
            ახალი ქვიზი
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="ფილტრი სტატუსით">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
                filter === f.id ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ძიება…"
            aria-label="ქვიზების ძიება"
            className="pl-9"
          />
        </div>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <Alert tone="error" title="ქვიზების ჩატვირთვა ვერ მოხერხდა" action={<Button variant="secondary" onClick={() => void reload()}>ხელახლა ცდა</Button>}>
          {toGeorgianMessage(error)}
        </Alert>
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon={<LibraryBig className="size-8" />}
          title={data?.length ? 'ამ ფილტრით ქვიზი ვერ მოიძებნა' : 'ჯერ არ გაქვთ ქვიზები'}
          description={data?.length ? 'შეცვალეთ ფილტრი ან ძიების ტექსტი.' : 'შექმენით პირველი ქვიზი — ხელით ან AI-ის დახმარებით.'}
          action={!data?.length && <ButtonLink to="/app/quizzes/new">ქვიზის შექმნა</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((z) => {
            const count = z.questions?.[0]?.count ?? 0
            return (
              <Card key={z.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <Badge tone={statusTone(z.status)}>{QUIZ_STATUS_LABEL[z.status]}</Badge>
                  <span className="text-xs text-slate-500">{formatDate(z.updated_at)}</span>
                </div>
                <Link to={`/app/quizzes/${z.id}`} className="mt-3 rounded text-lg leading-snug font-bold text-slate-900 hover:text-brand-700">
                  {z.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {[z.subject, z.grade_level && `${z.grade_level} კლასი`, z.topic].filter(Boolean).join(' · ') || 'დეტალები არ არის მითითებული'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge>{count} კითხვა</Badge>
                  <Badge>{DIFFICULTY_LABEL[z.difficulty]}</Badge>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-5">
                  {z.status === 'published' && (
                    <Button size="sm" variant="accent" icon={<PlayCircle className="size-4" />} onClick={() => navigate(`/app/launch?quiz=${z.id}`)}>
                      დაწყება
                    </Button>
                  )}
                  <ButtonLink size="sm" variant="ghost" to={`/app/quizzes/${z.id}`} icon={<Pencil className="size-4" />}>
                    რედაქტირება
                  </ButtonLink>
                  <div className="ml-auto flex">
                    <IconAction
                      label="დუბლირება"
                      disabled={busy === z.id}
                      onClick={() => void act(z.id, () => duplicateQuiz(z.id), 'ქვიზის ასლი შეიქმნა მონახაზის სახით.')}
                    >
                      <Copy className="size-4" />
                    </IconAction>
                    {z.status === 'archived' ? (
                      <IconAction
                        label="არქივიდან აღდგენა"
                        disabled={busy === z.id}
                        onClick={() => void act(z.id, () => setQuizStatus(z.id, 'draft'), 'ქვიზი აღდგა მონახაზის სახით.')}
                      >
                        <ArchiveRestore className="size-4" />
                      </IconAction>
                    ) : (
                      <IconAction
                        label="დაარქივება"
                        disabled={busy === z.id}
                        onClick={() => void act(z.id, () => setQuizStatus(z.id, 'archived'), 'ქვიზი დაარქივდა.')}
                      >
                        <Archive className="size-4" />
                      </IconAction>
                    )}
                    <IconAction label="წაშლა" danger disabled={busy === z.id} onClick={() => setToDelete(z)}>
                      <Trash2 className="size-4" />
                    </IconAction>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const z = toDelete
          setToDelete(null)
          if (z) void act(z.id, () => deleteQuiz(z.id), 'ქვიზი წაიშალა.')
        }}
        title="ქვიზის წაშლა"
        description={`„${toDelete?.title ?? ''}“ და მისი ყველა კითხვა სამუდამოდ წაიშლება. ჩატარებული თამაშების შედეგები შენარჩუნდება.`}
        confirmLabel="წაშლა"
        danger
      />
    </>
  )
}

function IconAction({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'rounded-lg p-2 text-slate-500 disabled:opacity-40',
        danger ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  )
}
