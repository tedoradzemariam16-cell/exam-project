import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = Date.now() + Math.random()
      setItems((all) => [...all.slice(-3), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'animate-pop-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-raised',
              t.tone === 'error' ? 'border-red-200' : t.tone === 'success' ? 'border-green-200' : 'border-slate-200',
            )}
          >
            {t.tone === 'success' && <CheckCircle2 className="size-5 shrink-0 text-green-700" aria-hidden />}
            {t.tone === 'error' && <XCircle className="size-5 shrink-0 text-red-700" aria-hidden />}
            {t.tone === 'info' && <Info className="size-5 shrink-0 text-brand-700" aria-hidden />}
            <p className="flex-1 text-slate-800">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-1 rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label="შეტყობინების დახურვა"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
