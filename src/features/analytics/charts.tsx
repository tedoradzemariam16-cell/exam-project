import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, CheckCircle2, CircleHelp, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPercent } from '@/lib/format'
import { AnswerBadge } from '@/features/game/AnswerShape'
import { optionLabel } from '@/features/game/answerStyles'
import type { GroupStat, Mastery, QuestionStat } from './compute'

// Chart colours (validated with the dataviz palette checker; see README).
const BRAND = '#3448de'
const GRID = '#e2e8f0'
const AXIS = '#64748b'
/** Answer colours for chart marks — amber darkened for contrast on white. */
const ANSWER_CHART_COLORS = ['#d4382c', '#2563eb', '#c27d00', '#15803d']

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: { value: number; payload: Record<string, unknown> }[]
  label?: string | number
  formatter: (v: number, p: Record<string, unknown>) => string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-raised">
      <p className="font-semibold text-slate-900">{String(p.payload.tooltipTitle ?? label)}</p>
      <p className="text-slate-600">{formatter(p.value, p.payload)}</p>
    </div>
  )
}

/** Correct-answer rate per question (single series — no legend needed). */
export function QuestionCorrectChart({ questions }: { questions: QuestionStat[] }) {
  const data = questions.map((q) => ({
    name: `${q.position + 1}`,
    value: q.correctRate === null ? 0 : Math.round(q.correctRate * 100),
    tooltipTitle: `კითხვა ${q.position + 1}: ${q.text.length > 60 ? `${q.text.slice(0, 60)}…` : q.text}`,
    responses: q.responses,
  }))
  return (
    <div className="h-64 w-full" role="img" aria-label="სწორი პასუხების პროცენტი თითოეულ კითხვაზე. დეტალები ცხრილშია.">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            content={
              <ChartTooltip formatter={(v, p) => `სწორი: ${v}% · ${p.responses as number} პასუხი`} />
            }
          />
          <Bar dataKey="value" fill={BRAND} maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ScoreHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="ქულების განაწილება მოსწავლეებს შორის">
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            content={<ChartTooltip formatter={(v) => `${v} მოსწავლე`} />}
          />
          <Bar dataKey="count" fill={BRAND} maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TrendChart({ points }: { points: { label: string; value: number; title: string }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="სწორი პასუხების პროცენტი სესიების მიხედვით, დროის მიხედვით">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 12, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
            content={<ChartTooltip formatter={(v) => `სწორი პასუხები: ${v}%`} />}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={BRAND}
            strokeWidth={2}
            dot={{ r: 4, fill: BRAND, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Four horizontal bars, one per option. Letter + shape label each bar (never colour alone). */
export function OptionDistribution({ q }: { q: QuestionStat }) {
  const max = Math.max(1, ...q.distribution)
  return (
    <ul className="space-y-2">
      {q.options.map((opt, i) => {
        const count = q.distribution[i]
        const share = q.responses ? count / q.responses : 0
        const correct = i === q.correctIndex
        return (
          <li key={i} className="grid grid-cols-[auto_1fr] items-center gap-3">
            <AnswerBadge index={i} className="size-7" />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cn('min-w-0 truncate', correct ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                  <span className="sr-only">პასუხი {optionLabel(i)}: </span>
                  {opt}
                  {correct && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-green-800">
                      <CheckCircle2 className="size-3.5" aria-hidden /> სწორი
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-slate-600 tabular-nums">
                  {count} · {formatPercent(q.responses ? share : null)}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full"
                  style={{
                    width: `${(count / max) * 100}%`,
                    minWidth: count > 0 ? 6 : 0,
                    backgroundColor: ANSWER_CHART_COLORS[i],
                  }}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const MASTERY_META: Record<Mastery, { label: string; tone: string; bar: string; Icon: typeof CheckCircle2 }> = {
  strong: { label: 'კარგად ათვისებული', tone: 'bg-green-50 text-green-800 ring-green-200', bar: '#15803d', Icon: CheckCircle2 },
  developing: { label: 'ნაწილობრივ ათვისებული', tone: 'bg-amber-50 text-amber-900 ring-amber-200', bar: '#c27d00', Icon: TrendingUp },
  weak: { label: 'საჭიროებს გამეორებას', tone: 'bg-red-50 text-red-800 ring-red-200', bar: '#d4382c', Icon: AlertTriangle },
  insufficient: { label: 'მონაცემები არასაკმარისია', tone: 'bg-slate-100 text-slate-700 ring-slate-200', bar: '#94a3b8', Icon: CircleHelp },
}

/** Mastery per objective/topic: status shown with icon + label + bar. */
export function MasteryList({ groups, emptyText }: { groups: GroupStat[]; emptyText: string }) {
  if (groups.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>
  return (
    <ul className="space-y-4">
      {groups.map((g) => {
        const m = MASTERY_META[g.mastery]
        return (
          <li key={g.name}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{g.name}</p>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', m.tone)}>
                <m.Icon className="size-3.5" aria-hidden /> {m.label}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full"
                  style={{ width: `${(g.correctRate ?? 0) * 100}%`, backgroundColor: m.bar }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm text-slate-700 tabular-nums">
                {formatPercent(g.correctRate)} ({g.correct}/{g.responses})
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {g.questionCount} კითხვა · კითხვები: {g.questionPositions.map((p) => p + 1).join(', ')}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
