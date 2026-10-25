import { lazy, Suspense } from 'react'
import { Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireTeacher } from '@/features/auth/RequireTeacher'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfigMissing } from '@/components/ConfigMissing'
import { isSupabaseConfigured } from '@/lib/supabase'
import { LandingPage } from '@/pages/LandingPage'
import { ForgotPasswordPage, LoginPage, RegisterPage } from '@/pages/AuthPages'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PageLoader } from '@/components/ui/Spinner'

// Teacher screens are split into separate chunks so students (often on
// phones) only download the small join/play bundle.
const TeacherLayout = lazy(() => import('@/features/teacher/TeacherLayout').then((m) => ({ default: m.TeacherLayout })))
const DashboardPage = lazy(() => import('@/features/teacher/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LaunchPage = lazy(() => import('@/features/teacher/LaunchPage').then((m) => ({ default: m.LaunchPage })))
const SessionsPage = lazy(() => import('@/features/teacher/SessionsPage').then((m) => ({ default: m.SessionsPage })))
const SettingsPage = lazy(() => import('@/features/teacher/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const QuizListPage = lazy(() => import('@/features/quiz/QuizListPage').then((m) => ({ default: m.QuizListPage })))
const QuizEditorPage = lazy(() => import('@/features/quiz/QuizEditorPage').then((m) => ({ default: m.QuizEditorPage })))
const AnalyticsIndexPage = lazy(() =>
  import('@/features/analytics/AnalyticsIndexPage').then((m) => ({ default: m.AnalyticsIndexPage })),
)
const SessionResultsPage = lazy(() =>
  import('@/features/analytics/SessionResultsPage').then((m) => ({ default: m.SessionResultsPage })),
)
const HostPage = lazy(() => import('@/features/game/HostPage').then((m) => ({ default: m.HostPage })))
const AdminTeachersPage = lazy(() => import('@/features/admin/AdminPages').then((m) => ({ default: m.AdminTeachersPage })))
const AdminTeacherPage = lazy(() => import('@/features/admin/AdminPages').then((m) => ({ default: m.AdminTeacherPage })))
const AdminQuizPage = lazy(() => import('@/features/admin/AdminPages').then((m) => ({ default: m.AdminQuizPage })))
const ReportPage = lazy(() => import('@/features/analytics/ReportPage').then((m) => ({ default: m.ReportPage })))
import { JoinPage } from '@/features/student/JoinPage'
import { PlayPage } from '@/features/student/PlayPage'

function Root() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/join', element: <JoinPage /> },
      { path: '/play/:sessionId', element: <PlayPage /> },
      {
        path: '/host/:id',
        element: (
          <RequireTeacher>
            <HostPage />
          </RequireTeacher>
        ),
      },
      {
        path: '/app/analytics/:id/report',
        element: (
          <RequireTeacher>
            <ReportPage />
          </RequireTeacher>
        ),
      },
      {
        path: '/app',
        element: (
          <RequireTeacher>
            <TeacherLayout />
          </RequireTeacher>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'quizzes', element: <QuizListPage /> },
          { path: 'quizzes/new', element: <QuizEditorPage /> },
          { path: 'quizzes/:id', element: <QuizEditorPage /> },
          { path: 'launch', element: <LaunchPage /> },
          { path: 'sessions', element: <SessionsPage /> },
          { path: 'analytics', element: <AnalyticsIndexPage /> },
          { path: 'analytics/:id', element: <SessionResultsPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'admin', element: <AdminTeachersPage /> },
          { path: 'admin/teachers/:id', element: <AdminTeacherPage /> },
          { path: 'admin/quizzes/:id', element: <AdminQuizPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />
  return <RouterProvider router={router} />
}
