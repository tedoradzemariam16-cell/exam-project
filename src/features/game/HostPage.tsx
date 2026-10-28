import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BarChart3,
  CheckCircle2,
  Copy,
  Maximize2,
  Pause,
  Play,
  SkipForward,
  Square,
  Trophy,
  Users,
  UserX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { Switch } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { toGeorgianMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import type { AnswerRow, GameSession, Participant } from '@/types/db'
import { controlGame, fetchServerTime, loadSessionBundle, removeParticipant, type SessionBundle } from './api'
import { estimateClockOffset, questionPhase, remainingMs } from './clock'
import { ANSWER_STYLES, optionLabel } from './answerStyles'
import { Countdown } from './Countdown'
import { JoinQr } from './JoinQr'
import { useNow } from './useNow'

/** Seconds to wait after the reveal before moving on automatically. */
const AUTO_ADVANCE_OPTIONS = [3, 5, 8] as const
const AUTO_DELAY_KEY = 'taoba-auto-advance-delay'

function loadAutoDelay(): number {
  try {
    const v = Number(window.localStorage.getItem(AUTO_DELAY_KEY))
    return (AUTO_ADVANCE_OPTIONS as readonly number[]).includes(v) ? v : 8
  } catch {
    return 8
  }
}

export function HostPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [bundle, setBundle] = useState<SessionBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [autoDelay, setAutoDelay] = useState(loadAutoDelay)
  // Local time when auto-advance was switched on / its delay changed: the
  // countdown never starts earlier than this, so turning it on late is safe.
  const [autoSince, setAutoSince] = useState(0)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const reload = useCallback(async () => {
    try {
      const b = await loadSessionBundle(id)
      setBundle(b)
      setLoadError(null)
    } catch (e) {
      setLoadError(toGeorgianMessage(e))
    }
  }, [id])

  const syncClock = useCallback(async () => {
    try {
      const t = await fetchServerTime()
      setOffset(estimateClockOffset(t.serverNow, t.started, t.received))
    } catch {
      /* keep previous offset */
    }
  }, [])

  // Initial load, clock sync, safety polling.
  useEffect(() => {
    // Fetching from the server on mount is an external sync, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    void syncClock()
    const poll = window.setInterval(() => void reload(), 15000)
    const clock = window.setInterval(() => void syncClock(), 60000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(clock)
    }
  }, [reload, syncClock])

  // Realtime: apply row changes directly (cheap), reload on reconnect.
  useEffect(() => {
    const channel = supabase
      .channel(`host:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${id}` }, (p) =>
        setBundle((b) => (b ? { ...b, session: p.new as GameSession } : b)),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${id}` }, (p) =>
        setBundle((b) => {
          if (!b) return b
          if (p.eventType === 'DELETE') {
            const oldId = (p.old as { id?: string }).id
            return { ...b, participants: b.participants.filter((x) => x.id !== oldId) }
          }
          const row = p.new as Participant
          const rest = b.participants.filter((x) => x.id !== row.id)
          return { ...b, participants: [...rest, row] }
        }),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${id}` }, (p) =>
        setBundle((b) => {
          if (!b) return b
          const row = p.new as AnswerRow
          if (b.answers.some((a) => a.id === row.id)) return b
          return { ...b, answers: [...b.answers, row] }
        }),
      )
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED'
        setLive(ok)
        if (ok) void reload()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id, reload])

  const session = bundle?.session
  const now = useNow(Boolean(session && session.status === 'active'), 200)
  const currentPhase = session ? questionPhase(session, now, offset) : 'idle'
  const left = session ? remainingMs(session, now, offset) : 0
  const question = bundle && session ? bundle.questions.find((q) => q.position === session.current_index) : undefined

  const currentAnswers = useMemo(
    () => (bundle && question ? bundle.answers.filter((a) => a.session_question_id === question.id) : []),
    [bundle, question],
  )
  const distribution = useMemo(() => {
    const d = [0, 0, 0, 0]
    for (const a of currentAnswers) d[a.selected_index]++
    return d
  }, [currentAnswers])
  const leaderboard = useMemo(
    () => [...(bundle?.participants ?? [])].sort((a, b) => b.total_score - a.total_score || a.joined_at.localeCompare(b.joined_at)),
    [bundle],
  )

  const run = useCallback(
    async (action: Parameters<typeof controlGame>[0], label: string) => {
      setBusy(action)
      try {
        await controlGame(action, id)
        await reload()
      } catch (e) {
        const msg = toGeorgianMessage(e)
        toast.error(msg)
        if (String((e as Error)?.message).includes('QUESTION_STILL_ACTIVE')) void syncClock()
      } finally {
        setBusy(null)
      }
      return label
    },
    [id, reload, toast, syncClock],
  )

  // Optional auto-advance a few seconds after the reveal (server still enforces the timer).
  const revealedKey = currentPhase === 'revealed' && session ? `${session.current_index}` : null
  const endsLocal = session?.question_ends_at ? Date.parse(session.question_ends_at) - offset : 0
  const autoDeadline = Math.max(endsLocal, autoSince) + autoDelay * 1000
  useEffect(() => {
    if (!autoAdvance || !revealedKey) return
    const t = window.setTimeout(() => void run('next_question', 'next'), Math.max(0, autoDeadline - Date.now()))
    return () => window.clearTimeout(t)
  }, [autoAdvance, revealedKey, autoDeadline, run])

  const changeAutoAdvance = (on: boolean) => {
    setAutoAdvance(on)
    setAutoSince(now)
  }
  const changeAutoDelay = (sec: number) => {
    setAutoDelay(sec)
    setAutoSince(now)
    try {
      window.localStorage.setItem(AUTO_DELAY_KEY, String(sec))
    } catch {
      /* storage unavailable — keep the choice for this page only */
    }
  }

  if (!bundle && !loadError) return <PageLoader label="თამაში იტვირთება…" />
  if (!bundle || !session) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert tone="error" title="თამაში ვერ ჩაიტვირთა" action={<Button variant="secondary" onClick={() => navigate('/app/launch')}>უკან დაბრუნება</Button>}>
          {loadError}
        </Alert>
      </div>
    )
  }

  const joinUrl = `${window.location.origin}/join?code=${session.code}`
  const total = question ? question.time_limit_seconds * 1000 : 0
  const answeredCount = currentAnswers.length
  const participantCount = bundle.participants.length
  const isLast = session.current_index + 1 >= session.question_count
  const canAdvance = currentPhase === 'revealed' && left <= 0

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-brand-950 px-4 py-3 text-white sm:px-6">
      <div className="flex items-center gap-4">
        <Logo to="/app" light />
        <span className="hidden text-sm text-brand-200 sm:inline">{session.title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-brand-200" role="status">
          {live ? <Wifi className="size-4 text-green-400" aria-hidden /> : <WifiOff className="size-4 text-amber-400" aria-hidden />}
          {live ? 'კავშირი აქტიურია' : 'ხელახლა დაკავშირება…'}
        </span>
        <span className="rounded-lg bg-white/10 px-3 py-1 font-mono text-lg font-bold tracking-widest">{session.code}</span>
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="rounded-lg p-2 text-brand-100 hover:bg-white/10"
          aria-label="სრულ ეკრანზე გაშლა"
        >
          <Maximize2 className="size-5" />
        </button>
      </div>
    </header>
  )

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-900 to-brand-950">
      {header}
      <main className="flex flex-1 flex-col">
        {/* ------------------------------------------------------------ LOBBY */}
        {session.status === 'lobby' && (
          <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="flex flex-col justify-center rounded-3xl bg-white p-6 text-center shadow-raised sm:p-10">
              <p className="text-lg text-slate-600">შედით მისამართზე</p>
              <p className="mt-1 text-xl font-bold break-all text-brand-800">{window.location.host}/join</p>
              <p className="mt-6 text-lg text-slate-600">და შეიყვანეთ კოდი</p>
              <p className="mt-2 font-mono text-6xl font-extrabold tracking-[0.15em] text-slate-950 sm:text-7xl" aria-label={`თამაშის კოდი ${session.code.split('').join(' ')}`}>
                {session.code.slice(0, 3)} {session.code.slice(3)}
              </p>
              <div className="mt-6">
                <JoinQr url={joinUrl} />
                <p className="mt-2 text-sm text-slate-500">ან დაასკანერეთ QR კოდი ტელეფონით</p>
              </div>
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Copy className="size-4" />}
                  onClick={() => void navigator.clipboard?.writeText(joinUrl).then(() => toast.success('ბმული დაკოპირდა.'))}
                >
                  ბმულის კოპირება
                </Button>
              </div>
            </section>
            <section className="flex flex-col rounded-3xl bg-white/5 p-6 text-white ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 text-xl font-bold">
                  <Users className="size-6" aria-hidden /> მონაწილეები: {participantCount}
                </h1>
                <div className="flex gap-2">
                  <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setConfirmEnd(true)}>
                    გაუქმება
                  </Button>
                  <Button variant="accent" size="lg" icon={<Play className="size-5" />} disabled={participantCount === 0} loading={busy === 'start_game'} onClick={() => void run('start_game', 'start')}>
                    დაწყება
                  </Button>
                </div>
              </div>
              {participantCount === 0 ? (
                <p className="mt-10 text-center text-brand-200" aria-live="polite">ველოდებით მოსწავლეებს…</p>
              ) : (
                <ul className="mt-6 flex flex-wrap gap-2" aria-live="polite">
                  {bundle.participants.map((p) => (
                    <li key={p.id} className="animate-pop-in group flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-900">
                      {p.first_name} {p.last_name}
                      <button
                        type="button"
                        onClick={() => void removeParticipant(p.id).then(reload).catch((e) => toast.error(toGeorgianMessage(e)))}
                        className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        aria-label={`${p.first_name} ${p.last_name} — თამაშიდან ამოშლა`}
                      >
                        <UserX className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-auto pt-6 text-sm text-brand-200">
                {session.question_count} კითხვა. თითოეული კითხვა აქტიური რჩება ტაიმერის ბოლომდე, მაშინაც კი, თუ ყველამ უპასუხა.
              </p>
            </section>
          </div>
        )}

        {/* ----------------------------------------------------- ACTIVE GAME */}
        {session.status === 'active' && question && (
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 text-white">
              <p className="text-lg font-semibold">
                კითხვა {session.current_index + 1} / {session.question_count}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {currentPhase === 'open' && (
                  <Button variant="secondary" icon={<Pause className="size-4" />} loading={busy === 'pause_game'} onClick={() => void run('pause_game', 'pause')}>
                    პაუზა
                  </Button>
                )}
                {currentPhase === 'paused' && (
                  <Button variant="accent" icon={<Play className="size-4" />} loading={busy === 'resume_game'} onClick={() => void run('resume_game', 'resume')}>
                    გაგრძელება
                  </Button>
                )}
                <Button variant="ghost" className="text-white hover:bg-white/10" icon={<Square className="size-4" />} onClick={() => setConfirmEnd(true)}>
                  დასრულება
                </Button>
              </div>
            </div>

            <section className="rounded-3xl bg-white p-6 shadow-raised sm:p-8">
              <div className="flex items-start gap-5">
                <Countdown remaining={left} total={total} size="lg" paused={currentPhase === 'paused'} />
                <div className="min-w-0 flex-1">
                  {/* The sub-topic is for analytics only: on the projector it can hint at the answer. */}
                  <h1 className="text-2xl leading-snug font-bold text-slate-950 sm:text-3xl">{question.text}</h1>
                </div>
              </div>
              {currentPhase === 'paused' && (
                <Alert tone="warning" className="mt-5">თამაში შეჩერებულია. ტაიმერი გაგრძელდება იქიდან, სადაც გაჩერდა.</Alert>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              {question.options.map((opt, i) => {
                const s = ANSWER_STYLES[i]
                const revealed = currentPhase === 'revealed'
                const correct = i === question.correct_index
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex min-h-20 items-center gap-4 rounded-2xl px-5 py-4 text-lg font-bold shadow-sm transition-opacity sm:text-xl',
                      s.bg,
                      s.text,
                      revealed && !correct && 'opacity-35',
                      revealed && correct && 'ring-4 ring-white',
                    )}
                  >
                    <s.Icon className="size-7 shrink-0" fill="currentColor" aria-hidden />
                    <span className="sr-only">{optionLabel(i)}: </span>
                    <span className="flex-1">{opt}</span>
                    {revealed && (
                      <span className="flex items-center gap-2 text-base">
                        {correct && <CheckCircle2 className="size-6" aria-label="სწორი პასუხი" />}
                        <span className="rounded-lg bg-black/15 px-2 py-0.5 tabular-nums">{distribution[i]}</span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {currentPhase !== 'revealed' ? (
              <section className="rounded-2xl bg-white/5 p-5 text-white ring-1 ring-white/10" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-semibold">
                    უპასუხა: <span className="tabular-nums">{answeredCount}</span> / {participantCount}
                  </p>
                  <p className="text-brand-200">ჯერ არ უპასუხია: {Math.max(0, participantCount - answeredCount)}</p>
                </div>
                <div className="mt-3 h-3 w-full rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={participantCount} aria-valuenow={answeredCount} aria-label="პასუხების რაოდენობა">
                  <div className="h-3 rounded-full bg-accent-500 transition-all" style={{ width: `${participantCount ? (answeredCount / participantCount) * 100 : 0}%` }} />
                </div>
                {answeredCount >= participantCount && participantCount > 0 && (
                  <p className="mt-3 text-sm text-brand-200">ყველამ უპასუხა. კითხვა აქტიური რჩება ტაიმერის დასრულებამდე.</p>
                )}
              </section>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                <section className="rounded-2xl bg-white p-5">
                  <h2 className="text-lg font-bold text-slate-900">სწორი პასუხი: {optionLabel(question.correct_index)} — {question.options[question.correct_index]}</h2>
                  {question.explanation && <p className="mt-2 text-slate-700">{question.explanation}</p>}
                  <p className="mt-3 text-sm text-slate-500">
                    სწორად უპასუხა {currentAnswers.filter((a) => a.is_correct).length} მოსწავლემ {participantCount}-დან.
                  </p>
                </section>
                <section className="rounded-2xl bg-white p-5">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <Trophy className="size-5 text-accent-600" aria-hidden /> ლიდერები
                  </h2>
                  <Leaderboard rows={leaderboard.slice(0, 5)} />
                </section>
                <div className="flex flex-wrap items-center justify-between gap-4 lg:col-span-2">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <Switch
                      checked={autoAdvance}
                      onChange={changeAutoAdvance}
                      label={<span className="text-white">ავტომატური გადასვლა</span>}
                      description={
                        <span className="text-brand-200" aria-live="polite">
                          {autoAdvance
                            ? `${isLast ? 'შედეგებზე' : 'შემდეგ კითხვაზე'} გადასვლა ${Math.max(0, Math.ceil((autoDeadline - now) / 1000))} წამში`
                            : `${isLast ? 'შედეგებზე' : 'შემდეგ კითხვაზე'} ${autoDelay} წამში`}
                        </span>
                      }
                    />
                    <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1" role="group" aria-label="ავტომატური გადასვლის დრო">
                      {AUTO_ADVANCE_OPTIONS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          aria-pressed={autoDelay === sec}
                          onClick={() => changeAutoDelay(sec)}
                          className={
                            autoDelay === sec
                              ? 'rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-brand-900'
                              : 'rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-100 hover:bg-white/10'
                          }
                        >
                          {sec} წმ
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button variant="accent" size="lg" icon={<SkipForward className="size-5" />} disabled={!canAdvance} loading={busy === 'next_question'} onClick={() => void run('next_question', 'next')}>
                    {isLast ? 'საბოლოო შედეგები' : 'შემდეგი კითხვა'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------- FINISHED */}
        {session.status === 'finished' && (
          <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
            <section className="rounded-3xl bg-white p-6 shadow-raised sm:p-8">
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
                <Trophy className="size-7 text-accent-600" aria-hidden /> საბოლოო შედეგები
              </h1>
              {leaderboard.length === 0 ? (
                <p className="mt-4 text-slate-600">თამაშში მონაწილე არ ყოფილა.</p>
              ) : (
                <>
                  <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                    {leaderboard.slice(0, 3).map((p, i) => (
                      <li key={p.id} className={cn('rounded-2xl p-4 text-center', i === 0 ? 'bg-accent-500 text-slate-950' : 'bg-slate-100 text-slate-900')}>
                        <p className="text-3xl font-extrabold">{i + 1}</p>
                        <p className="mt-1 font-bold">{p.first_name} {p.last_name}</p>
                        <p className="text-sm tabular-nums">{formatNumber(p.total_score)} ქულა</p>
                      </li>
                    ))}
                  </ol>
                  <Leaderboard rows={leaderboard.slice(3, 10)} startRank={4} />
                </>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={`/app/analytics/${session.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800">
                  <BarChart3 className="size-4" aria-hidden /> ანალიტიკის ნახვა
                </Link>
                <Link to="/app" className="inline-flex h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold text-slate-800 hover:bg-slate-50">
                  დაფაზე დაბრუნება
                </Link>
              </div>
            </section>
          </div>
        )}

        {session.status === 'active' && !question && (
          <div className="p-6">
            <Alert tone="error">მიმდინარე კითხვა ვერ მოიძებნა. განაახლეთ გვერდი.</Alert>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmEnd}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false)
          void run('end_game', 'end')
        }}
        title={session.status === 'lobby' ? 'თამაშის გაუქმება' : 'თამაშის დასრულება'}
        description="თამაში დასრულდება ყველა მონაწილისთვის. უკვე მიღებული პასუხები და ქულები შენარჩუნდება."
        confirmLabel="დასრულება"
        danger
      />
    </div>
  )
}

function Leaderboard({ rows, startRank = 1 }: { rows: Participant[]; startRank?: number }) {
  if (rows.length === 0) return null
  return (
    <ol className="mt-3 divide-y divide-slate-100" start={startRank}>
      {rows.map((p, i) => (
        <li key={p.id} className="flex items-center gap-3 py-2">
          <span className="w-6 text-right font-bold text-slate-500 tabular-nums">{startRank + i}</span>
          <span className="flex-1 truncate font-semibold text-slate-900">{p.first_name} {p.last_name}</span>
          <span className="font-bold text-slate-900 tabular-nums">{formatNumber(p.total_score)}</span>
        </li>
      ))}
    </ol>
  )
}
