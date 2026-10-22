const GEORGIAN_MONTHS = [
  'იანვარი',
  'თებერვალი',
  'მარტი',
  'აპრილი',
  'მაისი',
  'ივნისი',
  'ივლისი',
  'აგვისტო',
  'სექტემბერი',
  'ოქტომბერი',
  'ნოემბერი',
  'დეკემბერი',
]

const pad = (n: number) => String(n).padStart(2, '0')

/** "21 ოქტომბერი 2026, 14:05" — formatted manually so it does not depend on browser locale data. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${GEORGIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${GEORGIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** 12345 → "12 345" */
export function formatNumber(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} წმ`
}

export const DIFFICULTY_LABEL = { easy: 'მარტივი', medium: 'საშუალო', hard: 'რთული' } as const
export const QUIZ_STATUS_LABEL = { draft: 'მონახაზი', published: 'გამოქვეყნებული', archived: 'დაარქივებული' } as const
export const SESSION_STATUS_LABEL = { lobby: 'მოსაცდელი', active: 'მიმდინარე', finished: 'დასრულებული' } as const

export const OPTION_LETTERS = ['ა', 'ბ', 'გ', 'დ'] as const
