import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  History,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  PlayCircle,
  PlusCircle,
  Settings,
  X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/app', label: 'მთავარი დაფა', icon: LayoutDashboard, end: true },
  { to: '/app/quizzes/new', label: 'ქვიზის შექმნა', icon: PlusCircle, end: true },
  { to: '/app/quizzes', label: 'ჩემი ქვიზები', icon: LibraryBig, end: true },
  { to: '/app/launch', label: 'თამაშის დაწყება', icon: PlayCircle, end: true },
  { to: '/app/sessions', label: 'წარსული სესიები', icon: History, end: true },
  { to: '/app/analytics', label: 'შედეგები და ანალიტიკა', icon: BarChart3, end: false },
  { to: '/app/settings', label: 'ანგარიშის პარამეტრები', icon: Settings, end: true },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.93rem] font-semibold transition-colors',
                isActive ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100',
              )
            }
          >
            <item.icon className="size-5 shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export function TeacherLayout() {
  const { profile, session, signOut } = useAuth()
  const location = useLocation()
  // The mobile menu closes automatically on navigation: it is "open" only
  // for the path where it was opened.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const setOpen = (v: boolean) => setOpenOn(v ? location.pathname : null)

  const userBox = (
    <div className="border-t border-slate-200 p-4">
      <p className="truncate text-sm font-bold text-slate-900">{profile?.full_name || 'მასწავლებელი'}</p>
      <p className="truncate text-xs text-slate-500">{session?.user.email}</p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <LogOut className="size-4" aria-hidden /> გასვლა
      </button>
    </div>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        მთავარ შიგთავსზე გადასვლა
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5">
          <Logo to="/app" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3" aria-label="მასწავლებლის მენიუ">
          <NavItems />
        </nav>
        {userBox}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo to="/app" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
          aria-label="მენიუს გახსნა"
          aria-expanded={open}
        >
          <Menu className="size-6" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-raised">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo to="/app" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="მენიუს დახურვა"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3" aria-label="მასწავლებლის მენიუ">
              <NavItems onNavigate={() => setOpen(false)} />
            </nav>
            {userBox}
          </aside>
        </div>
      )}

      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
