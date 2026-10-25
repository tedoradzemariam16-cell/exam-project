import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { EMBLEM, SCHOOL_NAVY, SCHOOL_ORANGE, WORDMARK_EMBLEM, WORDMARK_LETTERS } from './logoPaths'

/** Square icon: the school's orange emblem on a white tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden="true">
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15" fill="#fff" stroke="#e2e8f0" strokeWidth="1.5" />
      <g transform="translate(32 33) scale(0.28) translate(-326 -92.5)">
        <path fill={SCHOOL_ORANGE} d={EMBLEM} />
      </g>
    </svg>
  )
}

/** The school's "თაობა" wordmark, in its original colours. */
export function SchoolWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="15 15 562 166" className={cn('h-8 w-auto', className)} aria-hidden="true">
      <path fill={SCHOOL_NAVY} fillRule="evenodd" d={WORDMARK_LETTERS} />
      <path fill={SCHOOL_ORANGE} fillRule="evenodd" d={WORDMARK_EMBLEM} />
    </svg>
  )
}

/**
 * Site logo: school wordmark + orange "ქვიზი" tag, always on white.
 * On dark screens (`light`) it sits on a white rounded plate.
 */
export function Logo({ to = '/', light, className }: { to?: string; light?: boolean; className?: string }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-2 rounded-xl', light && 'bg-white px-3 py-1.5 shadow-sm', className)}
      aria-label="თაობა ქვიზი — მთავარი"
    >
      <SchoolWordmark className="h-8" />
      <span className="rounded-full px-2.5 py-0.5 text-sm font-extrabold" style={{ backgroundColor: SCHOOL_ORANGE, color: SCHOOL_NAVY }}>
        ქვიზი
      </span>
    </Link>
  )
}
