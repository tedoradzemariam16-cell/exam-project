import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PageLoader } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { useAuth } from './AuthProvider'

/**
 * UI guard only — real protection is enforced by Row Level Security in the
 * database. This just keeps signed-out visitors out of teacher screens.
 */
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { loading, session, profile, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
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
  return <>{children}</>
}
