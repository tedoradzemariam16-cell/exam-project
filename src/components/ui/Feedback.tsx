import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type AlertTone = 'info' | 'success' | 'warning' | 'error'
const alertStyles: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-brand-50 border-brand-200 text-brand-900', icon: <Info className="size-5 text-brand-700" /> },
  success: {
    box: 'bg-green-50 border-green-200 text-green-900',
    icon: <CheckCircle2 className="size-5 text-green-700" />,
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-950',
    icon: <AlertTriangle className="size-5 text-amber-700" />,
  },
  error: { box: 'bg-red-50 border-red-200 text-red-900', icon: <XCircle className="size-5 text-red-700" /> },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const s = alertStyles[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border p-4 text-sm', s.box, className)}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {s.icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-700">{icon}</div>}
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
