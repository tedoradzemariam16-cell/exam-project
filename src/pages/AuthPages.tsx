import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { toGeorgianMessage } from '@/lib/errors'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10">
      <main className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-raised sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          მოსწავლე ხართ?{' '}
          <Link to="/join" className="font-semibold text-brand-700 hover:underline">
            შედით თამაშში კოდით
          </Link>
        </p>
      </main>
    </div>
  )
}

const emailSchema = z.string().trim().email('შეიყვანეთ სწორი ელფოსტა')

type Errors = Partial<Record<'email' | 'password' | 'fullName' | 'confirm', string>>

export function LoginPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session && profile) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    const em = emailSchema.safeParse(email)
    if (!em.success) next.email = em.error.issues[0].message
    if (!password) next.password = 'შეიყვანეთ პაროლი'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setFormError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setFormError(toGeorgianMessage(error))
    else navigate(from, { replace: true })
  }

  return (
    <AuthShell title="მასწავლებლის შესვლა" subtitle="შედით თქვენს ანგარიშზე ქვიზების სამართავად.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="ელფოსტა" error={errors.email} required>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="პაროლი" error={errors.password} required>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">
            დაგავიწყდათ პაროლი?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          შესვლა
        </Button>
        <p className="text-center text-sm text-slate-600">
          ანგარიში არ გაქვთ?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            დარეგისტრირდით
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)

  if (session && profile) return <Navigate to="/app" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    if (fullName.trim().length < 2) next.fullName = 'შეიყვანეთ სახელი და გვარი'
    if (fullName.trim().length > 120) next.fullName = 'მაქსიმუმ 120 სიმბოლო'
    const em = emailSchema.safeParse(email)
    if (!em.success) next.email = em.error.issues[0].message
    if (password.length < 8) next.password = 'პაროლი უნდა შედგებოდეს მინიმუმ 8 სიმბოლოსგან'
    if (confirm !== password) next.confirm = 'პაროლები არ ემთხვევა'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setFormError(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/app` },
    })
    setLoading(false)
    if (error) {
      setFormError(toGeorgianMessage(error))
    } else if (!data.session) {
      setNeedsConfirmation(true)
    } else {
      navigate('/app', { replace: true })
    }
  }

  if (needsConfirmation) {
    return (
      <AuthShell title="დაადასტურეთ ელფოსტა" subtitle="რეგისტრაცია თითქმის დასრულებულია.">
        <Alert tone="success" title="წერილი გაგზავნილია">
          გახსენით წერილი, რომელიც გამოგიგზავნეთ მისამართზე <strong>{email}</strong>, და დააჭირეთ დადასტურების
          ბმულს. შემდეგ შეგიძლიათ შეხვიდეთ სისტემაში.
        </Alert>
        <Link to="/login" className="mt-5 inline-block font-semibold text-brand-700 hover:underline">
          შესვლის გვერდზე დაბრუნება
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="მასწავლებლის რეგისტრაცია" subtitle="უფასო ანგარიში ქვიზების შესაქმნელად და ანალიტიკისთვის.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="სახელი და გვარი" error={errors.fullName} required>
          <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="ელფოსტა" error={errors.email} required>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="პაროლი" hint="მინიმუმ 8 სიმბოლო" error={errors.password} required>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="გაიმეორეთ პაროლი" error={errors.confirm} required>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          ანგარიშის შექმნა
        </Button>
        <p className="text-center text-sm text-slate-600">
          უკვე გაქვთ ანგარიში?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            შესვლა
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const em = emailSchema.safeParse(email)
    if (!em.success) {
      setError(em.error.issues[0].message)
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/app/settings?recovery=1`,
    })
    setLoading(false)
    if (err) setError(toGeorgianMessage(err))
    else setSent(true)
  }

  return (
    <AuthShell title="პაროლის აღდგენა" subtitle="გამოგიგზავნით ბმულს ახალი პაროლის დასაყენებლად.">
      {sent ? (
        <Alert tone="success" title="შეამოწმეთ ელფოსტა">
          თუ ეს მისამართი რეგისტრირებულია, მიიღებთ წერილს აღდგენის ბმულით.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="ელფოსტა" error={error} required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            ბმულის გაგზავნა
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-brand-700 hover:underline">
        შესვლის გვერდზე დაბრუნება
      </Link>
    </AuthShell>
  )
}
