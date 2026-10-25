import { useId } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Lightbulb, Target, UserRound, Users, XCircle } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { AnswerBadge } from '@/features/game/AnswerShape'
import {
  describeObjectiveGroup,
  type ObjectiveGroup,
  type ObjectiveStatus,
  type StudentReport,
} from './students'

const STATUS_META: Record<ObjectiveStatus, { label: string; tone: 'green' | 'amber' | 'red'; bar: string }> = {
  mastered: { label: 'ათვისებულია', tone: 'green', bar: '#15803d' },
  partial: { label: 'ნაწილობრივ', tone: 'amber', bar: '#c27d00' },
  needs_work: { label: 'სამუშაოა', tone: 'red', bar: '#d4382c' },
}

/** Class view: for each objective, who needs work and whether it is class-wide. */
export function ClassGroupsCard({
  groups,
  classSize,
  onSelectStudent,
}: {
  groups: ObjectiveGroup[]
  classSize: number
  onSelectStudent: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader
        icon={<Users className="size-5" />}
        title="ვის რა სჭირდება — შუალედური მიზნების მიხედვით"
        description="კლასის საერთო სურათი: რა უჭირს უმეტესობას და რა — მხოლოდ ცალკეულ მოსწავლეებს."
      />
      <CardBody>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">კითხვებს სასწავლო მიზნები არ აქვს მიბმული, ამიტომ დაჯგუფება შეუძლებელია.</p>
        ) : (
          <ul className="space-y-4">
            {groups.map((g) => (
              <li
                key={g.objective}
                className={cn(
                  'rounded-xl border p-4',
                  g.scope === 'class' ? 'border-red-200 bg-red-50/60' : g.scope === 'group' ? 'border-amber-200 bg-amber-50/60' : 'border-green-200 bg-green-50/50',
                )}
              >
                <p className="flex items-start gap-2 text-sm font-semibold text-slate-900">
                  {g.scope === 'class' ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden />
                  ) : g.scope === 'group' ? (
                    <Target className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden />
                  )}
                  <span>{describeObjectiveGroup(g, classSize)}</span>
                </p>
                {g.needsWork.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {g.needsWork.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelectStudent(s.id)}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:ring-brand-400"
                        title="მოსწავლის ანალიზის ნახვა"
                      >
                        {s.name} · {s.correct}/{s.total}
                      </button>
                    ))}
                  </div>
                )}
                {g.partial.length > 0 && (
                  <p className="mt-2 text-xs text-slate-600">
                    ნაწილობრივ ათვისებული აქვს: {g.partial.map((s) => s.name).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/** One student's analysis (teacher feedback only). */
export function StudentReportView({ report: r, compact }: { report: StudentReport; compact?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{r.name}</h3>
          <p className="text-sm text-slate-500">
            {r.rank} ადგილი · {formatNumber(r.score)} ქულა · სწორი {r.correct}/{r.total}
            {r.unanswered.length > 0 && ` · უპასუხოდ ${r.unanswered.length} (შეცდომად)`}
          </p>
        </div>
        {r.focus.length === 0 && r.answered > 0 ? (
          <Badge tone="green">
            <CheckCircle2 className="size-3" aria-hidden /> სამუშაო საკითხი არ აქვს
          </Badge>
        ) : (
          r.focus.length > 0 && <Badge tone="amber">სამუშაო: {r.focus.length} მიზანი</Badge>
        )}
      </div>

      <p className="rounded-xl bg-brand-50 p-4 text-sm leading-relaxed text-brand-950">{r.summary}</p>

      {r.objectives.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold text-slate-800">შუალედური მიზნები</h4>
          <ul className="space-y-3">
            {r.objectives.map((o) => {
              const m = STATUS_META[o.status]
              return (
                <li key={o.name}>
                  <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 text-slate-800">{o.name}</span>
                    <Badge tone={m.tone}>
                      {m.label}
                      {o.limited && ' · 1 კითხვა'}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full" style={{ width: `${o.rate * 100}%`, backgroundColor: m.bar, minWidth: o.correct ? 6 : 0 }} />
                    </div>
                    <span className="w-14 text-right text-xs text-slate-600 tabular-nums">
                      {o.correct}/{o.total}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {r.mistakes.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold text-slate-800">შეცდომები</h4>
          <ul className="space-y-3">
            {r.mistakes.map((m) => (
              <li key={m.position} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-900">
                  <span className="text-brand-700">{m.position + 1}.</span> {m.question}
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <p className="flex items-center gap-2 text-red-800">
                    <XCircle className="size-4 shrink-0" aria-hidden />
                    <AnswerBadge index={m.chosenIndex} className="size-5" />
                    <span>
                      <span className="sr-only">აირჩია: </span>
                      {m.chosenText}
                    </span>
                  </p>
                  <p className="flex items-center gap-2 text-green-800">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                    <AnswerBadge index={m.correctIndex} className="size-5" />
                    <span>
                      <span className="sr-only">სწორი პასუხი: </span>
                      {m.correctText}
                    </span>
                  </p>
                </div>
                {m.note && (
                  <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-2 text-amber-950">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                    <span>
                      <strong>რატომ შეცდა:</strong> {m.note}
                    </span>
                  </p>
                )}
                {!compact && (m.objective || m.topic) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {[m.objective && `მიზანი: ${m.objective}`, m.topic && `ქვეთემა: ${m.topic}`].filter(Boolean).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.missed.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold text-slate-800">უპასუხოდ დარჩა — დრო ამოიწურა</h4>
          <ul className="space-y-3">
            {r.missed.map((m) => (
              <li key={m.position} className="rounded-xl border border-dashed border-slate-300 p-3 text-sm">
                <p className="font-semibold text-slate-900">
                  <span className="text-brand-700">{m.position + 1}.</span> {m.question}
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <p className="flex items-center gap-2 text-slate-600">
                    <Clock className="size-4 shrink-0" aria-hidden />
                    <span>პასუხი არ აურჩევია</span>
                  </p>
                  <p className="flex items-center gap-2 text-green-800">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                    <AnswerBadge index={m.correctIndex} className="size-5" />
                    <span>
                      <span className="sr-only">სწორი პასუხი: </span>
                      {m.correctText}
                    </span>
                  </p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  ვერ მოასწრო ან არ იცოდა — შეფასებაში შეცდომად ითვლება.
                  {!compact && m.objective && ` მიზანი: ${m.objective}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.recommendations.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold text-slate-800">რეკომენდაციები მასწავლებლისთვის</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {r.recommendations.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Student picker + report. */
export function StudentAnalysisSection({
  reports,
  selectedId,
  onSelect,
}: {
  reports: StudentReport[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const selectId = useId()
  const selected = reports.find((r) => r.id === selectedId) ?? reports[0]
  if (!selected) return null
  return (
    <Card id="student-analysis" className="scroll-mt-6">
      <CardHeader
        icon={<UserRound className="size-5" />}
        title="თითოეული მოსწავლის ანალიზი"
        description="რა შეცდომები დაუშვა, რომელი შუალედური მიზანი გაუჭირდა და რაზე აქვს სამუშაო. ხედავს მხოლოდ მასწავლებელი."
      />
      <CardBody className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <div className="lg:hidden">
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-slate-800">
            მოსწავლე
          </label>
          <Select id={selectId} value={selected.id} onChange={(e) => onSelect(e.target.value)}>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.correct}/{r.total}
              </option>
            ))}
          </Select>
        </div>
        <ul className="hidden max-h-[36rem] space-y-1 overflow-y-auto pr-1 lg:block" aria-label="მოსწავლეები">
          {reports.map((r) => {
            const active = r.id === selected.id
            const needs = r.focus.filter((o) => o.status === 'needs_work').length
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    active ? 'bg-brand-700 text-white' : 'hover:bg-slate-100',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className={cn('text-xs tabular-nums', active ? 'text-brand-100' : 'text-slate-500')}>
                    {r.correct}/{r.total}
                  </span>
                  {r.answered === 0 ? (
                    <CircleDashed className={cn('size-4', active ? 'text-white' : 'text-slate-400')} aria-label="პასუხები არ არის" />
                  ) : needs > 0 ? (
                    <AlertTriangle className={cn('size-4', active ? 'text-white' : 'text-red-600')} aria-label={`სამუშაოა ${needs} მიზანზე`} />
                  ) : (
                    <CheckCircle2 className={cn('size-4', active ? 'text-white' : 'text-green-600')} aria-label="სამუშაო მიზანი არ აქვს" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <div aria-live="polite">
          <StudentReportView report={selected} />
        </div>
      </CardBody>
    </Card>
  )
}
