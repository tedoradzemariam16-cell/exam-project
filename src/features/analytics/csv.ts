import { optionLabel } from '@/features/game/answerStyles'
import type { SessionAnalytics } from './compute'
import type { StudentReport } from './students'

/** Quote a CSV cell and neutralise spreadsheet formula injection (=, +, -, @). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 Georgian text correctly.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/** Results per student; with reports, adds the objectives to work on and recommendations. */
export function resultsCsv(a: SessionAnalytics, reports?: StudentReport[]): string {
  const header = [
    'ადგილი',
    'სახელი',
    'გვარი',
    'ქულა',
    'სწორი',
    'გაცემული პასუხი',
    'სიზუსტე (%)',
    ...a.questions.map((q) => `კ${q.position + 1}`),
    ...(reports ? ['სამუშაო მიზნები', 'რეკომენდაცია მასწავლებლისთვის'] : []),
  ]
  const byId = new Map((reports ?? []).map((r) => [r.id, r]))
  const rows = a.participants.map((p) => [
    p.rank,
    p.firstName,
    p.lastName,
    p.score,
    p.correct,
    p.answered,
    p.accuracy === null ? '' : Math.round(p.accuracy * 100),
    ...p.selections.map((sel, i) =>
      sel === null
        ? a.questions[i].asked
          ? 'უპასუხო ✗'
          : '—'
        : `${optionLabel(sel)}${sel === a.questions[i].correctIndex ? ' ✓' : ' ✗'}`,
    ),
    ...(reports
      ? [
          (byId.get(p.id)?.focus ?? []).map((o) => `${o.name} (${o.correct}/${o.total})`).join('; '),
          (byId.get(p.id)?.recommendations ?? []).join(' '),
        ]
      : []),
  ])
  return toCsv([header, ...rows])
}

export function questionsCsv(a: SessionAnalytics): string {
  const header = [
    '№',
    'კითხვა',
    'ქვეთემა',
    'სასწავლო მიზანი',
    'სწორი პასუხი',
    'პასუხები',
    'სწორი (%)',
    'ა',
    'ბ',
    'გ',
    'დ',
    'პასუხის გარეშე',
    'საშ. დრო (წმ)',
  ]
  const rows = a.questions.map((q) => [
    q.position + 1,
    q.text,
    q.topic,
    q.objective,
    `${optionLabel(q.correctIndex)}: ${q.options[q.correctIndex]}`,
    q.responses,
    q.correctRate === null ? '' : Math.round(q.correctRate * 100),
    ...q.distribution,
    q.noAnswer,
    q.averageResponseMs === null ? '' : (q.averageResponseMs / 1000).toFixed(1),
  ])
  return toCsv([header, ...rows])
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 60) || 'results'
}
