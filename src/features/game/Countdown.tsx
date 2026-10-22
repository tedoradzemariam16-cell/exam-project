import { cn } from '@/lib/cn'

/** Circular countdown. `remaining` and `total` are in milliseconds. */
export function Countdown({
  remaining,
  total,
  size = 'md',
  paused,
}: {
  remaining: number
  total: number
  size?: 'md' | 'lg'
  paused?: boolean
}) {
  const seconds = Math.ceil(remaining / 1000)
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const r = 44
  const c = 2 * Math.PI * r
  const urgent = seconds <= 5 && remaining > 0
  return (
    <div
      className={cn('relative shrink-0', size === 'lg' ? 'size-32' : 'size-20')}
      role="timer"
      aria-live="off"
      aria-label={paused ? `შეჩერებულია, დარჩა ${seconds} წამი` : `დარჩა ${seconds} წამი`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="white" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? '#dc2626' : paused ? '#94a3b8' : '#2742c4'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center font-bold tabular-nums',
          size === 'lg' ? 'text-4xl' : 'text-2xl',
          urgent ? 'text-red-600' : 'text-slate-900',
        )}
      >
        {seconds}
      </span>
    </div>
  )
}
