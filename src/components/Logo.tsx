import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#2742c4" />
      <path d="M18 22h28v6H35v18h-6V28H18z" fill="#fff" />
      <circle cx="46" cy="44" r="5" fill="#f5a524" />
    </svg>
  )
}

export function Logo({ to = '/', light }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 rounded-lg" aria-label="თაობა ქვიზი — მთავარი">
      <LogoMark />
      <span className={cn('text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-slate-900')}>
        თაობა <span className={light ? 'text-accent-400' : 'text-brand-700'}>ქვიზი</span>
      </span>
    </Link>
  )
}
