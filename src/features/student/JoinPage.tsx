import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Feedback'
import { enableStudentTestMode, ensureStudentSession, isStudentTestMode } from '@/lib/supabase'
import { toGeorgianMessage } from '@/lib/errors'
import { joinGame } from '@/features/game/api'

type Errors = Partial<Record<'code' | 'first' | 'last', string>>

export function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [code, setCode] = useState(params.get('code')?.replace(/\D/g, '').slice(0, 6) ?? '')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const testMode = params.get('test') === '1' || isStudentTestMode()

  useEffect(() => {
    if (params.get('test') === '1' && !isStudentTestMode()) enableStudentTestMode()
  }, [params])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = code.replace(/\D/g, '')
    const next: Errors = {}
    if (clean.length !== 6) next.code = 'კოდი უნდა შედგებოდეს 6 ციფრისგან'
    if (!first.trim()) next.first = 'შეიყვანეთ სახელი'
    else if (first.trim().length > 50) next.first = 'მაქსიმუმ 50 სიმბოლო'
    if (!last.trim()) next.last = 'შეიყვანეთ გვარი'
    else if (last.trim().length > 50) next.last = 'მაქსიმუმ 50 სიმბოლო'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setFormError(null)
    try {
      const client = await ensureStudentSession()
      const res = await joinGame(client, clean, first.trim(), last.trim())
      navigate(`/play/${res.session_id}`)
    } catch (err) {
      setFormError(toGeorgianMessage(err, 'თამაშში შესვლა ვერ მოხერხდა. სცადეთ თავიდან.'))
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-800 to-brand-950 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="flex justify-center">
          <Logo light />
        </div>
        <main className="mt-8 rounded-3xl bg-white p-6 shadow-raised sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">თამაშში შესვლა</h1>
          <p className="mt-1 text-sm text-slate-600">შეიყვანეთ კოდი, რომელსაც მასწავლებელი გაჩვენებთ, და თქვენი სახელი.</p>
          {testMode && (
            <Alert tone="info" className="mt-4" title="სატესტო რეჟიმი">
              <span className="inline-flex items-center gap-1">
                <FlaskConical className="size-4" aria-hidden /> ამ ჩანართში ცალკე მოსწავლე იქნება.
              </span>
            </Alert>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}
            <Field label="თამაშის კოდი" error={errors.code} required>
              <Input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="h-14 text-center font-mono text-2xl font-bold tracking-[0.3em]"
                placeholder="000000"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="სახელი" error={errors.first} required>
                <Input autoComplete="given-name" maxLength={50} value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
              <Field label="გვარი" error={errors.last} required>
                <Input autoComplete="family-name" maxLength={50} value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" variant="accent" size="lg" className="w-full" loading={loading}>
              შესვლა
            </Button>
          </form>
          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            ინახება მხოლოდ თქვენი სახელი, გვარი და პასუხები ამ თამაშისთვის. მათ ხედავს მხოლოდ თქვენი მასწავლებელი.
          </p>
        </main>
        <p className="mt-6 text-center text-sm text-brand-200">
          <Link to="/" className="hover:text-white hover:underline">მთავარ გვერდზე დაბრუნება</Link>
        </p>
      </div>
    </div>
  )
}
