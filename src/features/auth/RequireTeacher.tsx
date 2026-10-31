import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Clock, LogOut, RefreshCw, ShieldX } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { PageLoader } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { useAuth } from './AuthProvider'

/**
 * UI guard only — real protection is enforced by Row Level Security in the
 * database. This keeps signed-out visitors out of teacher screens and shows
 * a waiting screen until an administrator approves the account.
 */
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { loading, session, profile, profileLoading, signOut } = useAuth()
  const location = useLocation()
  if (loading || profileLoading) return <PageLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert
          tone="warning"
          title="მასწავლებლის პროფილი ვერ მოიძებნა"
          action={
            <Button variant="secondary" onClick={() => void signOut()}>
              გასვლა
            </Button>
          }
        >
          ეს ანგარიში მასწავლებლის პროფილს არ უკავშირდება. გამოდით და შედით მასწავლებლის ანგარიშით.
        </Alert>
      </div>
    )
  }
  const status = profile.status ?? 'approved'
  if (status !== 'approved') return <AwaitingApproval rejected={status === 'rejected'} />
  return <>{children}</>
}

function AwaitingApproval({ rejected }: { rejected: boolean }) {
  const { profile, session, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  // Pick up the approval without a manual reload.
  useEffect(() => {
    if (rejected) return
    const t = window.setInterval(() => void refreshProfile(), 20_000)
    return () => window.clearInterval(t)
  }, [rejected, refreshProfile])

  const check = async () => {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-card sm:p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div
          className={
            rejected
              ? 'mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-600'
              : 'mx-auto grid size-14 place-items-center rounded-full bg-amber-50 text-amber-600'
          }
        >
          {rejected ? <ShieldX className="size-7" aria-hidden /> : <Clock className="size-7" aria-hidden />}
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          {rejected ? 'წვდომა არ არის დადასტურებული' : 'ანგარიში ელოდება დადასტურებას'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {rejected
            ? 'ადმინისტრატორმა ამ ანგარიშს წვდომა არ მისცა ან შეაჩერა. თუ ეს შეცდომაა, დაუკავშირდით სკოლის ადმინისტრაციას.'
            : 'რეგისტრაცია დასრულებულია. როგორც კი სკოლის ადმინისტრატორი თქვენს ანგარიშს დაადასტურებს, შეძლებთ ქვიზების შექმნას და თამაშის ჩატარებას.'}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          {profile?.full_name && `${profile.full_name} · `}
          {session?.user.email}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!rejected && (
            <Button icon={<RefreshCw className="size-4" />} loading={checking} onClick={() => void check()}>
              შემოწმება
            </Button>
          )}
          <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
            გასვლა
          </Button>
        </div>
      </div>
    </div>
  )
}
