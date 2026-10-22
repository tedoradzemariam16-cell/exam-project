import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Hourglass, PauseCircle, Trophy, WifiOff, XCircle } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Alert } from '@/components/ui/Feedback'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { ensureStudentSession } from '@/lib/supabase'
import { toGeorgianMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import type { PlayerState } from '@/types/db'
import { getPlayerState, submitAnswer } from '@/features/game/api'
import { estimateClockOffset, questionPhase, remainingMs } from '@/features/game/clock'
import { ANSWER_STYLES, optionLabel } from '@/features/game/answerStyles'
import { Countdown } from '@/features/game/Countdown'
import { useNow } from '@/features/game/useNow'

const POLL_MS = 4000

export function PlayPage() {
  const { sessionId = '' } = useParams()
  const [state, setState] = useState<PlayerState | null>(null)
  const [offset, setOffset] = useState(0)
  const [fatal, setFatal] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  // Local (optimistic) selection, tied to the question it belongs to.
  const [pick, setPick] = useState<{ questionId: string; index: number } | null>(null)
  const [submitErr, setSubmitErr] = useState<{ questionId: string; message: string } | null>(null)
  const failures = useRef(0)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const client = await ensureStudentSession()
      const { state: s, started, received } = await getPlayerState(client, sessionId)
      setState(s)
      setOffset(estimateClockOffset(s.server_now, started, received))
      failures.current = 0
      setOffline(false)
    } catch (e) {
      const msg = String((e as Error)?.message ?? '')
      if (msg.includes('NOT_A_PARTICIPANT')) {
        setFatal(toGeorgianMessage(e))
      } else {
        failures.current += 1
        if (failures.current >= 2) setOffline(true)
      }
    } finally {
      inFlight.current = false
    }
  }, [sessionId])

  // Initial load + polling fallback + refresh when the tab becomes visible again.
  useEffect(() => {
    // Fetching from the server on mount is an external sync, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [refresh])

  // Realtime: any change of the session row (next question, pause, end) → refetch.
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false
    void ensureStudentSession().then((client) => {
      if (cancelled) return
      const channel = client
        .channel(`play:${sessionId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, () =>
          void refresh(),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void refresh()
        })
      cleanup = () => void client.removeChannel(channel)
    })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [sessionId, refresh])

  const active = state?.session.status === 'active'
  const now = useNow(Boolean(active), 200)
  const phase = state ? questionPhase(state.session, now, offset) : 'idle'
  const left = state ? remainingMs(state.session, now, offset) : 0
  const questionId = state?.question?.id

  // When our local countdown reaches zero, fetch the reveal from the server.
  const revealKey = phase === 'revealed' && questionId && state?.question?.correct_index === undefined ? questionId : null
  useEffect(() => {
    if (!revealKey) return
    const t = window.setTimeout(() => void refresh(), 400)
    return () => window.clearTimeout(t)
  }, [revealKey, refresh])

  const pending = pick && pick.questionId === questionId ? pick.index : null
  const submitError = submitErr && submitErr.questionId === questionId ? submitErr.message : null

  const answer = async (index: number) => {
    if (!state?.question || pending !== null || state.answer) return
    const qid = state.question.id
    setPick({ questionId: qid, index })
    setSubmitErr(null)
    try {
      const client = await ensureStudentSession()
      await submitAnswer(client, sessionId, qid, index)
    } catch (e) {
      const msg = String((e as Error)?.message ?? '')
      setSubmitErr({ questionId: qid, message: toGeorgianMessage(e, 'პასუხის გაგზავნა ვერ მოხერხდა.') })
      if (!msg.includes('ALREADY_ANSWERED')) setPick(null)
    } finally {
      void refresh()
    }
  }

  if (fatal) {
    return (
      <Shell>
        <Alert tone="error" title="თამაშზე წვდომა არ არის" action={<Link to="/join" className="font-semibold text-brand-700 underline">თამაშში შესვლა კოდით</Link>}>
          {fatal}
        </Alert>
      </Shell>
    )
  }
  if (!state) return <Shell><PageLoader label="დაკავშირება…" /></Shell>

  const { session, me, question } = state
  const myAnswer = state.answer?.selected_index ?? pending
  const total = question ? question.time_limit_seconds * 1000 : 0

  return (
    <Shell name={`${me.first_name} ${me.last_name}`} score={me.total_score} offline={offline}>
      {session.status === 'lobby' && (
        <Center>
          <Hourglass className="size-14 text-accent-400" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold text-white">თქვენ შემოხვედით!</h1>
          <p className="mt-2 text-brand-100">დაელოდეთ, სანამ მასწავლებელი თამაშს დაიწყებს.</p>
          <p className="mt-6 rounded-xl bg-white/10 px-4 py-2 text-brand-100">{session.title}</p>
        </Center>
      )}

      {session.status === 'active' && question && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center justify-between gap-3 text-white">
            <p className="font-semibold">
              კითხვა {session.current_index + 1} / {session.question_count}
            </p>
            {phase !== 'revealed' && <Countdown remaining={left} total={total} paused={phase === 'paused'} />}
          </div>
          <h1 className="rounded-2xl bg-white p-4 text-lg leading-snug font-bold text-slate-950 sm:text-xl">{question.text}</h1>

          {phase === 'paused' && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-white" role="status">
              <PauseCircle className="size-6" aria-hidden /> მასწავლებელმა თამაში დროებით შეაჩერა.
            </div>
          )}

          {phase === 'open' && myAnswer === null && (
            <div className="grid flex-1 grid-cols-1 gap-3 min-[420px]:grid-cols-2" role="group" aria-label="პასუხის ვარიანტები">
              {question.options.map((opt, i) => {
                const s = ANSWER_STYLES[i]
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void answer(i)}
                    className={cn(
                      'flex min-h-24 items-center gap-3 rounded-2xl px-4 py-4 text-left text-lg font-bold shadow-lg transition-transform active:scale-[0.98] focus-visible:outline-4 focus-visible:outline-white',
                      s.bg,
                      s.text,
                    )}
                  >
                    <s.Icon className="size-8 shrink-0" fill="currentColor" aria-hidden />
                    <span>
                      <span className="sr-only">პასუხი {optionLabel(i)}: </span>
                      {opt}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {(phase === 'open' || phase === 'paused') && myAnswer !== null && (
            <Center>
              {state.answer ? (
                <CheckCircle2 className="size-14 text-green-400" aria-hidden />
              ) : (
                <Spinner className="size-12 text-white" />
              )}
              <h2 className="mt-4 text-2xl font-bold text-white" role="status">
                {state.answer ? 'პასუხი მიღებულია!' : 'იგზავნება…'}
              </h2>
              <p className="mt-2 text-brand-100">
                თქვენი არჩევანი: <strong>{optionLabel(myAnswer)}</strong> — {question.options[myAnswer]}
              </p>
              <p className="mt-4 flex items-center gap-2 text-sm text-brand-200">
                <Clock className="size-4" aria-hidden /> შედეგი გამოჩნდება დროის ამოწურვის შემდეგ.
              </p>
            </Center>
          )}

          {phase === 'open' && submitError && <Alert tone="error">{submitError}</Alert>}

          {phase === 'revealed' && <Reveal state={state} />}
        </div>
      )}

      {session.status === 'finished' && (
        <Center>
          <Trophy className="size-16 text-accent-400" aria-hidden />
          <h1 className="mt-4 text-3xl font-extrabold text-white">თამაში დასრულდა!</h1>
          <div className="mt-6 w-full max-w-sm rounded-3xl bg-white p-6 text-center">
            <p className="text-sm text-slate-500">თქვენი ქულა</p>
            <p className="text-5xl font-extrabold text-slate-950 tabular-nums">{formatNumber(me.total_score)}</p>
            <p className="mt-3 text-lg font-semibold text-slate-800">
              {me.rank} ადგილი {me.participant_count}-დან
            </p>
            <p className="mt-1 text-slate-600">
              სწორი პასუხები: {me.correct_count} / {session.question_count}
            </p>
          </div>
          <Link to="/" className="mt-6 text-brand-100 underline hover:text-white">მთავარ გვერდზე დაბრუნება</Link>
        </Center>
      )}
    </Shell>
  )
}

function Reveal({ state }: { state: PlayerState }) {
  const q = state.question!
  const a = state.answer
  if (q.correct_index === undefined) {
    return (
      <Center>
        <Spinner className="size-10 text-white" label="" />
        <p className="mt-3 text-brand-100" role="status">დრო ამოიწურა. შედეგები იტვირთება…</p>
      </Center>
    )
  }
  const correct = a?.is_correct === true
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" role="status" aria-live="polite">
      {!a ? (
        <>
          <Clock className="size-16 text-amber-300" aria-hidden />
          <h2 className="text-3xl font-extrabold text-white">დრო ამოიწურა</h2>
          <p className="text-brand-100">ამ კითხვაზე პასუხი არ გაგიციათ.</p>
        </>
      ) : correct ? (
        <>
          <CheckCircle2 className="size-16 text-green-400" aria-hidden />
          <h2 className="text-3xl font-extrabold text-white">სწორია!</h2>
          <p className="text-2xl font-bold text-accent-400 tabular-nums">+{formatNumber(a.points ?? 0)} ქულა</p>
        </>
      ) : (
        <>
          <XCircle className="size-16 text-red-400" aria-hidden />
          <h2 className="text-3xl font-extrabold text-white">არასწორია</h2>
          <p className="text-brand-100">+0 ქულა</p>
        </>
      )}
      <div className="w-full max-w-md rounded-2xl bg-white p-4 text-left">
        <p className="text-sm text-slate-500">სწორი პასუხი</p>
        <p className="font-bold text-slate-900">
          {optionLabel(q.correct_index)} — {q.options[q.correct_index]}
        </p>
        {q.explanation && <p className="mt-2 text-sm text-slate-700">{q.explanation}</p>}
      </div>
      <p className="text-brand-100">
        სულ: <strong className="text-white tabular-nums">{formatNumber(state.me.total_score)}</strong> ქულა · {state.me.rank} ადგილი{' '}
        {state.me.participant_count}-დან
      </p>
      <p className="text-sm text-brand-200">დაელოდეთ შემდეგ კითხვას…</p>
    </div>
  )
}

function Shell({ children, name, score, offline }: { children: React.ReactNode; name?: string; score?: number; offline?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-800 to-brand-950">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Logo light />
        {name && (
          <div className="text-right text-white">
            <p className="max-w-[45vw] truncate text-sm font-semibold">{name}</p>
            {score !== undefined && <p className="text-xs text-brand-200 tabular-nums">{formatNumber(score)} ქულა</p>}
          </div>
        )}
      </header>
      {offline && (
        <div className="mx-4 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950" role="alert">
          <WifiOff className="size-4" aria-hidden /> კავშირი შეფერხდა. ვცდილობთ ხელახლა დაკავშირებას — თქვენი მიღებული პასუხები შენახულია.
        </div>
      )}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4">{children}</main>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">{children}</div>
}
