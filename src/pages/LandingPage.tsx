import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, BrainCircuit, FileText, Gamepad2, ShieldCheck, Timer } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/SiteFooter'
import { Button, ButtonLink } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthProvider'
import { ANSWER_STYLES } from '@/features/game/answerStyles'

const FEATURES = [
  {
    icon: BrainCircuit,
    title: 'AI კითხვები თქვენი მიზნებით',
    text: 'Gemini ქმნის კითხვებს საგნის, კლასის, სასწავლო მიზნისა და თქვენი მასალის მიხედვით. გამოქვეყნებამდე ყველაფერს თქვენ ამოწმებთ.',
  },
  {
    icon: FileText,
    title: 'PDF, DOCX და TXT მასალა',
    text: 'ტექსტი ამოიღება თქვენსავე ბრაუზერში — სრული ფაილი არსად იტვირთება.',
  },
  {
    icon: Gamepad2,
    title: 'ცოცხალი თამაში კლასში',
    text: 'მოსწავლეები შედიან 6-ნიშნა კოდით, ანგარიშის გარეშე. ქულები სისწრაფეზეც არის დამოკიდებული.',
  },
  {
    icon: Timer,
    title: 'თანაბარი დრო ყველასთვის',
    text: 'ყველა მოსწავლეს პასუხისთვის ერთნაირი დრო აქვს. დროის ამოწურვის შემდეგ პასუხი აღარ მიიღება, თითო კითხვაზე კი მხოლოდ ერთხელ შეიძლება პასუხის გაცემა.',
  },
  {
    icon: BarChart3,
    title: 'სწავლის ანალიტიკა',
    text: 'გავრცელებული შეცდომები, სუსტი თემები და მიზნები, რომლებიც დამატებით მუშაობას საჭიროებს.',
  },
  {
    icon: ShieldCheck,
    title: 'მონაცემთა დაცვა',
    text: 'ინახება მხოლოდ მოსწავლის სახელი და გვარი. მასწავლებელი ხედავს მხოლოდ საკუთარ მონაცემებს.',
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const join = (e: FormEvent) => {
    e.preventDefault()
    const clean = code.replace(/\D/g, '')
    if (clean.length !== 6) {
      setError('შეიყვანეთ 6-ციფრიანი კოდი')
      return
    }
    navigate(`/join?code=${clean}`)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 sm:gap-4 sm:px-6">
        <Logo />
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="მთავარი ნავიგაცია">
          {/* Always both links; a signed-in teacher is sent on to the dashboard from /login. */}
          <ButtonLink to="/login" variant="ghost" size="sm" className="sm:h-11 sm:px-4 sm:text-[0.95rem]">
            შესვლა
          </ButtonLink>
          <ButtonLink to="/register" size="sm" className="sm:h-11 sm:px-4 sm:text-[0.95rem]">
            რეგისტრაცია
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-20">
            <div>
              <p className="inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-800 ring-1 ring-brand-200">
                ქართულენოვანი საგანმანათლებლო პლატფორმა
              </p>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl">
                ინტერაქტიული ქვიზები, რომლებიც <span className="text-brand-700">სწავლის მიზნებს</span> ემსახურება
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                შექმენით კითხვები AI-ის დახმარებით, ჩაატარეთ ცოცხალი თამაში კლასში და მიიღეთ ანალიტიკა, რომელიც
                გაჩვენებთ, რა ესმით მოსწავლეებს კარგად და რა საჭიროებს გამეორებას.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink to={session && profile ? '/app/quizzes/new' : '/register'} size="lg">
                  ქვიზის შექმნა
                </ButtonLink>
                <ButtonLink to="/login" size="lg" variant="secondary">
                  მასწავლებლის შესვლა
                </ButtonLink>
              </div>
            </div>

            <div className="rounded-3xl bg-brand-900 p-6 text-white shadow-raised sm:p-8">
              <h2 className="text-xl font-bold">მოსწავლე ხარ? შემოუერთდი თამაშს</h2>
              <p className="mt-1 text-brand-100">შეიყვანე კოდი, რომელსაც მასწავლებელი ეკრანზე გაჩვენებს.</p>
              <form onSubmit={join} className="mt-6 space-y-3" noValidate>
                <label htmlFor="landing-code" className="sr-only">
                  თამაშის კოდი
                </label>
                <input
                  id="landing-code"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="000 000"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setError(null)
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'landing-code-error' : undefined}
                  className="h-16 w-full rounded-2xl border-0 bg-white px-5 text-center text-3xl font-bold tracking-[0.3em] text-slate-900 placeholder:text-slate-300 focus:ring-4 focus:ring-accent-400 focus:outline-none"
                />
                {error && (
                  <p id="landing-code-error" className="text-sm font-semibold text-accent-400" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" variant="accent" size="lg" className="w-full">
                  შესვლა თამაშში
                </Button>
              </form>
              <div className="mt-6 grid grid-cols-4 gap-2" aria-hidden="true">
                {ANSWER_STYLES.map((s, i) => (
                  <div key={i} className={`flex h-12 items-center justify-center rounded-xl ${s.bg} ${s.text}`}>
                    <s.Icon className="size-5" fill="currentColor" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="features-title">
          <h2 id="features-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            ყველაფერი, რაც გაკვეთილისთვის გჭირდებათ
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 p-6">
                <f.icon className="size-7 text-brand-700" aria-hidden />
                <h3 className="mt-4 font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
