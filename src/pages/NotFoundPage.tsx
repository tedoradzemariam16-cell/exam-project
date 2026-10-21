import { ButtonLink } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <p className="mt-6 text-6xl font-extrabold text-brand-700">404</p>
      <h1 className="text-xl font-bold text-slate-900">გვერდი ვერ მოიძებნა</h1>
      <p className="text-slate-600">ბმული შესაძლოა არასწორია ან გვერდი წაშლილია.</p>
      <ButtonLink to="/">მთავარ გვერდზე დაბრუნება</ButtonLink>
    </main>
  )
}
