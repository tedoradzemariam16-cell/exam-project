import { Settings } from 'lucide-react'
import { Logo } from './Logo'

/** Shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not configured. */
export function ConfigMissing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <Logo />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <div className="flex items-center gap-2 text-lg font-bold">
          <Settings className="size-5" aria-hidden /> საჭიროა კონფიგურაცია
        </div>
        <p className="mt-2 leading-relaxed">
          აპლიკაციას ჯერ არ აქვს Supabase-ის მისამართი და საჯარო გასაღები. შექმენით ფაილი{' '}
          <code className="rounded bg-white px-1.5 py-0.5">.env.local</code> (ნიმუშია{' '}
          <code className="rounded bg-white px-1.5 py-0.5">.env.example</code>) და მიუთითეთ:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100">
          {`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...`}
        </pre>
        <p className="mt-3 text-sm">
          Vercel-ზე იგივე ცვლადები დაამატეთ Project Settings → Environment Variables განყოფილებაში. დეტალური
          ინსტრუქცია იხილეთ README ფაილში.
        </p>
      </div>
    </main>
  )
}
